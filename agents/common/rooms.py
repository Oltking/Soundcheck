"""Agent-side room lifecycle — create rooms, recruit participants, send handoffs.

IMPORTANT TIER NOTE (verified live 2026-06-13): the Human API's chat/message
endpoints return 403 `plan_required` (Enterprise) on this account. The Agent API
is fully open, so orchestration is agent-side: an agent creates the room,
recruits peers (including the human owner, so the run is visible in the Band UI),
and posts @mention handoffs. This is also the more Band-native shape.

Verified against band_research/ + live API:
    POST /api/v1/agent/chats                       body {"chat": {"task_id"?}}
    GET  /api/v1/agent/chats /{id}
    GET  /api/v1/agent/peers?not_in_chat={id}
    POST /api/v1/agent/chats/{id}/participants     {"participant": {"participant_id","role"}}
    GET  /api/v1/agent/chats/{id}/participants
    POST /api/v1/agent/chats/{id}/messages         {"message": {"content","mentions":[{id,name?,handle?}]}}
    GET  /api/v1/agent/chats/{id}/context          (agent's own + mentioned messages)
"""

from __future__ import annotations

from typing import Any

import httpx

from .band_client import rest_url


class AgentRooms:
    """Room-lifecycle client bound to one agent's API key (raw REST;
    inside SDK adapters the LLM uses the bound thenvoi_* tools instead)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self._client = httpx.AsyncClient(
            base_url=(base_url or rest_url()) + "/api/v1/agent",
            headers={"X-API-Key": api_key},
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def me(self) -> dict[str, Any]:
        r = await self._client.get("/me")
        r.raise_for_status()
        return r.json()["data"]

    async def peers(self, **params: Any) -> list[dict[str, Any]]:
        r = await self._client.get("/peers", params=params)
        r.raise_for_status()
        return r.json()["data"]

    async def create_chat(self, task_id: str | None = None) -> dict[str, Any]:
        chat: dict[str, Any] = {}
        if task_id:
            chat["task_id"] = task_id
        r = await self._client.post("/chats", json={"chat": chat})
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

    async def send_message(
        self, chat_id: str, content: str, mentions: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Send a routed handoff. Band requires >=1 mention: [{'id', 'name'?, 'handle'?}]."""
        if not mentions:
            raise ValueError("Band routing requires at least one @mention")
        r = await self._client.post(
            f"/chats/{chat_id}/messages",
            json={"message": {"content": content, "mentions": mentions}},
        )
        r.raise_for_status()
        return r.json()["data"]

    async def context(self, chat_id: str, **params: Any) -> list[dict[str, Any]]:
        """Conversation history for rehydration: messages this agent sent OR was
        mentioned in, oldest first."""
        r = await self._client.get(f"/chats/{chat_id}/context", params=params)
        r.raise_for_status()
        return r.json()["data"]
