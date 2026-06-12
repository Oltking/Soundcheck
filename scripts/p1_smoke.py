"""P1 smoke test — prove data flows through Band end to end (CLAUDE.md working agreement).

What it does, all against the LIVE platform:
  1. Create a chat room (Human API)
  2. Add the Bandleader agent as participant
  3. Start a minimal SDK agent (LangGraphAdapter + frontier model via AI/ML API)
  4. Post "@Bandleader ..." as the human → agent replies through Band
  5. Emit thought/task events (events discipline)
  6. Write a Finding memory with required `thought`, then supersede it (the retake)
  7. Fetch the room's messages (ALL types, Human API) and the memory list — print them

Usage:  .venv/Scripts/python scripts/p1_smoke.py
Needs:  .env + agent_config.yaml (run scripts/register_agents.py first)
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "agents"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.band_human import BandHuman  # noqa: E402
from common.band_client import agent_credentials, create_band_agent, frontier_llm  # noqa: E402
from common.events import RoomEvents  # noqa: E402
from common.ledger import Ledger  # noqa: E402

REPLY_TIMEOUT_S = 120


async def main() -> None:
    human = BandHuman()

    # -- 1. room ------------------------------------------------------------
    chat = await human.create_chat()
    chat_id = chat["id"]
    print(f"[1] room created: {chat_id}")

    # -- 2. add Bandleader ----------------------------------------------------
    bl_id, bl_key = agent_credentials("bandleader")
    await human.add_participant(chat_id, bl_id)
    participants = await human.list_participants(chat_id)
    print(f"[2] participants: {[(p.get('name'), p.get('type')) for p in participants]}")

    # -- 3. start the SDK agent ----------------------------------------------
    from langgraph.checkpoint.memory import InMemorySaver
    from thenvoi.adapters import LangGraphAdapter

    adapter = LangGraphAdapter(
        llm=frontier_llm(),
        checkpointer=InMemorySaver(),
        custom_section=(
            "You are Bandleader, the concertmaster of a security-audit workforce. "
            "This is a connectivity smoke test: when greeted, reply briefly (one line) "
            "via thenvoi_send_message, mentioning the sender."
        ),
    )
    agent = create_band_agent("bandleader", adapter)
    agent_task = asyncio.create_task(agent.run())
    await asyncio.sleep(5)  # let the WS connect + subscribe
    print("[3] Bandleader SDK agent running (WebSocket connected)")

    try:
        # -- 4. human kickoff message ----------------------------------------
        bl = next(p for p in participants if p.get("type") == "Agent")
        mention = {"id": bl["id"], "name": bl["name"]}
        if bl.get("handle"):
            mention["handle"] = bl["handle"]
        sent = await human.send_message(
            chat_id,
            f"@{bl['name']} soundcheck — one-two, one-two. Confirm you can hear us.",
            mentions=[mention],
        )
        print(f"[4] kickoff sent: {sent['id']}")

        # wait for the agent's reply
        reply = None
        for _ in range(REPLY_TIMEOUT_S // 3):
            await asyncio.sleep(3)
            msgs = (await human.list_messages(chat_id, message_type="text", page_size=10))["data"]
            agent_msgs = [m for m in msgs if m.get("sender_type") == "Agent"]
            if agent_msgs:
                reply = agent_msgs[0]
                break
        if not reply:
            raise RuntimeError("no agent reply within timeout — check agent logs above")
        print(f"[4] Bandleader replied: {reply['content']!r}")

        # -- 5. events discipline ----------------------------------------------
        events = RoomEvents(bl_key, chat_id)
        await events.thought("Smoke test: verifying the events channel end to end.")
        await events.task("in_progress", "P1 smoke test running", task="p1-smoke")
        await events.task("done", "P1 smoke test completed", task="p1-smoke")
        await events.aclose()
        print("[5] events emitted: thought + task(in_progress) + task(done)")

        # -- 6. the Score: write + supersede a Finding -------------------------
        ledger = Ledger(bl_key)
        finding = await ledger.write(
            kind="Finding",
            content="SMOKE-TEST finding: placeholder issue in scripts/p1_smoke.py:1 "
                    "(not a real vulnerability).",
            thought="Written by the P1 smoke test to prove the evidence ledger "
                    "(create → supersede chain) works against the live platform.",
            tags=["severity:none", "smoke-test"],
        )
        print(f"[6] Finding memory written: {finding['id']} (status {finding.get('status')})")
        superseded = await ledger.supersede(finding["id"])
        print(f"[6] superseded (the retake): status={superseded.get('status')}")
        mems = await ledger.list(content_query="SMOKE-TEST", page_size=10)
        print(f"[6] ledger list returned {len(mems)} matching entries")
        await ledger.aclose()

        # -- 7. the proof: fetch everything back from Band ---------------------
        all_msgs = (await human.list_messages(chat_id, page_size=50))["data"]
        print(f"\n[7] PROOF — room {chat_id} as Band returns it ({len(all_msgs)} messages, newest first):")
        for m in reversed(all_msgs):
            sender = m.get("sender_name") or m.get("sender_type")
            print(f"    [{m['message_type']:^11}] {sender}: {str(m['content'])[:100]}")

        print("\nP1 SMOKE TEST: PASS — room, routing, reply, events, ledger all live on Band.")
        print(f"Room ID (verifiable in Band UI): {chat_id}")
    finally:
        agent_task.cancel()
        try:
            await agent.stop()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
