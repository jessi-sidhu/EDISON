// The page announces each solve with plugged:sim and Stop with
// plugged:sim-stop (issue #90, docs/API-CONTRACT.md → "Page events").
// Builds the circuit through window.App (the calls the mouse handlers and
// Chat.acceptBuild make), then clicks the real Run and Stop buttons.
// /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// 9 V divider: BAT1.0 → tp_2 → a10, R1 1 kΩ a10–a14, R2 2 kΩ b14–b18,
// c18 → tn_18 ← BAT1.1. I = 9 / 3000 = 3 mA; V(R1) = 3 V, V(R2) = 6 V.
async function buildDivider(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    const wireBat = (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    };

    App.placePart('battery', { x: 13, z: 0 });
    wireBat(0, 'tp_2');
    wireBat(1, 'tn_18');
    App.placePart('resistor', [hole('a10'), hole('a14')], { resistance: 1000 });
    App.placePart('resistor', [hole('b14'), hole('b18')], { resistance: 2000 });
    wireHoles('tp_10', 'c10');
    wireHoles('c18', 'tn_18');
  });
}

test('Run sends plugged:sim with the result and readings (R1: 3 V, 3 mA); Stop sends plugged:sim-stop', async ({ page }) => {
  await openEditor(page);
  await buildDivider(page);
  await page.evaluate(() => {
    window.__sims = [];
    window.__stops = 0;
    document.addEventListener('plugged:sim', e => {
      const { result, readings } = e.detail || {};
      const r1 = readings && readings.part('R1');
      window.__sims.push({ status: result && result.status, r1: r1 && { V: r1.V, I: r1.I, over: r1.over } });
    });
    document.addEventListener('plugged:sim-stop', () => { window.__stops++; });
  });

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__sims.length)).toBeGreaterThan(0);
  const sim = await page.evaluate(() => window.__sims[window.__sims.length - 1]);
  expect(sim.status).toBe('ok');
  expect(sim.r1, 'detail.readings.part("R1")').toBeTruthy();
  expect(sim.r1.V).toBeCloseTo(3, 4);
  expect(sim.r1.I).toBeCloseTo(3, 4);
  expect(sim.r1.over).toBe(false);
  expect(await page.evaluate(() => window.__stops)).toBe(0);

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => page.evaluate(() => window.__stops)).toBe(1);
});
