"""Run a full Soundcheck audit — P2 live run.

Flow (everything through Band):
  1. Stage Manager (REST) creates the run room, adds Bandleader + the human owner
  2. All six players start as real SDK agents in this process
  3. Stage Manager posts the kickoff: "@Bandleader audit <target>"
  4. Bandleader posts the Plan, recruits the players it needs (emergent), sequences:
     Scout -> three scanners -> Compliance Mapper -> final summary to the human
  5. We watch live by aggregating every player's room context, and print the
     full transcript + ledger entries at the end

Usage:
  PYTHONUTF8=1 .venv/Scripts/python scripts/run_audit.py [--target fixtures/vuln-app] [--timeout 600]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from common.band_client import agent_credentials, frontier_llm, oss_llm  # noqa: E402
from common.repo_tools import prepare_workspace  # noqa: E402
from common.rooms import AgentRooms  # noqa: E402
from common.score import Score  # noqa: E402

import bandleader  # noqa: E402
import compliance_mapper  # noqa: E402
import scout  # noqa: E402
from scanners import code_scanner, dependencies, secrets_config  # noqa: E402

PLAYERS = ["bandleader", "scout", "code_scanner", "dependencies", "secrets_config",
           "compliance_mapper"]


async def merged_transcript(rooms_by_name: dict[str, AgentRooms], chat_id: str) -> list[dict]:
    """Union of every player's room context (the P4 BFF read-path pattern)."""
    seen: dict[str, dict] = {}
    for rooms in rooms_by_name.values():
        try:
            for m in await rooms.context(chat_id, page_size=100):
                seen[m["id"]] = m
        except Exception:
            continue
    return sorted(seen.values(), key=lambda m: m.get("inserted_at", ""))


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=str(ROOT / "fixtures" / "vuln-app"))
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()

    repo = prepare_workspace(args.target)
    print(f"[setup] target repo: {repo}")

    # -- room: Stage Manager creates, adds Bandleader + the human ------------
    sm_id, sm_key = agent_credentials("stage_manager")
    sm = AgentRooms(sm_key)
    chat = await sm.create_chat()
    chat_id = chat["id"]
    peers = await sm.peers(page_size=50)
    owner = next(p for p in peers if p.get("type") == "User")
    bl = next(p for p in peers if p.get("name") == "Bandleader")
    await sm.add_participant(chat_id, bl["id"])
    await sm.add_participant(chat_id, owner["id"])
    print(f"[room] {chat_id} created — Bandleader + {owner['name']} in. Watch live at app.band.ai")

    # -- build the band -------------------------------------------------------
    def score_for(name: str) -> Score:
        _, key = agent_credentials(name)
        return Score(key, chat_id)

    agents = {
        "bandleader": bandleader.build(frontier_llm()),
        "scout": scout.build(oss_llm(), repo, score_for("scout")),
        "code_scanner": code_scanner.build(oss_llm(), repo, score_for("code_scanner")),
        "dependencies": dependencies.build(oss_llm(), repo, score_for("dependencies")),
        "secrets_config": secrets_config.build(oss_llm(), repo, score_for("secrets_config")),
        "compliance_mapper": compliance_mapper.build(frontier_llm(), score_for("compliance_mapper")),
    }
    tasks = [asyncio.create_task(a.run(), name=n) for n, a in agents.items()]
    await asyncio.sleep(8)
    print(f"[band] {len(agents)} players connected over WebSocket")

    rooms_by_name = {n: AgentRooms(agent_credentials(n)[1]) for n in PLAYERS}

    try:
        # -- kickoff ------------------------------------------------------------
        await sm.send_message(
            chat_id,
            f"@Bandleader the Conductor has connected a repository for a security & "
            f"compliance audit: {repo.name}. Run the full audit and report the "
            f"summary to @{owner['name']} when done.",
            mentions=[{"id": bl["id"], "name": "Bandleader"},
                      {"id": owner["id"], "name": owner["name"]}],
        )
        print(f"[kickoff] sent at {datetime.now(timezone.utc).strftime('%H:%M:%SZ')} — performance underway\n")

        # -- live watch ----------------------------------------------------------
        printed: set[str] = set()
        finale = False
        for tick in range(args.timeout // 5):
            await asyncio.sleep(5)
            transcript = await merged_transcript(rooms_by_name, chat_id)
            for m in transcript:
                if m["id"] in printed:
                    continue
                printed.add(m["id"])
                sender = m.get("sender_name") or "?"
                mtype = m.get("message_type", "?")
                print(f"  [{mtype:^9}] {sender}: {str(m.get('content'))[:110]}")
                if (mtype == "text" and m.get("sender_id") == bl["id"]
                        and owner["name"].split()[0].lower() in str(m.get("content", "")).lower()
                        and tick > 6):
                    finale = True
            if finale:
                break

        # -- proof ----------------------------------------------------------------
        transcript = await merged_transcript(rooms_by_name, chat_id)
        texts = [m for m in transcript if m.get("message_type") == "text"]
        events = [m for m in transcript if m.get("message_type") != "text"]
        ledger = [m for m in events
                  if isinstance(m.get("metadata"), dict) and m["metadata"].get("ledger")]
        print("\n" + "=" * 70)
        print(f"RUN COMPLETE — room {chat_id}")
        print(f"  routed messages (handoffs): {len(texts)}")
        print(f"  events (narration/tasks):   {len(events)}")
        print(f"  ledger entries (the Score): {len(ledger)}")
        kinds: dict[str, int] = {}
        for m in ledger:
            k = m["metadata"]["ledger"].get("kind", "?")
            kinds[k] = kinds.get(k, 0) + 1
        print(f"  by kind: {kinds}")
        print("=" * 70)
        print(f"Open the room in the Band UI to verify: {chat_id}")
    finally:
        for t in tasks:
            t.cancel()
        for a in agents.values():
            try:
                await a.stop()
            except Exception:
                pass
        for r in rooms_by_name.values():
            await r.aclose()
        await sm.aclose()


if __name__ == "__main__":
    asyncio.run(main())
