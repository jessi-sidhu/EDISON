// ─────────────────────────────────────────────────────────────
//  capture-board.js — a starting board for the eval's edit cases (issue #85),
//  captured from the running app. Starts the server (AI_PROVIDER=fixture, a
//  free port), opens the editor in Playwright's Chromium, answers /api/ask
//  with a stubbed build and accepts it, then writes
//  { board: App.exportBoard(), markdown: App.exportMarkdown() } to
//  scripts/ai-eval-boards/<name>.json. No real AI is called.
//
//  RUN (from Plugged/):
//    node scripts/capture-board.js             every board below
//    node scripts/capture-board.js one-led     one board, by name
// ─────────────────────────────────────────────────────────────

const fs    = require('node:fs');
const net   = require('node:net');
const path  = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(__dirname, 'ai-eval-boards');

// The prompt's one-LED recipe at C=2 (test/fixtures/recipes.js ONE_LED).
const ONE_LED = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
];

// name → the actions that build it.
const BOARDS = {
  'one-led':       ONE_LED,
  // The same with LED1's holes swapped: its anode on the ground column, dark.
  'backwards-led': ONE_LED.map(a => (a.tool === 'place_led' ? { ...a, holeA: a.holeB, holeB: a.holeA } : a)),
};

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function waitForHealth(url, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`server did not answer ${url}`);
}

// One board: build it through the chat panel's Accept, then export it.
async function capture(browser, base, actions) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'Built it.', actions } }));
  await page.goto(`${base}/circuit3d/index.html`);
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer && window.sparkyAsk);
  await page.evaluate(() => window.sparkyAsk('Build the circuit.'));
  await page.locator('#sparky-pending-bar').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(n => App.exportBoard().parts.length + App.exportBoard().wires.length === n,
    actions.filter(a => a.tool !== 'delete_all').length);
  const saved = await page.evaluate(() => ({ board: App.exportBoard(), markdown: App.exportMarkdown() }));
  await page.close();
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  return saved;
}

async function main() {
  const only  = process.argv[2];
  const names = Object.keys(BOARDS).filter(n => !only || n === only);
  if (!names.length) {
    console.error(`capture-board: no board named ${JSON.stringify(only)} (have ${Object.keys(BOARDS).join(', ')})`);
    process.exit(2);
  }

  const port   = await freePort();
  const base   = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['backend/server.js'], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), AI_PROVIDER: 'fixture' },
  });
  let browser;
  try {
    await waitForHealth(`${base}/api/health`);
    browser = await chromium.launch();
    fs.mkdirSync(OUT, { recursive: true });
    for (const name of names) {
      const saved = await capture(browser, base, BOARDS[name]);
      const file  = path.join(OUT, `${name}.json`);
      fs.writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`);
      console.log(`${name}: ${saved.board.parts.length} parts, ${saved.board.wires.length} wires → ${path.relative(ROOT, file)}`);
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

if (require.main === module) {
  main().catch(e => { console.error(`capture-board: ${e.message}`); process.exit(1); });
}

module.exports = { BOARDS };
