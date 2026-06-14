"""P3 minimal remediation test — Fixer -> Reviewer -> human approval -> PR.

Everything flows through Band. The fix is made on an ISOLATED CLONE of the target
repo (the live working tree is never touched). For the minimal test the target is
Oltking/Soundcheck and the file is the throwaway fixtures/vuln-app/app.py, so the
PR is real but touches nothing real. No PR is opened without your approval in the
room — that's the Control-Plane authority gate.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python scripts/run_remediation.py \
      [--repo-url https://github.com/Oltking/Soundcheck.git] \
      [--file fixtures/vuln-app/app.py] [--room-id <id>] [--timeout 600]

When it pauses for approval, send a message in the Band room that @mentions
Bandleader and contains the word APPROVE (or APPROVED). Anything else / timeout
= declined, no PR.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
logging.basicConfig(level=logging.WARNING,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

from common.band_client import agent_credentials, frontier_llm, heavy_llm, oss_llm  # noqa: E402
from common.rooms import AgentRooms  # noqa: E402
from common.score import Score  # noqa: E402
from fixer import agent as fixer_agent  # noqa: E402
import reviewer as reviewer_agent  # noqa: E402
from fixer.git_pr import audit_pr_body, open_pr  # noqa: E402

WORKSPACE = ROOT / ".workspace"


def clone_target(repo_url: str) -> tuple[Path, str]:
    """Clone the target repo fresh into .workspace. Returns (path, full_name)."""
    WORKSPACE.mkdir(exist_ok=True)
    full = repo_url.rstrip("/").removesuffix(".git").split("github.com/")[-1]
    dest = WORKSPACE / (full.split("/")[-1] + "-remediation")
    if dest.exists():
        import shutil
        shutil.rmtree(dest, ignore_errors=True)
    subprocess.run(["git", "clone", "--depth", "1", repo_url, str(dest)],
                   check=True, capture_output=True, text=True, timeout=300)
    return dest, full


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-url", default="https://github.com/Oltking/Soundcheck.git")
    ap.add_argument("--file", default="fixtures/vuln-app/app.py")
    ap.add_argument("--finding", default="Use of eval() on untrusted user input "
                    "in the /calc route — allows arbitrary code execution.")
    ap.add_argument("--room-id", default=None)
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()

    repo, repo_full = clone_target(args.repo_url)
    print(f"[setup] isolated clone: {repo}  (PRs -> {repo_full})")

    sm_key = agent_credentials("stage_manager")[1]
    sm = AgentRooms(sm_key)
    peers = await sm.peers(page_size=50)
    owner = next(p for p in peers if p.get("type") == "User")
    bl = next(p for p in peers if p.get("name") == "Bandleader")
    fixer_p = next(p for p in peers if p.get("name") == "Fixer")
    reviewer_p = next(p for p in peers if p.get("name") == "Reviewer")

    chat_id = args.room_id or (await sm.create_chat())["id"]

    # shared proposal/review state (the Score still carries the real provenance)
    state: dict = {}
    fixer_score = Score(agent_credentials("fixer")[1], chat_id)
    reviewer_score = Score(agent_credentials("reviewer")[1], chat_id)

    agents = {
        # Fixer on the HEAVY lane (patch quality); Reviewer on a DIFFERENT, cheaper
        # model — genuine cross-model review.
        "fixer": fixer_agent.build(heavy_llm(), repo, fixer_score, state),
        "reviewer": reviewer_agent.build(oss_llm(), reviewer_score, state),
    }
    tasks = [asyncio.create_task(a.run(), name=n) for n, a in agents.items()]
    await asyncio.sleep(10)
    for pid in (fixer_p["id"], reviewer_p["id"], owner["id"]):
        await sm.add_participant(chat_id, pid)
    await asyncio.sleep(3)
    print(f"[room] {chat_id} — Fixer + Reviewer + {owner['name']} joined. Watch at app.band.ai")

    rooms = {n: AgentRooms(agent_credentials(n)[1]) for n in ("fixer", "reviewer", "stage_manager")}

    try:
        # -- dispatch the Fixer with one eligible finding ----------------------
        await sm.send_message(
            chat_id,
            f"@Fixer remediate this finding in `{args.file}` (high confidence, low "
            f"risk, eligible for auto-fix): {args.finding} When your patch is ready, "
            f"hand it to @Reviewer.",
            mentions=[{"id": fixer_p["id"], "name": "Fixer"},
                      {"id": reviewer_p["id"], "name": "Reviewer"}],
        )
        print(f"[dispatch] Fixer assigned the finding at {datetime.now(timezone.utc):%H:%M:%SZ}\n")

        # -- wait for proposal + review ----------------------------------------
        for _ in range(args.timeout // 5):
            await asyncio.sleep(5)
            if state.get("review"):
                break
            if state.get("proposal") and not state.get("_announced"):
                p = state["proposal"]
                print(f"[fixer] patch proposed on {p['branch']} ({len(p['diff'])} chars of diff)")
                state["_announced"] = True
        review = state.get("review")
        proposal = state.get("proposal")
        if not proposal:
            print("[result] Fixer produced no patch (finding may be unsafe to auto-fix). Stopping.")
            return
        if not review:
            print("[result] No review recorded within timeout. Stopping — no PR.")
            return
        print(f"[reviewer] verdict={review['verdict'].upper()} — {review['reasoning'][:120]}")
        if review["verdict"] != "pass":
            print("[result] Reviewer requested revision — not advancing to approval. (loop would repeat)")
            return

        # -- AUTHORITY GATE: ask the human, wait for approval in the room ------
        await sm.send_message(
            chat_id,
            f"@{owner['name']} the patch on `{proposal['branch']}` passed review. "
            f"Reply with APPROVE to authorize opening the PR, or anything else to decline. "
            f"No PR will be opened without your approval.",
            mentions=[{"id": owner["id"], "name": owner["name"]},
                      {"id": bl["id"], "name": "Bandleader"}],
        )
        print(f"\n[approval] WAITING for your approval in room {chat_id}.")
        print("           In the Band UI, reply mentioning Bandleader with the word APPROVE.\n")

        approved = False
        for _ in range(args.timeout // 5):
            await asyncio.sleep(5)
            ctx = await rooms["stage_manager"].context(chat_id, page_size=50)
            human_msgs = [m for m in ctx if m.get("sender_id") == owner["id"]
                          and m.get("message_type") == "text"]
            if human_msgs and "approv" in str(human_msgs[-1].get("content", "")).lower():
                approved = True
                approver_msg = human_msgs[-1]
                break

        if not approved:
            print("[result] No approval received — NO PR opened. Authority gate held.")
            return

        # -- record the Approval memory + open the PR --------------------------
        approved_at = approver_msg.get("inserted_at") or datetime.now(timezone.utc).isoformat()
        await fixer_score.write(
            kind="Approval",
            content=f"Human approved PR for patch {proposal['id']} on {proposal['branch']}",
            thought=f"Conductor {owner['name']} authorized the PR in room {chat_id}.",
            references=[proposal["id"], state["review"]["id"]],
            tags=[f"approver:{owner['name']}"],
        )
        body = audit_pr_body(room_id=chat_id, finding=args.finding,
                             reviewer_verdict=review["reasoning"],
                             approver=owner["name"], approved_at=approved_at)
        url = open_pr(repo_full, proposal["branch"],
                      title=f"Soundcheck: {proposal['summary']}", body=body,
                      base="main", repo_path=repo)
        print(f"\n[PR OPENED] {url}")
        await sm.send_message(
            chat_id,
            f"@{owner['name']} PR opened (awaiting your review, not merged): {url}",
            mentions=[{"id": owner["id"], "name": owner["name"]}],
        )
        print("\nP3 MINIMAL TEST: PASS — Fixer -> Reviewer -> approval -> PR, all through Band.")
    finally:
        for t in tasks:
            t.cancel()
        for a in agents.values():
            try:
                await a.stop()
            except Exception:
                pass
        for r in rooms.values():
            await r.aclose()
        await sm.aclose()
        await fixer_score.aclose()
        await reviewer_score.aclose()


if __name__ == "__main__":
    asyncio.run(main())
