import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  testMatch: "textbook-content.browser.ts",
  webServer: {
    ...(base.webServer as object),
    command: "../backend/.venv/bin/python ../tests/content_browser_server.py",
  },
});
