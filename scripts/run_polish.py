"""The Producer's notes — post-session code-polish suggestions.

After a fix is made, the Producer reflects on the patched code and proposes a few
CONCRETE, defensive-only ways to polish it further (a regression test, a type
hint, an edge case, a docstring/guard). Suggestions ONLY — never applied, never
merged; the human decides. Generated on the OSS lane (Featherless) so it never
touches the frontier quota, with a deterministic fallback so it always produces
something. Written to Band as PolishNote memories — governed and replayable.

Usage:
  python scripts/run_polish.py --room-id <id> [--finding ..] [--patch ..]
      [--review ..] [--patch-id ..]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
logging.basicConfig(level=logging.WARNING,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

from common.band_client import agent_credentials, oss_llm  # noqa: E402
from common.rooms import AgentRooms  # noqa: E402
from common.score import Score  # noqa: E402

PROMPT = (
    "You are the Producer in a security-remediation band. A fix was just made and "
    "passed review. Suggest 2 to 4 CONCRETE, defensive-only ways to polish THIS code "
    "further — for example: add a regression test for the fixed path, add type hints, "
    "handle an edge case, add a docstring or input guard. Do NOT propose new features "
    "and NOTHING offensive. Reply ONLY as a JSON array of objects, each with keys "
    '"title" (at most 8 words) and "why" (one sentence).\n\n'
    "Finding fixed: {finding}\nPatch: {patch}\nReviewer note: {review}"
)

DETERMINISTIC = [
    {"title": "Add a regression test",
     "why": "Lock in the fix so the vulnerability cannot silently return."},
    {"title": "Document the safe path",
     "why": "A short docstring on why the guard exists helps the next maintainer."},
]


def parse(text: str) -> list[dict] | None:
    text = (text or "").strip()
    m = re.search(r"\[.*\]", text, re.S)
    if m:
        try:
            arr = json.loads(m.group(0))
            out = [{"title": str(x.get("title", "")).strip()[:80],
                    "why": str(x.get("why", "")).strip()[:200]}
                   for x in arr if isinstance(x, dict) and x.get("title")]
            if out:
                return out[:4]
        except (json.JSONDecodeError, TypeError):
            pass
    # line fallback — strip bullet/number prefixes
    lines = [re.sub(r"^[\d).\-*\s]+", "", ln).strip() for ln in text.splitlines() if ln.strip()]
    out = [{"title": ln[:80], "why": ""} for ln in lines[:4] if ln]
    return out or None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--room-id", required=True)
    ap.add_argument("--finding", default="")
    ap.add_argument("--patch", default="")
    ap.add_argument("--review", default="")
    ap.add_argument("--patch-id", default=None)
    args = ap.parse_args()

    suggestions: list[dict] | None = None
    try:
        llm = oss_llm()
        resp = await llm.ainvoke(PROMPT.format(
            finding=args.finding[:400], patch=args.patch[:600], review=args.review[:400]))
        suggestions = parse(getattr(resp, "content", "") or "")
        print(f"[polish] OSS lane produced {len(suggestions or [])} suggestion(s)")
    except Exception as e:  # noqa: BLE001 — any model/transport failure → fallback
        print(f"[polish] OSS lane unavailable ({type(e).__name__}: {str(e)[:120]}) — using fallback")
    if not suggestions:
        suggestions = DETERMINISTIC

    score = Score(agent_credentials("reviewer")[1], args.room_id)
    sm = AgentRooms(agent_credentials("stage_manager")[1])
    try:
        ids: list[str] = []
        for s in suggestions:
            entry = await score.write(
                kind="PolishNote",
                content=s["title"],
                thought=s["why"] or "Polish suggestion from the Producer.",
                references=[args.patch_id] if args.patch_id else None,
                tags=["polish"],
            )
            ids.append(entry["id"])
            print(f"[polish] note: {s['title']}")
        # narrate the result in the room (visible on the Stage), addressed to the human
        try:
            peers = await sm.peers(page_size=50)
            owner = next((p for p in peers if p.get("type") == "User"), None)
            if owner:
                await sm.send_message(
                    args.room_id,
                    f"@{owner['name']} the Producer left {len(ids)} polish note"
                    f"{'' if len(ids) == 1 else 's'} on the fix — suggestions only, nothing "
                    f"applied. See them in the Encore.",
                    mentions=[{"id": owner["id"], "name": owner["name"]}],
                )
        except Exception:  # noqa: BLE001 — narration is best-effort
            pass
        print(f"[polish] wrote {len(ids)} PolishNote(s) to Band.")
    finally:
        await score.aclose()
        await sm.aclose()


if __name__ == "__main__":
    asyncio.run(main())
