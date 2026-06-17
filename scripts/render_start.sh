#!/usr/bin/env sh
# Render boot: write the gitignored agent credentials from an env var, then start
# the BFF. Other secrets (AIMLAPI/Featherless/GitHub/THENVOI_*) are read straight
# from the environment by the app and inherited by the agent subprocesses.
set -e

if [ -n "$AGENT_CONFIG_YAML" ]; then
  printf '%s' "$AGENT_CONFIG_YAML" > /app/agent_config.yaml
  echo "[boot] agent_config.yaml written ($(grep -c ':' /app/agent_config.yaml) keys)"
else
  echo "[boot] WARNING: AGENT_CONFIG_YAML not set — Band/agent calls will fail"
fi

cd /app/backend
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
