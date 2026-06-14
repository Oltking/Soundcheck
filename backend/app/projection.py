"""Project a Band room into the SQLite read-cache and build UI-ready views
(spec §7). Parses the reconstructed timeline into ledger entries + the
provenance chain. Pure read of Band; idempotent.
"""

from __future__ import annotations

import json
from typing import Any

from . import db
from .band_reader import list_known_rooms, read_room_timeline


def _ledger_from_event(m: dict) -> dict | None:
    """A ledger entry carried in a task-event's metadata.ledger (the event
    fallback used while the Memory API is gated)."""
    meta = m.get("metadata")
    if not isinstance(meta, dict):
        return None
    led = meta.get("ledger")
    if not isinstance(led, dict) or "kind" not in led:
        return None
    return {
        "id": led.get("id") or m["id"],
        "kind": led.get("kind"),
        "content": m.get("content"),
        "thought": led.get("thought"),
        "tags": led.get("tags") or [],
        "refs": led.get("references") or [],
        "status": led.get("status", "active"),
        "sender": m.get("sender_name"),
        "created_at": m.get("inserted_at"),
        "via": "event",
    }


async def project_room(room_id: str) -> dict[str, Any]:
    """Read the room from Band, write the projection, return the structured view."""
    db.init_db()
    timeline = await read_room_timeline(room_id)

    ledger_rows: list[dict] = []
    timeline_rows: list[dict] = []
    counts = {"Finding": 0, "ControlMapping": 0, "OrgContext": 0,
              "PatchProposal": 0, "ReviewResult": 0, "Approval": 0}

    for m in timeline:
        timeline_rows.append({
            "id": m["id"], "room_id": room_id,
            "mtype": m.get("message_type"), "sender": m.get("sender_name"),
            "sender_type": m.get("sender_type"), "content": m.get("content"),
            "created_at": m.get("inserted_at"),
        })
        led = _ledger_from_event(m)
        if led:
            counts[led["kind"]] = counts.get(led["kind"], 0) + 1
            ledger_rows.append({
                **led, "room_id": room_id,
                "tags": json.dumps(led["tags"]), "refs": json.dumps(led["refs"]),
            })

    created = timeline[0]["inserted_at"] if timeline else None
    updated = timeline[-1]["inserted_at"] if timeline else None
    run = {
        "room_id": room_id, "title": "Audit run", "created_at": created,
        "updated_at": updated, "finding_count": counts["Finding"],
        "control_count": counts["ControlMapping"], "orgcontext_count": counts["OrgContext"],
        "patch_count": counts["PatchProposal"], "approval_count": counts["Approval"],
    }

    conn = db.connect()
    try:
        db.upsert_run(conn, run)
        db.replace_ledger(conn, room_id, ledger_rows)
        db.replace_timeline(conn, room_id, timeline_rows)
        conn.commit()
    finally:
        conn.close()

    return {"run": run, "ledger_count": len(ledger_rows), "timeline_count": len(timeline_rows)}


async def project_all_rooms(limit: int = 50) -> list[dict]:
    rooms = await list_known_rooms(limit=limit)
    out = []
    for r in rooms:
        res = await project_room(r["id"])
        out.append(res["run"])
    return out


def provenance_chain(room_id: str, entry_id: str) -> dict[str, Any]:
    """Walk a ledger entry's references to build the audit chain
    (Finding -> Control/Patch -> Review -> Approval), from the cache."""
    conn = db.connect()
    try:
        rows = {r["id"]: dict(r) for r in
                conn.execute("SELECT * FROM ledger WHERE room_id=?", (room_id,))}
    finally:
        conn.close()

    def node(eid: str, seen: set) -> dict | None:
        if eid not in rows or eid in seen:
            return None
        seen.add(eid)
        r = rows[eid]
        return {
            "id": r["id"], "kind": r["kind"], "content": r["content"],
            "thought": r["thought"], "status": r["status"],
            "references": [n for ref in json.loads(r["refs"] or "[]")
                           if (n := node(ref, seen))],
        }

    return node(entry_id, set()) or {}
