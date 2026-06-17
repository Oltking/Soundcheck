# Soundcheck BFF + agents + scanners — the full live host (Render).
# Unlike Vercel serverless, this is a persistent container that can spawn the
# long-running agent processes, run git + the scanners, and hold the Band sockets.
FROM python:3.12-slim

# git for cloning targets + opening PRs; node/npm for the dependency scanner's
# `npm audit` path (Python scanners are pip-installed below).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git nodejs npm ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -U pip \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Boot: materialise agent_config.yaml from the env var, then start the BFF.
CMD ["sh", "scripts/render_start.sh"]
