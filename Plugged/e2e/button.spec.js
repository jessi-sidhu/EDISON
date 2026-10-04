// The push button as a registry part, issue #26: its state is the momentary
// control controls.pressed (default false, never saved), and a click on its
// model toggles it through the part's gestures.click, only while the
// simulation runs. Stop resets it to the default. Checked on the "Try it
// out" demo (demo.sparky: BAT1, R1, LED1 and SW1 on the LED's return path),
// by clicking the button's cap on the canvas the way a person does.
// /api/ask is not called. Guest only.
const { test, expect } = require('@playwright/test');

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Where the top of the button's cap is on screen: the top centre of its model.
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

// SW1's controls.pressed, or a note of what is there instead.
const pressed = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'button');
  return c && c.controls ? c.controls.pressed : `no controls on the button record (pressed: ${c && c.pressed})`;
});

async function clickCap(page) {
  const at = await capPoint(page);
  await page.mouse.click(at.x, at.y);
}

test('clicking the button while simulating toggles controls.pressed and the LED; Stop resets it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);

  expect(await pressed(page), 'a loaded button starts released: controls.pressed false').toBe(false);

  // Not simulating: a click on the cap does not press it.
  await clickCap(page);
  expect(await pressed(page), 'a click before Run leaves the button released').toBe(false);

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await simLines(page)).join(' | ')).toContain('Circuit open');
  expect((await simLines(page)).join(' | ')).toContain('Button 1: ⭕ OPEN — click to press');

  // Press: the loop closes and the LED lights.
  await clickCap(page);
  await expect.poll(async () => (await simLines(page)).join(' | '), { message: 'the LED lights once the button is clicked' })
    .toContain('LED ON  (14.9 mA)');
  expect((await simLines(page)).join(' | ')).toContain('Button 1: 🟢 CLOSED (current flowing)');
  expect(await pressed(page)).toBe(true);

  // Click again: released, open again.
  await clickCap(page);
  await expect.poll(async () => (await simLines(page)).join(' | ')).toContain('Circuit open');
  expect(await pressed(page)).toBe(false);

  // Press, then Stop: Stop resets the momentary control.
  await clickCap(page);
  await expect.poll(() => pressed(page)).toBe(true);
  await page.locator('#sim-stop-btn').click();
  expect(await pressed(page), 'Stop resets controls.pressed to its default').toBe(false);

  await page.locator('#sim-run-btn').click();
  await expect.poll(async () => (await simLines(page)).join(' | ')).toContain('Circuit open');
  expect(errors).toEqual([]);
});
