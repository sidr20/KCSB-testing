#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

bash scripts/ensure-python.sh
bash scripts/warn-openai-key.sh
exec .venv/bin/python -m apps.api

