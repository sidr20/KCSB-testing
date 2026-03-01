#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ ! -f ".env" ]]; then
  echo "Warning: .env not found. Insight generation will fail until OPENAI_API_KEY is configured." >&2
  exit 0
fi

if ! grep -Eq '^[[:space:]]*OPENAI_API_KEY=[^[:space:]#]' .env; then
  echo "Warning: OPENAI_API_KEY is not configured in .env. /api/insights will fail." >&2
fi
