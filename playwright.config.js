import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.js",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    headless: true,
    // A verified local browser can be supplied; otherwise use Playwright's browser.
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: "node scripts/browser-server.mjs",
    url: "http://127.0.0.1:8787",
    // Tests must never reuse a creator's working database or running studio.
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
