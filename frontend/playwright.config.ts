import { defineConfig, devices } from "@playwright/test";

const backendPython = process.env.PYTHON ? `"${process.env.PYTHON}"` : "python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `${backendPython} -m app.e2e_server`,
      cwd: "../backend",
      url: "http://127.0.0.1:8000/openapi.json",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: "sqlite:///./cybercheck-e2e.db",
        COOKIE_SECURE: "false",
        PREMIUM_ENABLED: "true",
      },
    },
    {
      command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1",
      cwd: ".",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
