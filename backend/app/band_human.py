"""Human API client — the BFF's path to Band (spec §4.6/§7, appendix §4).

Verified against band_research/:
    POST /api/v1/me/agents/register   body {"agent":{"name","description"}}
                                      → 201 {"data":{"agent":{...},"credentials":{"api_key"}}}
    GET  /api/v1/me/agents
    POST /api/v1/me/chats             body {"chat":{"task_id": null}} (optional)
    POST /api/v1/me/chats/{id}/participants  body {"participant":{"participant_id","role"}}
    GET  /api/v1/me/chats/{id}/participants
    GET  /api/v1/me/chats/{id}/messages?page=&page_size=&message_type=&since=
    POST /api/v1/me/chats/{id}/messages      body {"message":{"content","mentions":[...]}}
    GET  /api/v1/me/peers

Auth: X-API-Key (human key). Agent keys are rejected on /me with 403.
Humans see ALL message types; only `text` streams over WS — events are polled here.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


def _base_url() -> str:
    return os.environ.get("THENVOI_REST_URL", "https://app.band.ai/").rstrip("/")


class BandHuman:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        key = api_key or os.environ["THENVOI_HUMAN_API_KEY"]
        self._client = httpx.AsyncClient(
            base_url=(base_url or _base_url()) + "/api/v1/me",
            headers={"X-API-Key": key},
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- agents -----------------------------------------------------------

    async def register_agent(self, name: str, description: str) -> dict[str, Any]:
        """Register a remote agent. Returns {'agent': {...}, 'credentials': {'api_key': ...}}.
        The api_key is shown ONCE — caller must persist it (agent_config.yaml)."""
        r = await self._client.post(
            "/agents/register",
            json={"agent": {"name": name, "description": description}},
        )
        r.raise_for_status()
        return r.json()["data"]

    async def list_agents(self, **params: Any) -> list[dict[str, Any]]:
        r = await self._client.get("/agents", params=params)
        r.raise_for_status()
        return r.json()["data"]

    async def list_peers(self, **params: Any) -> list[dict[str, Any]]:
        r = await self._client.get("/peers", params=params)
        r.raise_for_status()
        return r.json()["data"]

    # --- rooms ------------------------------------------------------------

    async def create_chat(self, task_id: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"chat": {}}
        if task_id:
            body["chat"]["task_id"] = task_id
        r = await self._client.post("/chats", json=body)
        r.raise_for_status()
        return r.json()["data"]

    async def add_participant(
        self, chat_id: str, participant_id: str, role: str = "member"
    ) -> dict[str, Any]:
        r = await self._client.post(
            f"/chats/{chat_id}/participants",
            json={"participant": {"participant_id": participant_id, "role": role}},
        )
        r.raise_for_status()
        return r.json()["data"]

    async def list_participants(self, chat_id: str, **params: Any) -> list[dict[str, Any]]:
        r = await self._client.get(f"/chats/{chat_id}/participants", params=params)
        r.raise_for_status()
        return r.json()["data"]

    # --- messages (humans see ALL types) -----------------------------------

    async def list_messages(self, chat_id: str, **params: Any) -> dict[str, Any]:
        """Returns {'data': [ChatMessage...], 'metadata': {page,...}} — newest first.
        Filter with message_type=text|tool_call|tool_result|thought|error and since=."""
        r = await self._client.get(f"/chats/{chat_id}/messages", params=params)
        r.raise_for_status()
        return r.json()

    async def send_message(
        self, chat_id: str, content: str, mentions: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Send a text message. Band requires ≥1 mention: [{'id','name','handle'?}, ...]."""
        if not mentions:
            raise ValueError("Band routing requires at least one @mention")
        r = await self._client.post(
            f"/chats/{chat_id}/messages",
            json={"message": {"content": content, "mentions": mentions}},
        )
        r.raise_for_status()
        return r.json()["data"]
