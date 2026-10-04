// Placement checks in the page, issue #24: Parts.checkPlacement guards hand
// placement and the AI apply path for registry parts (the resistor today),
// and a registry part from an old file that breaks a rule loads flagged:
// it simulates as saved and its warning shows in the results and the AI
// summary. /api/ask is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page, ask = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: ask }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Where a board hole ("c30") is on screen, in page pixels.
function screenPoint(page, where) {
  return page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const h = App.state.breadboard.getHole(col, row);
    const p = h.world ? h.world.clone() : new THREE.Vector3(h.x, 0, h.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
}

// Hover then click a hole, the way a person places the picked part.
async function clickHole(page, where) {
  const at = await screenPoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

const count = page => page.evaluate(() => App.state.components.length);

test('placing a resistor by hand into a taken hole is refused with the reason as the hint', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();

  await clickHole(page, 'c30');                 // R1 at c30–c34
  expect(await count(page)).toBe(1);

  await clickHole(page, 'c26');                 // c26–c30: c30 holds R1's first lead
  expect(await count(page), 'no part is added').toBe(1);
  await expect(page.locator('#hint-text'))
    .toContainText("c30 already holds R1's pin lead1. A hole holds one lead; use another hole in column 30.");

  await clickHole(page, 'c20');                 // c20–c24: free, placed as R2
  expect(await count(page)).toBe(2);
  expect(errors).toEqual([]);
});

// The AI's resistor runs a3 to a33: 30 columns, the resistor allows 3–5.
const STRETCHED_BUILD = {
  reply: 'Here is a resistor.',
  actions: [
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a33' },
  ],
};

test('accepting an AI build with an over-stretched resistor shows the refusal and counts it as failed', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page, STRETCHED_BUILD);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();

  const system = page.locator('.chat-msg.system');
  await expect(system.filter({ hasText: '3–5' }), 'a visible note with the allowed range').toHaveCount(1);
  await expect(system.filter({ hasText: '3–5' })).toContainText("a resistor's leads must be 3–5 columns apart; a3 to a33 is 30.");
  await expect(system.last()).toHaveText('✓ Applied 1 change to your circuit. 1 could not be applied.');
  expect(await page.evaluate(() => App.state.components.map(c => c.type))).toEqual(['battery']);
  expect(errors).toEqual([]);
});

// An old file (no pin names) with R1 at a3–a33, straight across 9 V.
const h = (col, row) => ({ col, row });
const STRETCHED_FILE = {
  id: 'stretched-e2e', name: 'Old stretched resistor',
  components: [
    { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: -3.15 } },
    { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(2, 'a'), h(32, 'a')], position: { x: 0, z: 0 } },
  ],
  wires: [
    { startHole: null, endHole: h(2, 'b'),  startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    { startHole: null, endHole: h(32, 'b'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
  ],
};

const isStretchWarning = s => /\bR1\b/.test(s) && s.includes('3–5') && /\b30\b/.test(s);

test('an old file with a resistor 30 columns wide loads, simulates, and shows the warning', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(d => sessionStorage.setItem('sparky_load_circuit', JSON.stringify(d)), STRETCHED_FILE);
  await page.reload();
  await page.waitForFunction(() => window.App && App.state && App.renderer && App.state.components.length > 0);

  const r1 = await page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'R1');
    return c && c.holeRefs.map(r => ({ col: r.col, row: r.row }));
  });
  expect(r1, 'R1 loads where it was saved, not moved').toEqual([h(2, 'a'), h(32, 'a')]);

  await page.locator('#sim-run-btn').click();
  const lines = await page.locator('#sim-results .sim-line').allTextContents();
  expect(lines.some(isStretchWarning), `a results line warns about R1:\n${lines.join('\n')}`).toBe(true);
  await page.evaluate(() => App.stopSimulation());

  const md = await page.evaluate(() => App.exportMarkdown());
  const sim = md.slice(md.indexOf('## Simulation'));
  expect(sim).toMatch(/R1: 470 ohm resistor, 19\.1 mA/);   // it still conducts
  expect(sim.split('\n').some(isStretchWarning), `the AI summary carries the warning:\n${sim}`).toBe(true);
  expect(errors).toEqual([]);
});
