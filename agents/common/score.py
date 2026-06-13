"""The Score — evidence-ledger facade with a tier-aware fallback.

Primary path: Band Memory API via Ledger (spec §4.4) — org-scoped memories with
required `thought`, references, supersede semantics.

Fallback (current tier returns 403 plan_required on /agent/memories): the same
entries are emitted as structured Band `task` events into the run room, with
metadata {"ledger": {...}} carrying kind/thought/tags/references and a locally
generated entry id so reference chains still work. Still 100% through Band,
visible to humans, on the audit trail. Swaps back to real memories automatically
once the account has Memory API access — agent code never changes.
"""

from __future__ import annotations

import uuid
from typing import Any

import httpx

from .events import RoomEvents
from .ledger import Ledger, assert_no_secret


class Score:
    """Bound to one agent (api_key) and one run room (chat_id)."""

    def __init__(self, api_key: str, chat_id: str):
        self._ledger = Ledger(api_key)
        self._events = RoomEvents(api_key, chat_id)
        self._memories_available: bool | None = None  # unknown until first write

    async def aclose(self) -> None:
        await self._ledger.aclose()
        await self._events.aclose()

    async def write(
        self,
        *,
        kind: str,
        content: str,
        thought: str,
        references: list[str] | None = None,
        tags: list[str] | None = None,
        **ledger_kwargs: Any,
    ) -> dict[str, Any]:
        """Write a ledger entry; returns at least {'id', 'kind', 'via'}."""
        if self._memories_available is not False:
            try:
                entry = await self._ledger.write(
                    kind=kind, content=content, thought=thought,
                    references=references, tags=tags, **ledger_kwargs,
                )
                self._memories_available = True
                entry["via"] = "memory"
                entry["kind"] = kind
                return entry
            except httpx.HTTPStatusError as e:
                body = e.response.json() if e.response.content else {}
                if e.response.status_code == 403 and (body.get("error") or {}).get("code") == "plan_required":
                    self._memories_available = False  # fall through to events
                else:
                    raise

        # Event fallback — same audit semantics, carried as a Band task event.
        assert_no_secret(content)
        assert_no_secret(thought)
        entry_id = str(uuid.uuid4())
        await self._events.emit(
            "task",
            content,
            {
                "ledger": {
                    "id": entry_id,
                    "kind": kind,
                    "thought": thought,
                    "tags": tags or [],
                    "references": references or [],
                    "status": "active",
                },
                "state": "done",
            },
        )
        return {"id": entry_id, "kind": kind, "via": "event", "status": "active"}

    async def supersede(self, entry_id: str, reason: str) -> dict[str, Any]:
        """The retake — never delete. Reason is recorded either way."""
        if self._memories_available:
            data = await self._ledger.supersede(entry_id)
            data["via"] = "memory"
            return data
        await self._events.emit(
            "task",
            f"Superseded ledger entry {entry_id}: {reason}",
            {"ledger": {"id": entry_id, "status": "superseded", "thought": reason},
             "state": "done"},
        )
        return {"id": entry_id, "status": "superseded", "via": "event"}
