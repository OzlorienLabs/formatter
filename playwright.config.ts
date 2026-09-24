import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 4 : 6,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000", launchOptions: executablePath ? { executablePath } : undefined },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run start", port: 3000, reuseExistingServer: true, timeout: 120_000 },
});
