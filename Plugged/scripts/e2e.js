// ─────────────────────────────────────────────────────────────
//  e2e.js — runs the browser tests at low CPU priority on the Mac
//  (issue #111). On the Mac, a Playwright run otherwise pins the CPU and
//  the laptop stalls; at priority 15 it still runs, just after everything
//  the person is doing. Windows and Linux (CI) keep their normal priority.
//
//  RUN (from Plugged/):
//    npm run e2e                                   every spec
//    npm run e2e -- e2e/x.spec.js --workers=1      args go to `playwright test`
//  Exits with the runner's exit code (1 if it died on a signal).
//
//  E2E_RUNNER (tests only, test/e2e-runner.test.js): an absolute path to a
//  JS file run as `node <E2E_RUNNER> <args...>` in place of Playwright.
// ─────────────────────────────────────────────────────────────

const os   = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Lower our own priority first, so the runner and its browsers inherit it.
if (process.platform === 'darwin') {
  try {
    os.setPriority(15);
  } catch (err) {
    console.warn(`e2e: could not lower the CPU priority (${err.message}); running at normal priority`);
  }
}

// Playwright's own CLI file, run with this node: no shell on any platform.
function playwrightCli() {
  const pkgPath = require.resolve('@playwright/test/package.json');
  const pkg     = require(pkgPath);
  return path.join(path.dirname(pkgPath), pkg.bin.playwright);
}

const args = process.env.E2E_RUNNER
  ? [process.env.E2E_RUNNER, ...process.argv.slice(2)]
  : [playwrightCli(), 'test', ...process.argv.slice(2)];

const child = spawn(process.execPath, args, { stdio: 'inherit' });

// Pass a stop on to the runner and wait for it to finish cleaning up.
// (Playwright ignores a repeat SIGINT within a second, so a Ctrl-C that
// reaches both of us is still one stop, not a forced kill.)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

child.on('error', err => {
  console.error(`e2e: could not start the runner: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code);
});
