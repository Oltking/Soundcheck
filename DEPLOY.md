# Deploying Soundcheck

The app is two pieces:

- **Frontend** → **Vercel** (Next.js: the UI, auth, and the BFF proxy).
- **Backend** → **Render** (the FastAPI BFF **and** the agents, in one always-on Docker container — Vercel's serverless can't spawn the long-running agent processes).

The browser only ever talks to Vercel. Vercel's server code calls the Render BFF **privately**, with a shared `INTERNAL_API_KEY`. The BFF rejects anything without that key, so the Render URL can't be used to pull data directly.

```
Browser ─▶ Vercel (auth + proxy) ──X-Internal-Key──▶ Render (BFF + agents) ─▶ Band
                  │                                          │
            Postgres (accounts)                        clones repos, runs scanners, opens PRs
```

---

## 1. Backend on Render

1. Push to GitHub (the repo Render will build from).
2. **Render → New → Blueprint** → connect this repo. Render reads `render.yaml` and creates the **`soundcheck-bff`** web service (Docker, always-on `starter` plan).
3. In the service's **Environment**, set these (all marked `sync: false`, so Render prompts for them):

   | Variable | Value |
   |---|---|
   | `INTERNAL_API_KEY` | a secret you generate — `openssl rand -hex 24`. **Save it**; you reuse it on Vercel. |
   | `ALLOWED_ORIGINS` | `https://soundcheck-beta.vercel.app` |
   | `AIMLAPI_API_KEY` | your AI/ML API key (frontier lane) |
   | `FEATHERLESS_API_KEY` | your Featherless key (open-source lane) |
   | `GITHUB_TOKEN` | a token scoped to the repos you'll audit (repo + PR) |
   | `THENVOI_REST_URL` | `https://app.band.ai/` |
   | `THENVOI_WS_URL` | `wss://app.band.ai/api/v1/socket/websocket` |
   | `AGENT_CONFIG_YAML` | **the entire contents** of your local `agent_config.yaml` (paste it) |

   > The BFF does **not** need `DATABASE_URL` — Postgres is only for accounts, which live on Vercel.

4. Deploy. First build takes a few minutes (Docker + Python deps + scanners). When it's live, open `https://<your-service>.onrender.com/health` → should return `{"status":"ok"}`.

## 2. Frontend on Vercel

In the Vercel project (**Settings → Environment Variables**), add/confirm:

| Variable | Value |
|---|---|
| `BFF_INTERNAL_URL` | your Render URL, e.g. `https://soundcheck-bff.onrender.com` (no trailing slash) |
| `INTERNAL_API_KEY` | **the same value** you set on Render |
| `AUTH_SECRET` | already set (session secret) |
| `DATABASE_URL` | already set (Supabase pooler URL) |
| `AUTH_URL` | `https://soundcheck-beta.vercel.app` (optional; `trustHost` infers it) |

Then **redeploy** the Vercel project so the new vars take effect.

## 3. Verify

Open the Vercel site → log in → **Start an audit**. The `502`/"fetch failed (:8000)" is gone; the request now reaches the Render BFF and a run begins.

---

## Notes & gotchas

- **Frontier quota.** If `AIMLAPI_API_KEY` is exhausted, the Bandleader / Fixer / Reviewer lane returns `403` and runs stall at the fix step. The scan + control-mapping (open-source lane) still works. Rotate the key for full end-to-end runs.
- **The agents run on Render**, so cloning, scanners, and PRs all happen there — `GITHUB_TOKEN` must be valid for the target repos.
- **Keep the plan always-on** (`starter`+). The free tier sleeps, which kills in-flight runs.
- **`INTERNAL_API_KEY` must match** on Render and Vercel, or every request 403s. If unset on Render, the BFF is open to the public — always set it.
- The BFF's SQLite cache is ephemeral on Render; that's fine — it re-projects from Band (the system of record) on demand.
