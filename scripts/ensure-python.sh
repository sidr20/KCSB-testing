#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

venv_python=".venv/bin/python"
requirements_file="requirements.txt"
stamp_file=".venv/.requirements.sha256"

if [[ ! -x "$venv_python" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 not found in PATH." >&2
    exit 1
  fi
  echo "Creating Python venv at .venv/ ..."
  python3 -m venv .venv
fi

if [[ ! -f "$requirements_file" ]]; then
  echo "Error: $requirements_file not found (expected at repo root)." >&2
  exit 1
fi

current_hash="$(
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$requirements_file" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$requirements_file" | awk '{print $1}'
  else
    "$venv_python" - <<'PY'
import hashlib, pathlib
p = pathlib.Path("requirements.txt")
print(hashlib.sha256(p.read_bytes()).hexdigest())
PY
  fi
)"

installed_hash=""
if [[ -f "$stamp_file" ]]; then
  installed_hash="$(cat "$stamp_file" || true)"
fi

if [[ "$current_hash" != "$installed_hash" ]]; then
  echo "Installing Python dependencies from $requirements_file ..."
  "$venv_python" -m pip install --upgrade pip >/dev/null
  "$venv_python" -m pip install -r "$requirements_file"
  mkdir -p "$(dirname "$stamp_file")"
  printf "%s" "$current_hash" >"$stamp_file"
fi

