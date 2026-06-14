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

import re
import uuid
from typing import Any

import httpx

from .events import RoomEvents
from .ledger import Ledger, scrub_secrets


_FILE_LINE = re.compile(r"([\w./\\-]+\.\w+):(\d+)")


def _dedup_key(kind: str, content: str, references: list[str] | None) -> str:
    """Collapse near-duplicate writes. For findings the stable signal is the
    file:line in the evidence (the LLM phrases titles inconsistently); for other
    kinds it's the normalized content + first reference."""
    norm = content.lower().replace("\\", "/")
    m = _FILE_LINE.search(norm)
    if m:
        path = m.group(1).lstrip("./")  # drop leading ./ or / from the path
        sig = f"{path}:{m.group(2)}"  # e.g. app.py:11
    else:
        sig = re.sub(r"\s+", " ", norm.strip()).split("\n", 1)[0][:120]
    ref = (references or [None])[0]
    return f"{kind}|{sig}|{ref}"


class Score:
    """Bound to one agent (api_key) and one run room (chat_id)."""

    def __init__(self, api_key: str, chat_id: str):
        self._ledger = Ledger(api_key)
        self._events = RoomEvents(api_key, chat_id)
        self._memories_available: bool | None = None  # unknown until first write
        self._written: dict[str, dict[str, Any]] = {}  # dedup within the run

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
        """Write a ledger entry; returns at least {'id', 'kind', 'via'}.
        Duplicate writes (same kind + finding/control) collapse to the first one,
        so an agent that re-scans or re-maps doesn't bloat the Score or burn calls."""
        dk = _dedup_key(kind, content, references)
        if dk in self._written:
            prior = self._written[dk]
            return {**prior, "deduped": True}

        if self._memories_available is not False:
            try:
                entry = await self._ledger.write(
                    kind=kind, content=content, thought=thought,
                    references=references, tags=tags, **ledger_kwargs,
                )
                self._memories_available = True
                entry["via"] = "memory"
                entry["kind"] = kind
                self._written[dk] = entry
                return entry
            except httpx.HTTPStatusError as e:
                body = e.response.json() if e.response.content else {}
                if e.response.status_code == 403 and (body.get("error") or {}).get("code") == "plan_required":
                    self._memories_available = False  # fall through to events
                else:
                    raise

        # Event fallback — same audit semantics, carried as a Band task event.
        content = scrub_secrets(content)
        thought = scrub_secrets(thought)
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
        result = {"id": entry_id, "kind": kind, "via": "event", "status": "active"}
        self._written[dk] = result
        return result

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
