// Playwright browser tests for the demo path (npm run e2e).
// Deterministic and free: they start their own server on port 5090 with the
// fixture AI provider, and stub /api/ask in the browser. Guest flows only;
// Google sign-in stays a manual QA case.
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT) || 5090;   // E2E_PORT=5091 for a second worktree

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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // A one-off Safari check (#164): E2E_WEBKIT=1 npx playwright test --project=webkit <spec>.
    ...(process.env.E2E_WEBKIT ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
  ],
  webServer: {
    command: 'node backend/server.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    // PHOTO_PROVIDERS=fixture: no photo route reaches Gemini through a
    // GEMINI_API_KEY in the shell, whatever a spec forgets to stub.
    // VOICE_PROVIDER=fixture: the same for /api/voice and ElevenLabs (#12).
    env: { PORT: String(PORT), AI_PROVIDER: 'fixture', PHOTO_PROVIDERS: 'fixture', VOICE_PROVIDER: 'fixture' },
  },
});
