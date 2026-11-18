import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
// Unique scratch storage outside source. Never touch the user's default database.
const testRoot = join(
  realpathSync(tmpdir()),
  `taw-e2e-${process.pid}-${Date.now()}`,
);
export default defineConfig({
  testDir: "../tests",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5188",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "../backend/.venv/bin/python ../scripts/dev.py",
    url: "http://127.0.0.1:5188/api/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15000 },
    timeout: 60000,
    env: {
      TAW_DATA_DIR: join(testRoot, "data"),
      TAW_BACKUP_DIR: join(testRoot, "backups"),
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
