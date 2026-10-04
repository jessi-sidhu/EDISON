// Edit in place (issue #85). /api/ask is stubbed in the browser, answering
// by the message; no real AI is called. Guest only (sign-in can't be
// automated).
//
// Decided on the issue (the builder matches it):
// - "Add a second LED" is answered with only the new LED (no delete_all).
//   Accepting it leaves LED1 in its holes and every wire under its id.
// - The history the page sends with each request: on Accept, the model
//   entry is the reply plus a line starting "Applied:" naming the applied
//   actions; on Decline it is exactly
//   "(The user declined this build; the board is unchanged.)". A plain
//   answer (no actions) stays as it is.
const { test, expect } = require('@playwright/test');

const DECLINED = '(The user declined this build; the board is unchanged.)';

// The recorded single-LED build (test/fixtures/recipes.js ONE_LED): wires
// W1 BAT1.0 → tp_63, W2 BAT1.1 → tn_63, W3 tp_3 → a2, W4 a8 → tn_8.
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
const LED_WIRES = [['W1', 'BAT1.0', 'tp_63'], ['W2', 'BAT1.1', 'tn_63'], ['W3', 'tp_3', 'a2'], ['W4', 'a8', 'tn_8']];

// The edit-in-place answer: one LED in parallel with LED1, nothing else.
const ADD_LED = {
  reply: 'Added LED2 in parallel with LED1; they share R1.',
  actions: [{ tool: 'place_led', holeA: 'd8', holeB: 'd6' }],
};
const SET_1K = { reply: 'R1 is now 1 kΩ.', actions: [{ tool: 'set_value', part: 'R1', resistance: 1000 }] };
const plain = text => ({ reply: text, actions: [] });

// The stubbed AI: the LED build for the quick button, otherwise
// reply(message). Every request body is kept in `bodies`.
async function openWithAI(page, reply) {
  const bodies = [];
  await page.route('**/api/ask', route => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    return route.fulfill({ json: /Build a complete working LED circuit/.test(body.message) ? LED_BUILD : reply(body.message) });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await accept(page, 8);
  return bodies;
}

async function accept(page, n) {
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${n} change${n === 1 ? '' : 's'} to your circuit.`);
}

// Types a message and waits for its reply (a preview when it has actions).
async function ask(page, text, { preview = true } = {}) {
  const before = await page.locator('.chat-msg.ai').count();
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('.chat-msg.ai')).toHaveCount(before + 1);
  if (preview) await expect(page.locator('#sparky-pending-bar')).toBeVisible();
}

const parts = page => page.evaluate(() => App.exportBoard().parts.map(p => [p.label, p.holes]));
const wireRows = page => page.evaluate(() => App.exportBoard().wires.map(w => [w.id, w.from, w.to]));
const modelEntries = body => (body.history || []).filter(h => h.role === 'model').map(h => h.text);

async function simulate(page) {
  await page.locator('#sim-run-btn').click();
  const out = (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
  await page.locator('#sim-stop-btn').click();
  return out;
}

test('"Add a second LED" accepted: LED1 and W1–W4 stay as they were, LED2 is added, and the next request\'s history says what was applied', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const bodies = await openWithAI(page, message => (/second LED/.test(message) ? ADD_LED : plain('You are welcome.')));
  expect(await wireRows(page)).toEqual(LED_WIRES);

  await ask(page, 'Add a second LED in parallel.');
  await accept(page, 1);
  expect(await parts(page)).toEqual([['BAT1', undefined], ['R1', ['b2', 'b6']], ['LED1', ['c8', 'c6']], ['LED2', ['d8', 'd6']]]);
  expect(await wireRows(page), 'every original wire keeps its id and ends').toEqual(LED_WIRES);
  const sim = await simulate(page);
  expect((sim.match(/LED ON/g) || []).length, `both LEDs light: ${sim}`).toBe(2);

  // The next request tells the AI what the board really got.
  await ask(page, 'Thanks!', { preview: false });
  const models = modelEntries(bodies[bodies.length - 1]);
  expect(models.length, JSON.stringify(models)).toBe(2);
  const [built, added] = models;
  expect(built.startsWith(LED_BUILD.reply), built).toBe(true);
  expect(built, 'the accepted build has an "Applied:" line').toMatch(/\nApplied:/);
  expect(added.startsWith(ADD_LED.reply), added).toBe(true);
  expect(added, 'the accepted edit has an "Applied:" line').toMatch(/\nApplied:[^\n]*place_led/);
});

test('a declined build is sent back as declined, and a plain answer as it was', async ({ page }) => {
  test.setTimeout(90_000);
  const bodies = await openWithAI(page, message => (/1k/.test(message) ? SET_1K : plain(`About "${message}": all good.`)));
  const r1Before = await page.evaluate(() => App.exportBoard().parts.find(p => p.label === 'R1').values.resistance);

  await ask(page, 'Make the resistor 1k.');
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('Changes declined.');
  expect(await page.evaluate(() => App.exportBoard().parts.find(p => p.label === 'R1').values.resistance)).toBe(r1Before);

  await ask(page, 'Is it fine?', { preview: false });
  let models = modelEntries(bodies[bodies.length - 1]);
  expect(models[models.length - 1], 'the declined reply is replaced by the declined line').toBe(DECLINED);

  await ask(page, 'And now?', { preview: false });
  models = modelEntries(bodies[bodies.length - 1]);
  expect(models.slice(-2)).toEqual([DECLINED, 'About "Is it fine?": all good.']);

  // #85 review: a preview left open when the next message is sent counts as
  // declined; that message's own request already says so.
  await ask(page, 'Make the resistor 1k, please.');
  await ask(page, 'Actually, what does R1 do?', { preview: false });
  models = modelEntries(bodies[bodies.length - 1]);
  expect(models.slice(-2), 'the preview dismissed by the next message is sent as declined')
    .toEqual(['About "And now?": all good.', DECLINED]);
  expect(await page.evaluate(() => App.exportBoard().parts.find(p => p.label === 'R1').values.resistance)).toBe(r1Before);
});
