#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "缺少 Node.js/npm。请安装 Node.js 24 LTS（Apple Silicon 版本）后重试。" >&2; exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(!((a===20&&b>=19)||(a===22&&b>=12)||a>=24)){console.error("需要 Node 20.19+、22.12+ 或 24+ 的稳定偶数版本");process.exit(1)}'
PY="${PYTHON_BIN:-}"
if [ -z "$PY" ]; then
  for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys;sys.exit(sys.version_info < (3,11))'; then PY="$candidate"; break; fi
  done
fi
if [ -z "$PY" ] || ! "$PY" -c 'import sys;sys.exit(sys.version_info < (3,11))'; then
  echo "缺少 Python 3.11+。可安装 Python 3.11/3.12，或设置 PYTHON_BIN。" >&2; exit 1
fi
if command -v uv >/dev/null; then
  uv sync --project "$ROOT/backend" --python "$PY" --frozen
else
  [ -x "$ROOT/backend/.venv/bin/python" ] || "$PY" -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/python" -m pip install -r "$ROOT/backend/requirements-dev.txt"
fi
npm --prefix "$ROOT/frontend" ci
echo "开发环境安装完成。运行 ./scripts/start.sh 启动。"
