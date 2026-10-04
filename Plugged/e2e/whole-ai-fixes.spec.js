// An AI fix lands whole or not at all (issue #199). The server drops a reply
// whose edits name what isn't on the board; this pins the browser's side:
// if a step still fails at Accept (the board changed since Edison read it),
// the whole fix is rolled back, with one message, never half applied.
// /api/ask is stubbed in the browser; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

// The recorded single-LED build (test/fixtures/recipes.js ONE_LED): BAT1,
// R1 b2–b6 (470 Ω), LED1 c8/c6, wires W1–W4.
const LED_BUILD = {
  reply: 'Built a single LED with a current-limiting resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
};
// A "fix" whose second step names a wire the board doesn't have.
const HALF_FIX = {
  reply: 'I made the resistor 1 kΩ and removed the extra wire.',
  actions: [{ tool: 'set_value', part: 'R1', resistance: 1000 }, { tool: 'delete_wire', wire: 'W9' }],
};

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const board = page => page.evaluate(() => ({
  r1: (App.state.components.find(c => c.label === 'R1') || {}).values?.resistance,
  wires: App.state.wires.map(w => w.id),
}));

test('a fix with a step that can\'t apply at Accept changes nothing: R1 stays 470 Ω, W1–W4 stay, one message says nothing was changed', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => {
    const { message } = route.request().postDataJSON();
    return route.fulfill({ json: /Build a complete working LED circuit/.test(message) ? LED_BUILD : HALF_FIX });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  const before = await board(page);
  expect(before).toEqual({ r1: 470, wires: ['W1', 'W2', 'W3', 'W4'] });

  await page.locator('#sparky-input').fill('Fix it.');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  const messagesBefore = await page.locator('.chat-msg.system').count();
  await page.getByRole('button', { name: 'Accept' }).click();

  await expect(page.locator('.chat-msg.system').last()).toContainText(/nothing was changed/i);
  expect(await board(page), 'the board is as it was: no half fix').toEqual(before);
  const added = (await page.locator('.chat-msg.system').allTextContents()).slice(messagesBefore);
  expect(added, `one message for the refused fix: ${JSON.stringify(added)}`).toHaveLength(1);
  expect(added[0]).not.toMatch(/Applied/);
  expect(errors).toEqual([]);
});
