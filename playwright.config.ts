import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
