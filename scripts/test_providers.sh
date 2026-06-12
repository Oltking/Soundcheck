#!/usr/bin/env bash
# P0 provider smoke test — one minimal chat call per provider (CLAUDE.md "Models" section).
# Usage: bash scripts/test_providers.sh   (reads .env in repo root)
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in keys." >&2
  exit 1
fi
set -a; source .env; set +a

fail=0

probe() {
  local name="$1" base="$2" key="$3" model="$4"
  if [ -z "${key:-}" ]; then
    echo "[$name] SKIP — key not set in .env"
    fail=1
    return
  fi
  echo "=== [$name] model list (confirm model-id strings) ==="
  # Featherless's list is ~5MB; allow time and report count + a relevant sample.
  curl -sS --max-time 180 "$base/models" -H "Authorization: Bearer $key" \
    | python -c "
import sys, json
d = json.load(sys.stdin)
ids = sorted({m.get('id') for m in d.get('data', [])})
print('models:', len(ids))
hits = [i for i in ids if any(k in i.lower() for k in ('claude', 'qwen2.5-coder', 'gpt-5', 'deepseek'))]
print('\n'.join(hits[:15] or ids[:10]))" \
    || { echo "[$name] model list FAILED (informational — chat call below is the real gate)"; }

  echo "=== [$name] one-line chat completion ($model) ==="
  resp=$(curl -sS --max-time 60 "$base/chat/completions" \
    -H "Authorization: Bearer $key" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"max_tokens\":20,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: soundcheck ok\"}]}")
  echo "$resp" | python -c "
import sys, json
d = json.load(sys.stdin)
if 'choices' in d:
    print('REPLY:', d['choices'][0]['message']['content'].strip())
    print('PASS')
else:
    print('FAIL:', json.dumps(d)[:400])
    raise SystemExit(1)
" || fail=1
}

probe "AI/ML API"   "https://api.aimlapi.com/v1"      "${AIMLAPI_API_KEY:-}"     "${AIMLAPI_TEST_MODEL:-anthropic/claude-sonnet-4.6}"
echo
probe "Featherless" "https://api.featherless.ai/v1"   "${FEATHERLESS_API_KEY:-}" "${FEATHERLESS_TEST_MODEL:-Qwen/Qwen2.5-Coder-32B-Instruct}"

exit $fail
