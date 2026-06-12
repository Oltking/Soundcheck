"""Soundcheck BFF (FastAPI).

P0: health endpoint only.
P4 adds: run orchestration (create room, add agents, kickoff @Bandleader message),
GitHub webhook receiver, Human-API/WS bridge, ledger projection, audit-package export.

Band is the system of record — this service is a read projection + command gateway,
never a coordination channel between agents (spec §17.2).
"""

from fastapi import FastAPI

app = FastAPI(title="Soundcheck BFF", version="0.0.1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "soundcheck-backend"}
