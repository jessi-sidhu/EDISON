// The mistake checker panel, issue #95. tools/mistakes.js listens for
// plugged:sim and lists readings.problems() in #mistakes-panel, under the
// results panel (#sim-results). Each problem is one .mistake-row (kind icon,
// labels, why); with none, the panel says "No problems found" and has no
// .mistake-row. Clicking a row outlines its parts: the part becomes the
// selection (App.state.selected = { item: <the part>, kind: 'component' },
// what App.selectItem records). Stop clears or hides the panel.
// Checked on the "Try it out" demo (demo.sparky: BAT1 → R1 470 Ω b3–b7 →
// LED1 cathode c9 / anode c7 → SW1 b12–b15 → tn), pressing its button by
// clicking the cap as a person does. /api/ask is stubbed; no AI is called.
// Guest only.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const panel = page => page.locator('#mistakes-panel');
const rows  = page => page.locator('#mistakes-panel .mistake-row');

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
}

// Where the top of the button's cap is on screen (as in button.spec.js).
function capPoint(page) {
  return page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'button');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
}

async function pressButton(page) {
  const at = await capPoint(page);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => App.state.components.find(x => x.type === 'button').controls.pressed),
    { message: 'the click on the cap presses SW1' }).toBe(true);
}

// Turn the demo's LED around: removed, then placed again on the same two
// holes swapped (cathode c7 on the resistor's side, anode c9 toward SW1),
// the record a flipped placement leaves (flip-led.spec.js). It is LED1 again.
async function reverseLed(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.deletePart(App.state.components.find(c => c.label === 'LED1'));
    App.placePart('led', [hole('c7'), hole('c9')]);
  });
  const led = await page.evaluate(() => {
    const c = App.state.components.find(p => p.type === 'led');
    return c && { label: c.label, holes: c.holeRefs.map(r => r.row + (r.col + 1)) };
  });
  expect(led, 'LED1 turned around: cathode c7, anode c9').toEqual({ label: 'LED1', holes: ['c7', 'c9'] });
}

// Stop leaves no problem on screen: the panel is hidden, or shows nothing.
const panelCleared = page => page.evaluate(() => {
  const el = document.getElementById('mistakes-panel');
  if (!el) return true;
  const hidden = getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden' || !el.offsetParent;
  return hidden || (!el.querySelector('.mistake-row') && !/No problems found/.test(el.textContent));
});

test('a reversed LED on the demo: the panel lists LED1 as backwards, and clicking the row selects (outlines) LED1; Stop clears it', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await reverseLed(page);

  await page.locator('#sim-run-btn').click();
  await pressButton(page);
  await expect.poll(async () => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | '),
    { message: 'the results panel already says the LED is backwards' }).toContain('LED is backwards');

  const row = rows(page).filter({ hasText: 'LED1' }).filter({ hasText: /backwards/i });
  await expect(row, 'a row names LED1 and says it is backwards').toHaveCount(1);
  await expect(panel(page)).not.toContainText('No problems found');

  expect(await page.evaluate(() => App.state.selected), 'nothing selected before the click').toBeNull();
  await row.click();
  await expect.poll(() => page.evaluate(() => {
    const s = App.state.selected;
    return s ? { kind: s.kind, label: s.item && s.item.label } : null;
  }), { message: 'clicking the row selects LED1, the part it names' }).toEqual({ kind: 'component', label: 'LED1' });

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => panelCleared(page), { message: 'Stop clears or hides the mistakes panel' }).toBe(true);
  expect(errors).toEqual([]);
});

test('the demo as loaded: "No problems found" under the results, released and pressed', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);

  await page.locator('#sim-run-btn').click();
  // Released: the loop is open, but an open button is normal use.
  await expect(panel(page)).toContainText('No problems found');
  await expect(rows(page)).toHaveCount(0);

  await pressButton(page);
  await expect.poll(async () => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | '))
    .toContain('LED ON  (14.9 mA)');
  await expect(panel(page)).toContainText('No problems found');
  await expect(rows(page)).toHaveCount(0);

  // The panel sits under the results panel.
  const results = await page.locator('#sim-results').boundingBox();
  const box = await panel(page).boundingBox();
  expect(results && box, 'both panels are on screen').toBeTruthy();
  expect(box.y, `the mistakes panel (top ${box.y}) starts below the results (bottom ${results.y + results.height})`)
    .toBeGreaterThanOrEqual(results.y + results.height - 1);
  expect(errors).toEqual([]);
});
