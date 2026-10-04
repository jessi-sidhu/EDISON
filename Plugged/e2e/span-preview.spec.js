// Issue #53: App.SPANS is gone; the AI preview draws a span part at its
// registry default span (def.place.span.default). A behaviour guard: the
// place_resistor ghost is as wide as a span-4 resistor (the resistor's
// default), not span 3 or 5, and nothing throws on the way.
//
// Hand placement at each part's default span is already covered by
// e2e/parts.spec.js ("<type>: pick it in the sidebar, see its ghost, place
// it, ..." checks holeRefs[1].col = 29 + place.span.default for every span
// part); not repeated here.
//
// /api/ask is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const build = {
  reply: 'A resistor.',
  actions: [{ tool: 'place_resistor', holeA: 'b10', holeB: 'b14' }],
};

test('the AI preview ghost for place_resistor is drawn at the resistor\'s default span (4)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.route('**/api/ask', route => route.fulfill({ json: build }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(() => { window.__before = App.scene.children.length; });
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();

  const widths = await page.evaluate(() => {
    const width = o => { const s = new THREE.Vector3(); new THREE.Box3().setFromObject(o).getSize(s); return s.x; };
    const ghosts = App.scene.children.slice(window.__before);
    const HS = App.state.breadboard.HS;
    const at = span => width(App.buildPreview('resistor', span, HS, 0));
    return { ghosts: ghosts.map(width), span3: at(3), span4: at(4), span5: at(5),
             registry: Parts.get('resistor').place.span.default };
  });

  expect(widths.registry, 'the resistor\'s registry default span').toBe(4);
  expect(widths.ghosts.length, 'one ghost for the one place_resistor').toBe(1);
  const w = widths.ghosts[0];
  expect(Math.abs(w - widths.span4), `ghost width ${w.toFixed(3)} vs span 4 ${widths.span4.toFixed(3)}`).toBeLessThan(0.01);
  expect(Math.abs(w - widths.span3), 'not span 3').toBeGreaterThan(0.01);
  expect(Math.abs(w - widths.span5), 'not span 5').toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
});
