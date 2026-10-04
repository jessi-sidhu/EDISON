// Issue #61: the bottom rails were drawn backwards. The red stripe sat on
// bn (GND), so hovering it read "Row BN" while the AI prompt calls bp the +
// rail. Now the red stripe on each half is its + rail: tp on top, bp below.
// Finds each drawn 3D rail stripe (a thin red or blue box in the breadboard
// group), moves the real mouse onto it in wire mode and reads the hole label.
// Guest only; /api/ask is stubbed and never called.
const { test, expect } = require('@playwright/test');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Page pixels of a point on the stripe of the given colour and half of the
// board ('top' = far side, 'bottom' = near side), at column 30.
function stripePoint(page, colour, half) {
  return page.evaluate(({ colour, half }) => {
    const bb = App.state.breadboard;
    const stripes = bb.group.children.filter(m => {
      if (!m.isMesh || !m.geometry || !m.geometry.parameters) return false;
      const p = m.geometry.parameters;
      return p.height === 0.005 && p.depth === 0.21;   // addRailStrip's box
    });
    const want = stripes.filter(m => {
      const c = m.material.color;
      const isRed = c.r > c.b;
      return (colour === 'red' ? isRed : !isRed) && (half === 'top' ? m.position.z < 0 : m.position.z > 0);
    });
    if (want.length !== 1) throw new Error(`expected one ${colour} ${half} stripe, found ${want.length}`);
    const x = bb.getHole(29, 'a').x;
    const p = new THREE.Vector3(x, 0, want[0].position.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, { colour, half });
}

async function hoverLabel(page, colour, half) {
  const at = await stripePoint(page, colour, half);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  const label = page.locator('#hole-label');
  await expect(label).toBeVisible();
  return label.textContent();
}

test('hovering the bottom red stripe reads "Row BP", like the top red one reads "Row TP"', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await openEditor(page);
  await page.evaluate(() => App.setMode('wire'));

  expect(await hoverLabel(page, 'red',  'top')).toMatch(/Row TP\b/);
  expect(await hoverLabel(page, 'blue', 'top')).toMatch(/Row TN\b/);
  expect(await hoverLabel(page, 'red',  'bottom')).toMatch(/Row BP\b/);
  expect(await hoverLabel(page, 'blue', 'bottom')).toMatch(/Row BN\b/);
  expect(errors).toEqual([]);
});
