import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  testMatch: "chemistry-lab.browser.ts",
  timeout: 60000,
});
