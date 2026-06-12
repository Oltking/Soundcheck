"""The Score — Band memory as the evidence ledger (spec §4.4).

Raw Agent-API REST (verified against band_research/ + openapi spec):
    POST /api/v1/agent/memories            create (thought REQUIRED — the audit "why")
    GET  /api/v1/agent/memories            list/filter
    GET  /api/v1/agent/memories/{id}       get
    POST /api/v1/agent/memories/{id}/supersede   soft-delete, stays on the Master Tape
    POST /api/v1/agent/memories/{id}/archive

Enums (from openapi.json):
    system: sensory | working | long_term
    type:   iconic | echoic | haptic | episodic | semantic | procedural
            ("must be valid for selected system")
    segment: user | agent | tool | guideline
    scope:  subject (default) | organization
    status: active | superseded | archived  (platform-set)

Ledger conventions (spec §4.4): org-scoped; facts = long_term+semantic,
fixes = long_term+procedural, policies = segment guideline. Entry kind goes in
metadata.tags as "kind:<Finding|OrgContext|ControlMapping|Evidence|PatchProposal|
ReviewResult|Approval>"; provenance links go in metadata.references (memory UUIDs).

NEVER store unredacted secrets — use redact() for evidence strings.
"""

from __future__ import annotations

import re
from typing import Any

import httpx

from .band_client import rest_url

VALID_KINDS = {
    "OrgContext",
    "Finding",
    "ControlMapping",
    "Evidence",
    "PatchProposal",
    "ReviewResult",
    "Approval",
    "Policy",
}


def redact(text: str, file: str | None = None, line: int | None = None) -> str:
    """Reference a discovered secret without echoing it (CLAUDE.md non-negotiable)."""
    where = f"{file}:{line}" if file else "unknown location"
    return f"secret at {where} (redacted)"


_SECRETISH = re.compile(
    r"(?i)(api[_-]?key|secret|token|password|authorization)\s*[:=]\s*\S+"
)


def assert_no_secret(text: str) -> None:
    """Guardrail: refuse to write content that looks like a live credential."""
    if _SECRETISH.search(text):
        raise ValueError(
            "ledger content looks like it contains a credential — redact() it first"
        )


class Ledger:
    """Evidence-ledger client bound to one agent's API key."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self._client = httpx.AsyncClient(
            base_url=(base_url or rest_url()) + "/api/v1/agent",
            headers={"X-API-Key": api_key},
            timeout=30.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def write(
        self,
        *,
        kind: str,
        content: str,
        thought: str,
        references: list[str] | None = None,
        tags: list[str] | None = None,
        system: str = "long_term",
        type: str = "semantic",
        segment: str = "agent",
        scope: str = "organization",
        subject_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a ledger entry. Returns the created memory (incl. its id)."""
        if kind not in VALID_KINDS:
            raise ValueError(f"unknown ledger kind {kind!r} (valid: {sorted(VALID_KINDS)})")
        assert_no_secret(content)
        assert_no_secret(thought)

        memory: dict[str, Any] = {
            "content": content,
            "thought": thought,  # REQUIRED by the API — the audit "why"
            "system": system,
            "type": type,
            "segment": segment,
            "scope": scope,
            "metadata": {
                "tags": [f"kind:{kind}", *(tags or [])],
                "references": references or [],
            },
        }
        if subject_id is not None:
            memory["subject_id"] = subject_id

        r = await self._client.post("/memories", json={"memory": memory})
        r.raise_for_status()
        return r.json()["data"]

    async def get(self, memory_id: str) -> dict[str, Any]:
        r = await self._client.get(f"/memories/{memory_id}")
        r.raise_for_status()
        return r.json()["data"]

    async def list(self, **params: Any) -> list[dict[str, Any]]:
        """List memories. Filters per API: scope, system, type, segment,
        content_query, status, subject_id, page_size..."""
        r = await self._client.get("/memories", params=params)
        r.raise_for_status()
        return r.json()["data"]

    async def supersede(self, memory_id: str) -> dict[str, Any]:
        """A 'retake' — soft-delete that stays on the Master Tape.
        Only the source agent may supersede its own memory."""
        r = await self._client.post(f"/memories/{memory_id}/supersede")
        r.raise_for_status()
        return r.json()["data"]

    async def archive(self, memory_id: str) -> dict[str, Any]:
        r = await self._client.post(f"/memories/{memory_id}/archive")
        r.raise_for_status()
        return r.json()["data"]
