"""Watch the newest run room live via Band (merged agent contexts). Read-only.

Usage: PYTHONUTF8=1 .venv/Scripts/python scripts/watch_room.py [--once]
Finds the Stage Manager's most recent chat and streams new entries to stdout.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from common.band_client import agent_credentials  # noqa: E402
from common.rooms import AgentRooms  # noqa: E402

PLAYERS = ["bandleader", "scout", "code_scanner", "dependencies", "secrets_config",
           "compliance_mapper", "stage_manager"]


async def newest_chat(sm: AgentRooms) -> str:
    r = await sm._client.get("/chats", params={"page_size": 5})
    r.raise_for_status()
    chats = r.json()["data"]
    return sorted(chats, key=lambda c: c.get("inserted_at", ""))[-1]["id"]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--chat-id", default=None)
    args = ap.parse_args()

    rooms = {n: AgentRooms(agent_credentials(n)[1]) for n in PLAYERS}
    chat_id = args.chat_id or await newest_chat(rooms["stage_manager"])
    print(f"WATCHING room {chat_id}", flush=True)

    printed: set[str] = set()
    while True:
        seen: dict[str, dict] = {}
        for r in rooms.values():
            try:
                for m in await r.context(chat_id, page_size=100):
                    seen[m["id"]] = m
            except Exception:
                continue
        for m in sorted(seen.values(), key=lambda x: x.get("inserted_at", "")):
            if m["id"] in printed:
                continue
            printed.add(m["id"])
            print(f"[{m.get('message_type','?'):^9}] {m.get('sender_name','?')}: "
                  f"{str(m.get('content'))[:120]}", flush=True)
        if args.once:
            break
        await asyncio.sleep(8)


if __name__ == "__main__":
    asyncio.run(main())
