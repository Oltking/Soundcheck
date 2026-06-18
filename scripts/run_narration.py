"""The Emcee's curtain call — an agent-voiced narration of the Encore.

When the set is over, the Emcee steps up to the mic and announces the band's
performance in a warm, playful voice: what the run found, who did what, and
what's still on the setlist. It's flavor on top of the deterministic Encore —
generated on the OSS lane (Featherless) so it never touches the frontier quota,
with a deterministic fallback so the curtain always rises. Written to Band as a
single CurtainCall memory — governed and replayable.

The Emcee narrates ONLY the factual brief it is handed (counts, agent names,
the headline finding). It never invents findings, fixes, or numbers, and is
strictly defensive — no exploit detail.

Usage:
  python scripts/run_narration.py --room-id <id> --brief "<factual summary>"
"""

from __future__ import annotations

import argparse
import asyncio
import logging
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
    "You are the Emcee closing out a live show — except the band is a team of "
    "security-remediation agents and the 'show' was an audit run. In a warm, "
    "playful, theatrical voice, announce the curtain call in 2 to 4 short "
    "sentences. Celebrate the team and name a couple of the players by name. "
    "Use ONLY the facts in the brief below — never invent findings, fixes, or "
    "numbers — and keep it strictly defensive (no exploit detail). No emojis, "
    "no markdown, no lists; just the spoken lines.\n\n"
    "Brief: {brief}"
)


def fallback(brief: str) -> str:
    brief = (brief or "the band did its work").strip().rstrip(".")
    return (f"Ladies and gentlemen, the band has taken its final bow. Tonight: "
            f"{brief}. A round of applause for every player who took the stage — "
            f"the set is done, and the tape is rolling for the record.")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--room-id", required=True)
    ap.add_argument("--brief", default="")
    args = ap.parse_args()

    text: str | None = None
    try:
        llm = oss_llm()
        resp = await llm.ainvoke(PROMPT.format(brief=args.brief[:700]))
        text = (getattr(resp, "content", "") or "").strip()
        # guard against a model that echoes the prompt or returns junk
        if len(text) < 20 or len(text) > 900:
            text = None
        print(f"[narration] OSS lane produced {len(text or '')} chars")
    except Exception as e:  # noqa: BLE001 — any model/transport failure → fallback
        print(f"[narration] OSS lane unavailable ({type(e).__name__}: {str(e)[:120]}) — using fallback")
    if not text:
        text = fallback(args.brief)

    score = Score(agent_credentials("reviewer")[1], args.room_id)
    sm = AgentRooms(agent_credentials("stage_manager")[1])
    try:
        entry = await score.write(
            kind="CurtainCall",
            content=text,
            thought="The Emcee's spoken curtain-call narration (flavor; OSS lane).",
            tags=["narration"],
        )
        print(f"[narration] wrote CurtainCall {entry['id']}")
        try:
            peers = await sm.peers(page_size=50)
            owner = next((p for p in peers if p.get("type") == "User"), None)
            if owner:
                await sm.send_message(
                    args.room_id,
                    f"@{owner['name']} the Emcee took the mic for the curtain call — "
                    f"hear it on the Encore.",
                    mentions=[{"id": owner["id"], "name": owner["name"]}],
                )
        except Exception:  # noqa: BLE001 — narration is best-effort
            pass
    finally:
        await score.aclose()
        await sm.aclose()


if __name__ == "__main__":
    asyncio.run(main())
