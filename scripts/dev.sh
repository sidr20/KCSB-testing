#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Preflight sequentially so installs don't run concurrently.
bash scripts/ensure-python.sh
bash scripts/ensure-web.sh
bash scripts/warn-openai-key.sh

echo "Starting API + Web dev servers ..."

(.venv/bin/python -m apps.api) &
api_pid=$!

(npm --prefix apps/web run dev) &
web_pid=$!

cleanup() {
  for pid in "$api_pid" "$web_pid"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait "$api_pid" "$web_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait "$api_pid" "$web_pid"
