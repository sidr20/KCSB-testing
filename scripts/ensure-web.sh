#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

web_dir="apps/web"
manifest_file="$web_dir/package.json"
lock_file="$web_dir/package-lock.json"
stamp_file="$web_dir/node_modules/.install-state"

if [[ ! -d "$web_dir" ]]; then
  echo "Error: expected frontend at $web_dir/." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found in PATH." >&2
  exit 1
fi

state_sources=("$manifest_file")
install_cmd=(npm --prefix "$web_dir" install)
if [[ -f "$lock_file" ]]; then
  state_sources+=("$lock_file")
  install_cmd=(npm --prefix "$web_dir" ci)
fi

current_state="$(
  if command -v shasum >/dev/null 2>&1; then
    cat "${state_sources[@]}" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    cat "${state_sources[@]}" | sha256sum | awk '{print $1}'
  else
    echo "Error: no SHA-256 utility found for web dependency state tracking." >&2
    exit 1
  fi
)"
installed_state=""

if [[ -f "$stamp_file" ]]; then
  installed_state="$(cat "$stamp_file" || true)"
fi

if [[ ! -d "$web_dir/node_modules" || "$current_state" != "$installed_state" ]]; then
  echo "Installing web dependencies in $web_dir/ ..."
  "${install_cmd[@]}"
  mkdir -p "$(dirname "$stamp_file")"
  printf "%s" "$current_state" >"$stamp_file"
fi
