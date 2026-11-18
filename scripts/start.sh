#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -x "$ROOT/backend/.venv/bin/python" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "首次运行，准备独立开发依赖…"
  "$ROOT/scripts/setup.sh"
fi
exec "$ROOT/backend/.venv/bin/python" "$ROOT/scripts/dev.py"
