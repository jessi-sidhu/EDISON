// The demo path, end to end in a real browser.
const { test, expect } = require('@playwright/test');

// The scene is WebGL; if the headless browser can't create a context, the
// editor never boots and every other test here is meaningless.
test('the 3D editor boots with the breadboard on screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/circuit3d/index.html');
  await expect(page.locator('#canvas')).toBeVisible();
  const ready = await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  expect(ready).toBeTruthy();
  expect(errors).toEqual([]);
});

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

test('Try it out loads the demo; its button opens and closes the circuit', async ({ page }) => {
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.components.length === 4);

  await page.locator('#sim-run-btn').click();
  expect((await simLines(page)).join(' | ')).toContain('Circuit open');

  // The push button is a 3D object on the canvas; press it the way its click handler does.
  await page.evaluate(() => {
    App.toggleButton(App.state.components.find(c => c.type === 'button'));
    App.runSimulation();
  });
  expect((await simLines(page)).join(' | ')).toContain('LED ON  (14.9 mA)');
});

// The recorded single-LED build, served in place of a real AI call. One lead
// per hole (test/fixtures/recipes.js ONE_LED): R1 b2–b6, LED cathode c8 /
// anode c6, tp_3 → a2, a8 → tn_8. The old stacked build put the LED anode on
// R1's a6, which the registry LED refuses since #25.
const LED_BUILD = {
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'battery_0_pin0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'battery_0_pin1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
};

async function acceptLedBuild(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: LED_BUILD }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  expect(await page.evaluate(() => App.state.components.length)).toBe(0);   // preview only
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
}

test('an AI build previews first, applies on Accept, lights the LED, and undoes in one step', async ({ page }) => {
  await acceptLedBuild(page);

  await page.locator('#sim-run-btn').click();
  expect((await simLines(page)).join(' | ')).toContain('LED ON  (14.9 mA)');
  await page.locator('#sim-stop-btn').click();

  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => [App.state.components.length, App.state.wires.length])).toEqual([0, 0]);
});

test('a guest circuit is saved in this browser', async ({ page }) => {
  await acceptLedBuild(page);
  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sparky_local_projects:guest') || '[]'));
  expect(saved.some(p => p.components.length === 3 && p.wires.length === 4)).toBe(true);
});
