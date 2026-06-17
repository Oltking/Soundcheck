"""Project a Band room into the SQLite read-cache and build UI-ready views
(spec §7). Parses the reconstructed timeline into ledger entries + the
provenance chain. Pure read of Band; idempotent.
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import db
from .band_reader import list_known_rooms, read_room_participants, read_room_timeline

_MENTION = re.compile(r"@\[\[([^\]]+)\]\]")


def _resolve_mentions(content: str | None, id2name: dict[str, str]) -> tuple[str | None, list[str]]:
    """Turn raw @[[uuid]] tokens into readable @Names and collect the recipients.
    This is what makes handoffs visible on the site exactly like the Band room."""
    if not content:
        return content, []
    names: list[str] = []

    def sub(m: re.Match) -> str:
        name = id2name.get(m.group(1))
        if name:
            names.append(name)
            return f"@{name}"
        return "@someone"

    return _MENTION.sub(sub, content), names


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


async def project_room(room_id: str, room_meta: dict | None = None) -> dict[str, Any]:
    """Read the room from Band, write the projection, return the structured view.
    `room_meta` (when known, e.g. from the room listing) supplies the room's own
    creation time as a fallback date for rooms whose timeline is still empty."""
    db.init_db()
    timeline = await read_room_timeline(room_id)
    participants = await read_room_participants(room_id)

    # id -> name map: participants (authoritative) plus any senders seen in the
    # timeline, so every @mention resolves. The human Conductor is shown as YOU
    # (their real Band name is never surfaced on the site).
    HUMAN = "YOU"
    id2name: dict[str, str] = {}
    for pid, p in participants.items():
        is_agent = (p.get("type") or "").lower() == "agent"
        id2name[pid] = p["name"] if is_agent else HUMAN
    for m in timeline:
        sid, snm, stype = m.get("sender_id"), m.get("sender_name"), m.get("sender_type")
        if sid and snm:
            id2name.setdefault(sid, HUMAN if stype == "User" else snm)

    ledger_rows: list[dict] = []
    timeline_rows: list[dict] = []
    counts = {"Finding": 0, "ControlMapping": 0, "OrgContext": 0,
              "PatchProposal": 0, "ReviewResult": 0, "Approval": 0}
    task_count = 0       # `task` events — the unit of agent work
    message_count = 0    # `text` messages — the conversation (handoffs, @mentions)

    for m in timeline:
        mtype = m.get("message_type")
        if mtype == "task":
            task_count += 1
        elif mtype == "text":
            message_count += 1
        resolved, mentions = _resolve_mentions(m.get("content"), id2name)
        sender = HUMAN if m.get("sender_type") == "User" else m.get("sender_name")
        timeline_rows.append({
            "id": m["id"], "room_id": room_id,
            "mtype": mtype, "sender": sender,
            "sender_type": m.get("sender_type"), "content": resolved,
            "mentions": json.dumps(mentions),
            "created_at": m.get("inserted_at"),
        })
        led = _ledger_from_event(m)
        if led:
            counts[led["kind"]] = counts.get(led["kind"], 0) + 1
            ledger_rows.append({
                **led, "room_id": room_id,
                "tags": json.dumps(led["tags"]), "refs": json.dumps(led["refs"]),
            })

    # Prefer the first/last activity; fall back to the room's own creation time so a
    # run is never dateless (e.g. a room created but with no captured timeline yet).
    room_created = (room_meta or {}).get("inserted_at") or (room_meta or {}).get("created_at")
    created = (timeline[0]["inserted_at"] if timeline else None) or room_created
    updated = (timeline[-1]["inserted_at"] if timeline else None) or created
    run = {
        "room_id": room_id, "title": "Audit run", "created_at": created,
        "updated_at": updated, "finding_count": counts["Finding"],
        "control_count": counts["ControlMapping"], "orgcontext_count": counts["OrgContext"],
        "patch_count": counts["PatchProposal"], "approval_count": counts["Approval"],
        "task_count": task_count, "message_count": message_count,
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
        res = await project_room(r["id"], room_meta=r)
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
