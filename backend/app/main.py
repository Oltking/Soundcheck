"""Soundcheck BFF (FastAPI) — the read projection + audit-package gateway (spec §7).

Band is the system of record; this service only READS Band (via the Agent API,
since the Human API is Enterprise-gated) and serves a fast, replayable view to
the frontend. It never coordinates agents (spec §17.2).

Endpoints:
  GET  /health
  POST /runs/refresh                  re-project all known rooms from Band
  GET  /runs                          list runs (from cache)
  POST /runs/{room_id}/refresh        re-project one room
  GET  /runs/{room_id}                run detail: counts + ledger grouped by kind
  GET  /runs/{room_id}/timeline       full message/event timeline
  GET  /runs/{room_id}/findings       findings + their control mappings
  GET  /runs/{room_id}/chain/{id}     provenance chain for a ledger entry
  GET  /runs/{room_id}/audit-package  signed-style JSON export (the deliverable)
"""

from __future__ import annotations

import json
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(REPO_ROOT / ".env")

from . import band_reader, db, projection  # noqa: E402

# Live "Ask the band" chat sessions, keyed by room — one run_chat.py per room.
_chat_sessions: dict[str, subprocess.Popen] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Soundcheck BFF", version="0.4.0", lifespan=lifespan)
# Allowed browser origins — set ALLOWED_ORIGINS (comma-separated) on the BFF host
# to include the deployed frontend, e.g. "https://soundcheck.vercel.app".
import os  # noqa: E402

_origins = [o.strip() for o in os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=_origins,
    allow_methods=["*"], allow_headers=["*"],
)

# The BFF is reached only through the authenticated Next.js proxy, which attaches
# this shared secret. Direct hits (any client without the key) are rejected — so
# run data can't be pulled straight off :8000, bypassing per-user ownership.
# If INTERNAL_API_KEY is unset the gate is open (local dev convenience).
from fastapi import Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

_INTERNAL_KEY = os.environ.get("INTERNAL_API_KEY", "").strip()


@app.middleware("http")
async def require_internal_key(request: Request, call_next):
    if _INTERNAL_KEY and request.method != "OPTIONS" and request.url.path != "/health":
        if request.headers.get("x-internal-key") != _INTERNAL_KEY:
            return JSONResponse({"detail": "forbidden"}, status_code=403)
    return await call_next(request)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "soundcheck-backend"}


# -- run orchestration (the Connect screen starts a run) -------------------

@app.post("/runs/start")
async def start_run(target: str | None = None) -> dict:
    """Launch an audit run (detached subprocess). It creates its own Band room;
    the frontend then polls POST /runs/refresh to discover and project it.
    NOTE: a real run spends model tokens — this is an explicit user action."""
    cmd = [sys.executable, str(REPO_ROOT / "scripts" / "run_audit.py")]
    if target:
        cmd += ["--target", target]
    subprocess.Popen(cmd, cwd=str(REPO_ROOT),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "started", "note": "poll POST /runs/refresh to discover the new room"}


@app.post("/runs/{room_id}/remediate")
async def remediate(room_id: str, file: str, finding: str, repo_url: str | None = None) -> dict:
    """Launch the remediation loop (Fixer -> Reviewer -> human approval -> PR) for a
    finding, in the existing run room. Detached, like start_run — the Conductor screen
    then shows the proposed patch and the approval gate. Spends model tokens."""
    cmd = [sys.executable, str(REPO_ROOT / "scripts" / "run_remediation.py"),
           "--room-id", room_id, "--file", file, "--finding", finding]
    if repo_url:
        cmd += ["--repo-url", repo_url]
    subprocess.Popen(cmd, cwd=str(REPO_ROOT),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "remediation_started",
            "note": "watch the Conductor for the proposed patch, then approve to open the PR"}


