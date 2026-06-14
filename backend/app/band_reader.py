"""Read a Band room's full timeline via the Agent API (spec §4.6/§7).

WHY this shape: the Human API (the spec's intended frontend read path) is
Enterprise-gated on this account (403), so the BFF reconstructs a room the way
the agents see it — by MERGING the contexts of every participant agent. Each
agent's /context returns the messages it sent or was @mentioned in; the union
across all workforce agents reconstructs the whole room (messages + events +
ledger entries carried in event metadata).

Band remains the system of record. This module never writes to Band.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Every agent whose context might contain part of a run's timeline.
WORKFORCE = [
    "stage_manager", "bandleader", "scout", "code_scanner", "dependencies",
    "secrets_config", "compliance_mapper", "fixer", "reviewer",
]


def _rest_url() -> str:
    return os.environ.get("THENVOI_REST_URL", "https://app.band.ai/").rstrip("/")


def _agent_keys() -> dict[str, str]:
    cfg = yaml.safe_load((REPO_ROOT / "agent_config.yaml").read_text()) or {}
    return {name: cfg[name]["api_key"] for name in WORKFORCE
            if name in cfg and cfg[name].get("api_key")}


async def _context(client: httpx.AsyncClient, key: str, room_id: str) -> list[dict]:
    try:
        r = await client.get(
            f"{_rest_url()}/api/v1/agent/chats/{room_id}/context",
            headers={"X-API-Key": key}, params={"page_size": 200},
        )
        if r.status_code == 200:
            return r.json().get("data", [])
    except httpx.HTTPError:
        pass
    return []


async def read_room_timeline(room_id: str) -> list[dict[str, Any]]:
    """Merged, de-duplicated, chronologically-sorted timeline for a room."""
    keys = _agent_keys()
    seen: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for key in keys.values():
            for m in await _context(client, key, room_id):
                seen[m["id"]] = m
    return sorted(seen.values(), key=lambda m: m.get("inserted_at", ""))


async def list_known_rooms(limit: int = 50) -> list[dict[str, Any]]:
    """Rooms the Stage Manager participates in (every run's room is created by it),
    newest first."""
    keys = _agent_keys()
    sm_key = keys.get("stage_manager")
    if not sm_key:
        return []
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_rest_url()}/api/v1/agent/chats",
            headers={"X-API-Key": sm_key}, params={"page_size": limit},
        )
        r.raise_for_status()
        rooms = r.json().get("data", [])
    return sorted(rooms, key=lambda c: c.get("inserted_at", ""), reverse=True)
