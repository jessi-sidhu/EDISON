// Clear All empties the board but stays on the same circuit: same id, same
// name, one undo step, and autosave updates the same saved record instead of
// filing a new "Untitled (N)" (issue #86). Guest only, so saved circuits live
// in localStorage. /api/ask is stubbed; no real AI is called.
const { test, expect } = require('@playwright/test');

// The AI's LED build, as the quick button gets it: battery, resistor, LED.
const LED_BUILD = {
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 470 },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
};

// Every saved circuit, as the dashboard lists them.
const projects = page => page.evaluate(() => {
  const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
  return JSON.parse(localStorage.getItem(key) || '[]');
});
const summary = list => list.map(p => [p.id, p.name, p.components.length, p.wires.length]);
const boardCounts = page => page.evaluate(() => [App.state.components.length, App.state.wires.length]);

test('Clear All keeps the named circuit: same name and record, empty board, no new Untitled, and Ctrl+Z brings the parts back', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await page.route('**/api/ask', route => route.fulfill({ json: LED_BUILD }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  // Name the circuit the way a user does: type in the name field, press Enter.
  const nameField = page.locator('#circuit-name-field');
  await nameField.click();
  await nameField.fill('My LED lamp');
  await nameField.press('Enter');
  await expect(nameField).toHaveText('My LED lamp');

  // Place parts: the stubbed AI build, accepted.
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  expect(await boardCounts(page)).toEqual([3, 4]);
  await expect.poll(async () => summary(await projects(page)).map(r => r.slice(1))).toEqual([['My LED lamp', 3, 4]]);
  const id = await page.evaluate(() => App.state.circuitId);
  expect(id).toBeTruthy();

  // Clear All, accepting the "Delete all N items?" confirm.
  page.on('dialog', d => d.accept());
  await page.locator('#clear-all-btn').click();
  expect(await boardCounts(page)).toEqual([0, 0]);
  await expect(nameField).toHaveText('My LED lamp');
  expect(await page.evaluate(() => App.state.circuitId)).toBe(id);

  // Autosave writes the empty board over the same record; nothing new is filed.
  await expect.poll(async () => summary(await projects(page))).toEqual([[id, 'My LED lamp', 0, 0]]);
  expect((await projects(page)).some(p => /^Untitled/.test(p.name))).toBe(false);

  // One undo step brings the whole board back, saved to the same record.
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
  expect(await boardCounts(page)).toEqual([3, 4]);
  await expect(nameField).toHaveText('My LED lamp');
  await expect.poll(async () => summary(await projects(page))).toEqual([[id, 'My LED lamp', 3, 4]]);
});
