#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
.venv/bin/python -m pytest -q
cd "$ROOT/frontend"
npm run typecheck
npm run build
node ../scripts/check_lab_localization.mjs
node --experimental-strip-types --test ../tests/lab-science.test.mjs
npm run test:e2e
npx playwright test --config=playwright.content.config.ts
npx playwright test --config=playwright.lab.config.ts
cd "$ROOT"
backend/.venv/bin/python tests/test_startup.py