@app.post("/runs/{room_id}/polish")
async def polish(room_id: str) -> dict:
    """The Producer's notes — generate post-session code-polish suggestions for the
    latest patch. Detached subprocess (run_polish.py) on the OSS lane; it writes
    PolishNote memories to Band, which then project to the Encore."""
    patches = _rows(
        "SELECT * FROM ledger WHERE room_id=? AND kind='PatchProposal' "
        "ORDER BY created_at DESC LIMIT 1", room_id)
    if not patches:
        raise HTTPException(status_code=400, detail="No patch to polish on this run yet.")
    p = patches[0]
    reviews = _rows(
        "SELECT * FROM ledger WHERE room_id=? AND kind='ReviewResult' "
        "ORDER BY created_at DESC LIMIT 1", room_id)
    review = (reviews[0]["thought"] if reviews else "") or ""

    # the finding this patch addressed (its first reference), for context
    refs = json.loads(p.get("refs") or "[]")
    finding = ""
    if refs:
        fr = _rows("SELECT content FROM ledger WHERE room_id=? AND id=? LIMIT 1", room_id, refs[0])
        finding = (fr[0]["content"] if fr else "") or ""
    if not finding:
        finding = (p.get("content") or "").split("\n")[0]
    patch_txt = f"{p.get('content') or ''}\nRationale: {p.get('thought') or ''}"

    cmd = [sys.executable, str(REPO_ROOT / "scripts" / "run_polish.py"),
           "--room-id", room_id, "--finding", finding[:500],
           "--patch", patch_txt[:800], "--review", review[:500], "--patch-id", p["id"]]
    subprocess.Popen(cmd, cwd=str(REPO_ROOT),
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "polish_started",
            "note": "the Producer is drafting notes — refresh the Encore shortly"}


def _run_context(room_id: str) -> str:
    """A compact, factual summary of the run for Customer Service to answer from."""
    rows = _rows("SELECT content FROM ledger WHERE room_id=? AND kind='Finding'", room_id)
    ctrls = _rows("SELECT content FROM ledger WHERE room_id=? AND kind='ControlMapping'", room_id)
    if not rows:
        return "No findings have been recorded for this run yet."
    titles = [(r["content"] or "").split("\n")[0][:90] for r in rows[:8]]
    frameworks = sorted({(c["content"] or "").split(" ")[0] for c in ctrls if c["content"]})
    bits = [f"{len(rows)} findings recorded", f"{len(ctrls)} control mappings"]
    if frameworks:
        bits.append("frameworks: " + ", ".join(frameworks[:4]))
    return ". ".join(bits) + ". Findings include: " + "; ".join(titles)


@app.post("/runs/{room_id}/ask")
async def ask(room_id: str, question: str) -> dict:
    """Ask the band a question. If a Customer Service session is already live on the
    room, relay the question straight in (via the Stage Manager). Otherwise launch
    a session and hand it the first question — it relays once CS has joined and
    subscribed (agents must be started before being added to a room). The run facts
    are attached so CS can answer even on a fresh join. The frontend polls the
    timeline for the answer (which may route to a specialist)."""
    context = _run_context(room_id)
    proc = _chat_sessions.get(room_id)
    warm = proc is not None and proc.poll() is None
    if warm:
        ok = await band_reader.relay_question(room_id, question, context)
        if not ok:
            raise HTTPException(502, "could not relay the question to Customer Service")
        return {"status": "asked", "cold_start": False}

    cmd = [sys.executable, str(REPO_ROOT / "scripts" / "run_chat.py"),
           "--room-id", room_id, "--question", question, "--context", context]
    _chat_sessions[room_id] = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "asked", "cold_start": True}


# -- projection refresh ----------------------------------------------------

@app.post("/runs/refresh")
async def refresh_all(limit: int = 50) -> dict:
    runs = await projection.project_all_rooms(limit=limit)
    return {"projected": len(runs), "runs": [r["room_id"] for r in runs]}


