"""Keep the Customer Service concierge live on a run room so the Conductor can chat.

The BFF launches this on the first question and relays questions into the room via
the Stage Manager (the Human API is gated, so the human can't post directly). This
process just keeps Customer Service subscribed and answering @mentions, then idles
out. Cheap: only Customer Service (DeepSeek-chat) runs here.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python scripts/run_chat.py --room-id <id> [--timeout 900]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from common.band_client import agent_credentials, support_llm  # noqa: E402
from common.rooms import AgentRooms  # noqa: E402

import customer_service  # noqa: E402


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--room-id", required=True)
    ap.add_argument("--question", default=None)  # first question to relay after CS joins
    ap.add_argument("--context", default="")     # run facts CS can answer from
    ap.add_argument("--timeout", type=int, default=900)  # idle window (seconds)
    args = ap.parse_args()

    sm = AgentRooms(agent_credentials("stage_manager")[1])
    peers = await sm.peers(page_size=100)
    cs = next((p for p in peers if p.get("name") == "Customer Service"), None)
    if not cs:
        print("[chat] Customer Service not registered — add it to agent_config.yaml")
        return

    # Start the agent FIRST, then add it to the room: with auto_subscribe off it only
    # subscribes to rooms it joins while running (the live room_added event).
    agent = customer_service.build(support_llm())
    task = asyncio.create_task(agent.run(), name="customer_service")
    await asyncio.sleep(9)  # let the agent connect before it joins the room

    try:
        await sm.add_participant(args.room_id, cs["id"])
    except Exception as e:  # already a participant from a prior session — fine
        print(f"[chat] add_participant: {e}")
    await asyncio.sleep(3)  # let CS receive room_added + subscribe before the question
    print(f"[chat] Customer Service is live on {args.room_id} for {args.timeout}s.")

    # Relay the first question now that CS is subscribed (cold-start path).
    if args.question:
        content = f"@Customer Service the Conductor asks: {args.question}"
        if args.context:
            content += f"\n\n[Run facts you may use: {args.context}]"
        await sm.send_message(
            args.room_id, content,
            mentions=[{"id": cs["id"], "name": "Customer Service"}],
        )

    try:
        await asyncio.sleep(args.timeout)
    finally:
        task.cancel()
        await sm.aclose()
    print("[chat] session ended (idle).")


if __name__ == "__main__":
    asyncio.run(main())
