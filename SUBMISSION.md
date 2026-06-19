# Soundcheck — submission copy

## Tagline (one line)

A governed, replayable AI workforce that audits your code, maps findings to compliance controls, and proposes reviewed fixes — you approve every change.

## Short description

Soundcheck is a governed, replayable autonomous workforce for security & compliance, built on **Band**. A band of eight specialist agents — across two model providers — audits a connected repository, maps every finding to SOC 2 / ISO 27001 controls, proposes safe fixes on isolated branches, and reviews them across models. **You approve every change** before any pull request opens, and every step is provenance-tracked through Band and fully replayable.

## Long description (~2000 characters)

Security and compliance work is a backlog problem: scanners produce noise, fixes are risky, and auditors want evidence no one has time to assemble. Soundcheck turns that backlog into a performance you can watch, govern, and replay.

It's built as a band: eight specialist agents that coordinate entirely through Band — memory, messages, and events — never a shared database or queue. A Bandleader plans the run and recruits the players; Scout ingests the repo into an OrgContext; a Code Scanner, Dependency Auditor, and Secrets Sentinel find issues; a Compliance Mapper ties each finding to SOC 2 and ISO 27001 controls; a Fixer proposes a patch on an isolated branch; and a Reviewer — a different model — checks the diff. The agents are genuinely heterogeneous, split across a frontier lane (AI/ML API) and an open-source lane (Featherless), all in one room — and no paid Anthropic or OpenAI keys.

You conduct. Nothing ships without you: the Fixer proposes, the Reviewer cross-checks, and you sign off — an approval captured as a real message in the room, part of the permanent record. Only then does a pull request open, never a merge.

Because Band is the system of record, the whole run is provenance-complete and replayable. Every finding chains back through the ledger to its evidence; the Master Tape scrubs the run event-by-event; and a one-click audit deliverable exports the seal, the patch, the review, and the full chain — the artifact an auditor actually receives.

The experience is a concert hall. On the Stage, whoever's performing steps into the spotlight; you watch handoffs as threads of light and ask the band questions in-room. When the set ends, the Encore gives a retrospective — a scorecard, each agent's bow, unfinished business you can send back in, and the Mic, where each agent narrates its own part aloud, in order.

Multi-tenant by account, defensive-only by design, human-approved by default. Built on Band. MIT-licensed, original work.

## Tech at a glance

- **Band** — system of record; all agent coordination via memory / messages / events.
- **Agents** — Python (LangGraph), 8 specialists across **AI/ML API** (frontier) + **Featherless** (open-source).
- **Frontend** — Next.js 15 (App Router, TypeScript); Auth.js email/password accounts; per-user runs.
- **Backend** — FastAPI read-projection, locked behind an internal key, fronted by an authenticated proxy.
- **Data** — Postgres (accounts + run ownership); SQLite (UI read cache). Provenance-complete, replayable.
- Defensive-only · human approval before any PR · MIT.