@app.post("/runs/{room_id}/refresh")
async def refresh_one(room_id: str) -> dict:
    return await projection.project_room(room_id)


@app.get("/rooms")
async def list_rooms(limit: int = 50) -> dict:
    """Just the room ids straight from Band (one cheap call) — no projection.
    Used to discover a just-started run fast, without re-projecting everything."""
    rooms = await band_reader.list_known_rooms(limit=limit)
    return {"rooms": [{"room_id": r.get("id"), "created_at": r.get("inserted_at")}
                      for r in rooms if r.get("id")]}


# -- reads from the cache --------------------------------------------------

def _rows(sql: str, *params) -> list[dict]:
    conn = db.connect()
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    finally:
        conn.close()


@app.get("/runs")
async def list_runs() -> dict:
    return {"runs": _rows("SELECT * FROM runs ORDER BY created_at DESC")}


@app.get("/runs/{room_id}")
async def run_detail(room_id: str) -> dict:
    runs = _rows("SELECT * FROM runs WHERE room_id=?", room_id)
    if not runs:
        raise HTTPException(404, "run not in cache — POST /runs/{id}/refresh first")
    ledger = _rows("SELECT * FROM ledger WHERE room_id=? ORDER BY created_at", room_id)
    by_kind: dict[str, list] = {}
    for e in ledger:
        e["tags"] = json.loads(e["tags"] or "[]")
        e["refs"] = json.loads(e["refs"] or "[]")
        by_kind.setdefault(e["kind"], []).append(e)
    return {"run": runs[0], "ledger_by_kind": by_kind}


@app.get("/runs/{room_id}/timeline")
async def run_timeline(room_id: str) -> dict:
    rows = _rows("SELECT * FROM timeline WHERE room_id=? ORDER BY created_at", room_id)
    for r in rows:
        r["mentions"] = json.loads(r.get("mentions") or "[]")
    return {"timeline": rows}


@app.get("/runs/{room_id}/findings")
async def run_findings(room_id: str) -> dict:
    ledger = _rows("SELECT * FROM ledger WHERE room_id=?", room_id)
    for e in ledger:
        e["tags"] = json.loads(e["tags"] or "[]")
        e["refs"] = json.loads(e["refs"] or "[]")
    findings = [e for e in ledger if e["kind"] == "Finding"]
    controls = [e for e in ledger if e["kind"] == "ControlMapping"]
    # attach the control mappings that reference each finding
    for f in findings:
        f["controls"] = [c for c in controls if f["id"] in c["refs"]]
        f["severity"] = next((t.split(":", 1)[1] for t in f["tags"]
                              if t.startswith("severity:")), "unknown")
    return {"findings": findings}


@app.get("/runs/{room_id}/chain/{entry_id}")
async def run_chain(room_id: str, entry_id: str) -> dict:
    chain = projection.provenance_chain(room_id, entry_id)
    if not chain:
        raise HTTPException(404, "entry not found in cache for this room")
    return {"chain": chain}


@app.get("/runs/{room_id}/audit-package")
async def audit_package(room_id: str) -> dict:
    """Provenance-complete export assembled solely from the Band trail (spec §16.5).
    Every finding, its control mappings, and the patch->review->approval chain."""
    runs = _rows("SELECT * FROM runs WHERE room_id=?", room_id)
    if not runs:
        raise HTTPException(404, "run not in cache — refresh first")
    ledger = _rows("SELECT * FROM ledger WHERE room_id=? ORDER BY created_at", room_id)
    for e in ledger:
        e["tags"] = json.loads(e["tags"] or "[]")
        e["refs"] = json.loads(e["refs"] or "[]")
    return {
        "audit_package_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Band provenance ledger (system of record)",
        "room_id": room_id,
        "run": runs[0],
        "ledger": ledger,
        "note": "Every entry carries its agent's reasoning (thought) and reference "
                "chain. Human approvals are recorded as Approval entries.",
    }
