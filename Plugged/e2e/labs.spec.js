// The "ENSC 220 Labs" menu, issue #98: a header button that opens (on a
// click, not a hover) a list of lab starter circuits, starting with Lab 1.
// Picking one loads circuit3d/labs/lab1.sparky through the same path as
// opening a .sparky file, so it is one undo step.
//
// Lab 1 (decided by Aarmen, issue #98): bench supply PS1 at +10 V → R1 1 kΩ
// → node A → R2 2.2 kΩ ∥ R3 3.3 kΩ → COM. Expected: I(R1) 4.31 mA,
// I(R2) 2.59 mA, I(R3) 1.72 mA, V(A) 5.69 V. The numbers themselves are
// checked against the real simulator in test/lab1-circuit.test.js; here the
// point is the page: the menu, the load, Run, and undo.
//
// The results panel prints the supply's headline (its + rail current);
// resistors have no line of their own, so their currents are read from the
// readings the page announces with every solve (plugged:sim, API-CONTRACT →
// "Page events"). /api/ask is stubbed and never called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const labels = page => page.evaluate(() => App.state.components.map(c => c.label).sort());

// The board as it would be saved: each part and each wire.
const board = page => page.evaluate(() => ({
  name: App.state.circuitName,
  components: App.state.components.map(c => ({
    type: c.type, label: c.label, values: JSON.parse(JSON.stringify(c.values || {})), holes: App.saveHoleRefs(c),
  })),
  wires: App.state.wires.map(w => App.wireRecord(w, App.state.components)),
}));

const labMenuItem = page => page.getByText(/^\s*Lab 1\b/).filter({ visible: true });

// Header button → Lab 1, the way a student does it.
async function openLab1(page) {
  const menu = page.locator('#labs-menu-btn');
  await expect(menu).toHaveText(/ENSC 220 Labs/);
  await menu.hover();
  await expect(labMenuItem(page), 'the menu opens on a click, not a hover').toHaveCount(0);
  await menu.click();
  await expect(labMenuItem(page)).toHaveCount(1);
  await labMenuItem(page).click();
  await expect.poll(() => labels(page), { message: 'Lab 1 loads PS1, R1, R2 and R3' }).toEqual(['PS1', 'R1', 'R2', 'R3']);
}

test('ENSC 220 Labs → Lab 1 loads the circuit, and Run gives the Lab 1 readings', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);

  await openLab1(page);
  expect(await page.evaluate(() => App.state.components.length)).toBe(4);

  // What the page's tools read from the solve Run triggers.
  await page.evaluate(() => {
    window.__lab1 = null;
    document.addEventListener('plugged:sim', e => {
      const { result, readings } = e.detail;
      const I = label => { const p = readings && readings.part(label); return p ? Math.abs(p.I) : null; };
      window.__lab1 = { status: result.status, R1: I('R1'), R2: I('R2'), R3: I('R3') };
    });
  });
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__lab1 && window.__lab1.status)).toBe('ok');

  const got = await page.evaluate(() => window.__lab1);
  expect(got.R1, 'I(R1) mA').toBeCloseTo(4.3103, 2);
  expect(got.R2, 'I(R2) mA').toBeCloseTo(2.5862, 2);
  expect(got.R3, 'I(R3) mA').toBeCloseTo(1.7241, 2);

  // The results panel: the supply at 10 V, its + rail carrying I(R1).
  await expect.poll(async () => (await simLines(page)).join(' | ')).toMatch(/10\s*V/);
  expect((await simLines(page)).join(' | ')).toMatch(/\+ 4\.3 mA/);
  expect(errors).toEqual([]);
});

test('loading Lab 1 over a circuit is one undo step: Ctrl/Cmd+Z puts the old board back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
  const before = await board(page);
  expect(before.components.map(c => c.label).sort()).toEqual(['BAT1', 'LED1', 'R1', 'SW1']);

  await openLab1(page);
  expect((await board(page)).components.map(c => c.type)).toContain('bench_supply');

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => labels(page), { message: 'undo brings back the demo circuit' }).toEqual(['BAT1', 'LED1', 'R1', 'SW1']);
  expect(await board(page)).toEqual(before);
  expect(errors).toEqual([]);
});
