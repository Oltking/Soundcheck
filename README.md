# Soundcheck

A **governed, replayable autonomous workforce for security & compliance remediation**, built on **[Band](https://band.ai)** for the Band of Agents Hackathon. A band of specialist agents audits a connected repository, maps every finding to compliance controls, proposes safe fixes, reviews them across models, and opens a pull request — **you approve every change**, and every step is provenance-tracked through Band and fully replayable.

> The band performs. You conduct. The tape remembers everything.

## What it does

1. **Audit** — scanners read the repo: static analysis, dependency CVEs, committed secrets.
2. **Map** — every finding is tied to SOC 2 / ISO 27001 controls — evidence, not noise.
3. **Fix** — the Fixer proposes a patch on an isolated branch. `main` is never touched.
4. **Review** — a *different* model reviews the diff. Cross-model, never self-grading.
5. **Approve** — you authorize the change. No autonomous merges, ever.
6. **Ship** — a pull request is opened against the repo — opened for you, never merged.

Everything coordinates **through Band** (memory, messages, events) — agents never talk through our database. Postgres/SQLite is only a read-projection for the UI; if it vanished, the agents would still work.

## The band

Eight specialists across two model providers, coordinating in one Band room:

| Agent | Role | Lane |
|---|---|---|
| Scout | reconnaissance — repo → OrgContext | open-source (Featherless) |
| Bandleader | orchestrator — plan, recruit, sequence | frontier (AI/ML API) |
| Code Scanner | static analysis | open-source |
| Dependency Auditor | dependency CVEs | open-source |
| Secrets Sentinel | committed secrets (redacted) | open-source |
| Compliance Mapper | findings → SOC 2 / ISO 27001 | open-source |
| Fixer | proposes the patch | frontier |
| Reviewer | cross-model review of the diff | frontier |

No paid Anthropic/OpenAI keys: **frontier** lane via [AI/ML API](https://aimlapi.com), **open-source** lane via [Featherless](https://featherless.ai).

## Accounts & tenancy

Soundcheck is **multi-tenant**. Each person signs in with **email, password, and a nickname** (the only profile field), and **sees only the runs they started**. Auth is [Auth.js](https://authjs.dev) (JWT sessions, bcrypt-hashed passwords) backed by hosted **Postgres**.

The FastAPI BFF is **locked behind a shared internal key** — the browser never touches it directly. All browser traffic flows through an authenticated Next.js proxy that enforces per-user ownership on every run-scoped request; server components read the BFF directly (trusted) and run pages are gated by ownership.

## The screens

- **The Stage** — a live concert-hall console: the band sits along an arc, whoever's performing steps into the spotlight, and you watch handoffs in real time. Propose a fix from the Score rail and the Fixer → Reviewer perform it in place. Ask the band questions in-room.
- **Findings** — every finding grouped by severity, with its control mappings and evidence.
- **The Conductor** — the approval gate and the **audit deliverable**: the patch, the cross-model review, the provenance chain, and a one-click signed-style JSON export.
- **Master Tape** — scrub the whole run, every event in order — fully replayable.
- **The Encore** — a post-session retrospective: a scorecard, each agent's "bow", unfinished business you can send back in, the Producer's polish notes, and **the Mic** — a voiced walkthrough where each agent narrates its own part, in the order it was called.

## Architecture

```
Browser ──▶ Next.js (auth + proxy)  ──▶ FastAPI BFF (read projection)  ──▶ Band (system of record)
            │   per-user ownership          locked behind X-Internal-Key       memory · messages · events
            └── Postgres (users, run owners)            SQLite (UI cache)
```

## Repo layout

```
agents/        Python long-running Band agents (Scout, Bandleader, scanners, Fixer, Reviewer, …)
  common/        band_client (model lanes), ledger (Band memory), rooms, events
backend/app/   FastAPI BFF — projects Band into a fast read cache; locked behind an internal key
frontend/      Next.js 15 App Router + TypeScript — the app, auth, and the BFF proxy
scripts/       run_audit · run_remediation · run_polish · run_chat · register_agents · …
fixtures/      vuln-app — a deliberately vulnerable repo to audit
design/        design tokens + the Stage reference
band_research/ verbatim harvested Band docs — the source of truth for every Band call
```

## Getting started

**Prerequisites:** Python 3.11+, Node 20+, and a hosted Postgres (Neon / Supabase / Vercel Postgres — free tiers work).

### 1. Backend (agents + BFF)

```bash
cp .env.example .env                 # model keys, Band creds, INTERNAL_API_KEY (never commit)
cp agent_config.yaml.example agent_config.yaml
python -m venv .venv && . .venv/Scripts/activate   # (or source .venv/bin/activate)
pip install -e agents
uvicorn backend.app.main:app --port 8000           # the BFF
```

Root `.env` needs: `THENVOI_REST_URL`, `THENVOI_WS_URL`, `AIMLAPI_API_KEY`, `FEATHERLESS_API_KEY`, `GITHUB_TOKEN`, and `INTERNAL_API_KEY` (a shared secret the Next.js proxy must match).

### 2. Frontend (the app)

```bash
cd frontend
cp .env.example .env.local           # then fill it in
npm install
npm run db:migrate                   # create the auth + tenancy tables in Postgres
npm run dev                          # http://localhost:3000
```

`frontend/.env.local` needs:

| Variable | What |
|---|---|
| `AUTH_SECRET` | session secret — `npx auth secret` |
| `DATABASE_URL` | hosted Postgres (use the **pooler** URL on Supabase) |
| `INTERNAL_API_KEY` | **must match** the root `.env` value |
| `BFF_INTERNAL_URL` | `http://localhost:8000` |

Open `http://localhost:3000`, create an account, and start an audit.

## Ground rules (see CLAUDE.md)

- **Band is load-bearing** — agents never coordinate through our DB/files/queues.
- **Defensive security only** — find, explain, remediate. Human approval before any PR. Secrets always redacted as `file:line (redacted)`.
- **Real, no mocks** in production paths — the frontend renders live Band data.

License: **MIT**.
