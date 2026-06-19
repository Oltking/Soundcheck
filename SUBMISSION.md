# Soundcheck — submission copy

## Tagline (one line)

A governed, replayable AI workforce that audits your code, maps findings to compliance controls, and proposes reviewed fixes — you approve every change.

## Short description

Soundcheck is a governed, replayable autonomous workforce for security & compliance, built on **Band**. A band of eight specialist agents — across two model providers — audits a connected repository, maps every finding to SOC 2 / ISO 27001 controls, proposes safe fixes on isolated branches, and reviews them across models. **You approve every change** before any pull request opens, and every step is provenance-tracked through Band and fully replayable.

## Long description

**Soundcheck — a governed, replayable agent workforce for security & compliance remediation.**

Security and compliance work is a backlog problem: scanners produce noise, fixes are risky, and auditors want evidence no one has time to assemble. Soundcheck turns that backlog into a performance you can watch, govern, and replay.

It's built as a **band**: eight specialist agents that coordinate *entirely through Band* — memory, messages, and events — never through a shared database or queue. A **Bandleader** plans the run and recruits the players; **Scout** ingests the repo into an OrgContext; a **Code Scanner**, **Dependency Auditor**, and **Secrets Sentinel** find issues; a **Compliance Mapper** ties each finding to SOC 2 and ISO 27001 controls; a **Fixer** proposes a patch on an isolated branch; and a **Reviewer** — a *different model* — checks the diff. The agents are genuinely heterogeneous: a frontier lane (AI/ML API) and an open-source lane (Featherless), so work is split by cost and capability, all in one room.

**You conduct.** Nothing ships without you: the Fixer proposes, the Reviewer cross-checks, and you sign off — an approval captured as a real message in the Band room. Only then does a pull request open, never a merge.

Because Band is the system of record, the whole run is **provenance-complete and replayable**. Every finding chains back through the ledger to its evidence; the **Master Tape** scrubs the run event-by-event; and a one-click **audit deliverable** exports the seal, the patch, the cross-model review, and the full chain — the artifact an auditor actually receives.

The experience is a **concert hall**. On the **Stage**, the band sits along an arc and whoever's performing steps into the spotlight; you watch handoffs as threads of light and ask the band questions in-room. When the set ends, the **Encore** gives a retrospective — a scorecard, each agent's bow, unfinished business you can send back in, the Producer's code-polish notes, and **the Mic**: a voiced walkthrough where each agent narrates its own part, in the order it was called.

Soundcheck is **multi-tenant**: sign in with an email, password, and nickname, and you see only the runs you started. The read-projection backend is locked behind an internal key and fronted by an authenticated proxy that enforces per-user ownership on every request.

It's **defensive-only** by design — it finds, explains, and remediates; it never generates exploit code, and discovered secrets are always redacted. Built on Band for the Band of Agents Hackathon. MIT-licensed, original work.

## Tech at a glance

- **Band** — system of record; all agent coordination via memory / messages / events.
- **Agents** — Python (LangGraph), 8 specialists across **AI/ML API** (frontier) + **Featherless** (open-source).
- **Frontend** — Next.js 15 (App Router, TypeScript); Auth.js email/password accounts; per-user runs.
- **Backend** — FastAPI read-projection, locked behind an internal key, fronted by an authenticated proxy.
- **Data** — Postgres (accounts + run ownership); SQLite (UI read cache). Provenance-complete, replayable.
- Defensive-only · human approval before any PR · MIT.
