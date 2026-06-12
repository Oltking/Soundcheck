"""Shared agent runtime: band_client, ledger (memory), events discipline, base runtime.

P1 builds these modules (spec §12):
- band_client.py  — Agent.create() wiring, model routing (AI/ML API + Featherless)
- ledger.py       — memory create/supersede/list with references (the Score)
- events.py       — the events-discipline helper (tool_call/tool_result/thought/task/error)
"""
