// The equation card, issue #92: while simulating, a click on a hole shows its
// net's KCL with the numbers filled in, and a click on a resistor shows
// Ohm's law. A click on the button still presses it. Checked on the "Try it
// out" demo (demo.sparky: BAT1, R1 470 Ω b3–b7, LED1 anode c7 / cathode c9,
// SW1 on the LED's return path) with the button pressed, clicking on the
// canvas the way a person does. The card is #equation-card.
// /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Screen point of a world point.
function toScreen(page, world) {
  return page.evaluate(({ x, y, z }) => {
    const p = new THREE.Vector3(x, y, z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, world);
}

// The top centre of the first part of `type`'s model.
async function clickPart(page, type) {
  const world = await page.evaluate(t => {
    const c = App.state.components.find(x => x.type === t);
    const box = new THREE.Box3().setFromObject(c.group);
    return { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 };
  }, type);
  const at = await toScreen(page, world);
  await page.mouse.click(at.x, at.y);
}

// A board hole, "e7" → { col: 6, row: 'e' }.
async function clickHole(page, name) {
  const world = await page.evaluate(s => {
    const { col, row } = App.parseHole(s);
    const w = App.state.breadboard.getHole(col, row).world;
    return { x: w.x, y: w.y, z: w.z };
  }, name);
  const at = await toScreen(page, world);
  await page.mouse.click(at.x, at.y);
}

const labelOf = (page, type) => page.evaluate(t => App.state.components.find(x => x.type === t).label, type);

test('simulating the demo with the button pressed: a hole shows KCL = 0 mA, the resistor shows V = IR', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);

  const card = page.locator('#equation-card');
  const R = await labelOf(page, 'resistor');
  const D = await labelOf(page, 'led');

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await simLines(page)).join(' | ')).toContain('Circuit open');

  // A click on the button still presses it: the loop closes and the LED lights.
  await clickPart(page, 'button');
  await expect.poll(async () => (await simLines(page)).join(' | '), { message: 'the button press still reaches the button' })
    .toContain('LED ON  (14.9 mA)');
  await expect(card, 'a button is not a two-lead Ohm part: no equation card').toBeHidden();

  // e7 is free and on the resistor–LED node (R1 lead2 b7, LED1 anode c7).
  await clickHole(page, 'e7');
  await expect(card, 'a hole click while simulating opens the equation card').toBeVisible();
  await expect(card).toContainText(`I(${R})`);
  await expect(card).toContainText(`I(${D})`);
  await expect(card).toContainText('14.9');
  await expect(card).toContainText('= 0 mA');

  await page.keyboard.press('Escape');
  await expect(card, 'Esc closes the card').toBeHidden();

  await clickPart(page, 'resistor');
  await expect(card, 'a resistor click while simulating opens the equation card').toBeVisible();
  await expect(card).toContainText('V = IR → 7.0 V = 14.9 mA × 470 Ω');

  await page.locator('#sim-stop-btn').click();
  await expect(card, 'Stop closes the card').toBeHidden();
  expect(errors).toEqual([]);
});
