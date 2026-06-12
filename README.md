# Soundcheck

A governed, replayable autonomous workforce for security & compliance remediation, built on **[Band](https://band.ai)** for the Band of Agents Hackathon. Agents audit a connected repo, fix what's safe, get human approval, open PRs — every step provenance-tracked through Band and replayable.

> The band performs. You conduct. The tape remembers everything.

## Monorepo layout (spec §3)

```
agents/      Python long-running Band remote agents (SDK import: thenvoi)
  common/      band_client, ledger (memory), events discipline   [P1]
  scanners/    code / dependencies / secrets-config scanners      [P2]
  fixer/       patch-proposing agent                              [P3]
  scout.py bandleader.py compliance_mapper.py reviewer.py        [P2/P3]
backend/     FastAPI BFF — Human-API/WS bridge, webhooks, ledger projection [P4]
frontend/    Next.js App Router + TS; design system = design/tokens.css     [P5]
packages/
  band-types/  TS types generated from Band's OpenAPI spec        [P0 ✓]
infra/       docker-compose (Postgres projection), migrations
design/      Claude Design handoff (tokens + Stage reference)
band_research/  verbatim harvested Band docs — source of truth for API calls
scripts/     provider smoke tests, codegen helpers
```

## Ground rules (see CLAUDE.md)

- **Band is load-bearing** — agents never coordinate through our DB/files/queues.
- **Defensive security only.** Human approval before any PR. Secrets always redacted.
- Models via **AI/ML API** (frontier) + **Featherless** (OSS) — no paid Anthropic/OpenAI keys.

## Getting started

```bash
cp .env.example .env                  # fill in keys (never commit)
cp agent_config.yaml.example agent_config.yaml   # Band agent credentials
bash scripts/test_providers.sh        # P0 provider smoke test
```

License: MIT.
