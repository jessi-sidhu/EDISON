// Playwright browser tests for the demo path (npm run e2e).
// Deterministic and free: they start their own server on port 5090 with the
// fixture AI provider, and stub /api/ask in the browser. Guest flows only;
// Google sign-in stays a manual QA case.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 5090;

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node backend/server.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), AI_PROVIDER: 'fixture' },
  },
});
