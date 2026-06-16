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
    "secrets_config", "compliance_mapper", "fixer", "reviewer", "customer_service",
]


def _agent_id(name: str) -> str | None:
    cfg = yaml.safe_load((REPO_ROOT / "agent_config.yaml").read_text()) or {}
    return (cfg.get(name) or {}).get("agent_id")


def relay_text(question: str, context: str = "") -> str:
    """The exact message the Stage Manager posts to relay a question, with the run
    facts appended so Customer Service can answer even on a fresh join."""
    base = f"@Customer Service the Conductor asks: {question}"
    return f"{base}\n\n[Run facts you may use: {context}]" if context else base


async def relay_question(room_id: str, question: str, context: str = "") -> bool:
    """Post the Conductor's question into the room as the Stage Manager, @mentioning
    Customer Service (the Human API is gated, so the human can't post directly).
    Customer Service — kept live by scripts/run_chat.py — answers in the room."""
    keys = _agent_keys()
    sm_key = keys.get("stage_manager")
    cs_id = _agent_id("customer_service")
    if not sm_key or not cs_id:
        return False
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{_rest_url()}/api/v1/agent/chats/{room_id}/messages",
            headers={"X-API-Key": sm_key},
            json={"message": {
                "content": relay_text(question, context),
                "mentions": [{"id": cs_id, "name": "Customer Service"}],
            }},
        )
        return r.status_code in (200, 201)


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


async def read_room_participants(room_id: str) -> dict[str, dict[str, Any]]:
    """Map participant_id -> {name, handle, type} for a room. This is how we
    resolve @[[uuid]] mention tokens into readable @names (the Conductor included).
    """
    keys = _agent_keys()
    sm_key = keys.get("stage_manager") or next(iter(keys.values()), None)
    if not sm_key:
        return {}
    out: dict[str, dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(
                f"{_rest_url()}/api/v1/agent/chats/{room_id}/participants",
                headers={"X-API-Key": sm_key}, params={"page_size": 100},
            )
            if r.status_code == 200:
                for p in r.json().get("data", []):
                    if p.get("id"):
                        out[p["id"]] = {
                            "name": p.get("name") or "participant",
                            "handle": p.get("handle"),
                            "type": p.get("type"),
                        }
        except httpx.HTTPError:
            pass
    return out


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
