#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

bash scripts/ensure-python.sh
bash scripts/ensure-web.sh

if [[ ! -f ".env" && -f ".env.example" ]]; then
  echo "Creating .env from .env.example ..."
  cp ".env.example" ".env"
fi

echo "Setup complete."

