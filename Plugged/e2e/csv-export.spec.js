// Export CSV (issue #101). tools/csv-export.js adds #csv-export-btn after
// #sim-stop-btn. It is hidden or disabled until a solve (plugged:sim), and
// again after Stop (plugged:sim-stop). A click downloads
// "<circuit name>-readings.csv", built by toCSV from the latest solve.
// Builds the circuit through window.App (the calls the mouse handlers and
// Chat.acceptBuild make), then clicks the real Run, Export CSV and Stop
// buttons. /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

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

// Hidden, or shown but disabled: either way it can't be used.
async function expectUnusable(btn, when) {
  const usable = await btn.isVisible() && await btn.isEnabled();
  expect(usable, `#csv-export-btn should be hidden or disabled ${when}`).toBe(false);
}

test('Export CSV downloads "<circuit name>-readings.csv" with the R1 and R2 rows; Stop makes the button unusable again', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await buildDivider(page);
  await page.evaluate(() => { App.state.circuitName = 'Divider Lab'; });

  const btn = page.locator('#csv-export-btn');
  await expect(btn, 'csv-export.js adds the button').toHaveCount(1);
  await expectUnusable(btn, 'before Run');

  await page.locator('#sim-run-btn').click();
  await expect(btn, 'shown while simulating').toBeVisible();
  await expect(btn, 'enabled while simulating').toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  expect(download.suggestedFilename()).toBe('Divider Lab-readings.csv');
  expect(download.suggestedFilename()).toMatch(/-readings\.csv$/);

  const lines = fs.readFileSync(await download.path(), 'utf8').split('\n');
  expect(lines[0]).toBe('Label,Type,V (V),I (mA),P (mW)');
  expect(lines).toContain('R1,resistor,3.00,3.00,9.00');
  expect(lines).toContain('R2,resistor,6.00,3.00,18.00');
  expect(lines, 'the net section follows the parts').toContain('Net,Holes,V (V)');

  await page.locator('#sim-stop-btn').click();
  await expect.poll(async () => await btn.isVisible() && await btn.isEnabled(),
    { message: '#csv-export-btn should be hidden or disabled after Stop' }).toBe(false);
  expect(errors).toEqual([]);
});
