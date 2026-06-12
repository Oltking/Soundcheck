"""Events discipline (spec §4.2) — ALL activity narration goes through Band events.

Rule: messages (@mention) ONLY for real handoffs; events for everything else.
Task state is Band `task` events — never internal state (spec §17.2).

Inside SDK agents, the LLM uses the bound `thenvoi_send_event` tool. This module
is the same discipline for code paths outside an adapter (scanner wrappers,
the BFF, smoke tests): POST /api/v1/agent/chats/{chat_id}/events
(verified against band_research/ create-agent-chat-event).
"""

from __future__ import annotations

from typing import Any

import httpx

from .band_client import rest_url

EVENT_TYPES = {"tool_call", "tool_result", "thought", "error", "task"}
TASK_STATES = {"pending", "in_progress", "done", "escalated", "failed"}


class RoomEvents:
    """Event emitter bound to one agent's API key and one chat room."""

    def __init__(self, api_key: str, chat_id: str, base_url: str | None = None):
        self.chat_id = chat_id
        self._client = httpx.AsyncClient(
            base_url=(base_url or rest_url()) + "/api/v1/agent",
            headers={"X-API-Key": api_key},
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def emit(
        self,
        message_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if message_type not in EVENT_TYPES:
            raise ValueError(f"invalid event type {message_type!r} (valid: {sorted(EVENT_TYPES)})")
        body = {"event": {"content": content, "message_type": message_type}}
        if metadata:
            body["event"]["metadata"] = metadata
        r = await self._client.post(f"/chats/{self.chat_id}/events", json=body)
        r.raise_for_status()
        return r.json()["data"]

    # Convenience wrappers — keep the vocabulary consistent everywhere.

    async def thought(self, content: str, **metadata: Any) -> dict[str, Any]:
        return await self.emit("thought", content, metadata or None)

    async def tool_call(self, tool: str, detail: str, **metadata: Any) -> dict[str, Any]:
        return await self.emit("tool_call", detail, {"tool": tool, **metadata})

    async def tool_result(self, tool: str, detail: str, **metadata: Any) -> dict[str, Any]:
        return await self.emit("tool_result", detail, {"tool": tool, **metadata})

    async def error(self, content: str, **metadata: Any) -> dict[str, Any]:
        return await self.emit("error", content, metadata or None)

    async def task(self, state: str, content: str, **metadata: Any) -> dict[str, Any]:
        """Task-state transition — the judges' keyword (spec §17.2)."""
        if state not in TASK_STATES:
            raise ValueError(f"invalid task state {state!r} (valid: {sorted(TASK_STATES)})")
        return await self.emit("task", content, {"state": state, **metadata})
