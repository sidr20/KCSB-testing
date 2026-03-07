#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

bash scripts/ensure-python.sh
bash scripts/ensure-web.sh

.venv/bin/python -c "import apps.api.__main__"
.venv/bin/python -m unittest discover -s apps/api/tests -v
node apps/web/tests/evidenceNavigation.test.mjs
node apps/web/tests/pbpAdvancedFilters.test.mjs
npm --prefix apps/web run build
