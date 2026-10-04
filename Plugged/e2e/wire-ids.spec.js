// Wire ids, the board sent with each AI request, and delete_wire (issue #84).
// /api/ask is stubbed in the browser, answering by the message; no real AI is
// called. Guest only (sign-in can't be automated).
//
// Decided on the issue (the builder matches it):
// - Every wire in App.state.wires has id 'W<n>'. A new wire (drawn by hand,
//   an AI add_wire, a load) gets the highest number in use + 1: never
//   renumbered, a deleted id not reused while a higher one exists. After the
//   AI's delete_all the numbering starts again at W1. Undo keeps ids. Saved
//   wire records carry `id`; a saved circuit without ids loads as W1…Wn in
//   order.
// - App.exportBoard() → { parts: [{ type, label, holes?, values, controls? }],
//   wires: [{ id, from, to }] }: holes as hole names, no holes for an
//   off-board part, wire ends as hole names or LABEL.k. askSparky sends it as
//   `board` next to `markdown`.
// - The markdown Wires table's first column is the id.
// - delete_wire { wire: 'W2' } is applied inside the one Accept (one undo
//   step); its preview note is "Remove wire W2 (BAT1.1 → tn_63)." (from → to
//   as the Wires table shows them). An unknown id fails like other actions.
const { test, expect } = require('@playwright/test');
const { TWO_LEDS, handOver } = require('./fixtures/circuits');
const Board = require('../circuit3d/js/board-model.js');
const Sim   = require('../circuit3d/js/simulate.js');

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

// The stubbed AI: the LED build for the quick button and for "rebuild",
// otherwise reply(message). Every request body is kept in `bodies`.
async function openWithAI(page, reply) {
  const bodies = [];
  await page.route('**/api/ask', route => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const json = /Build a complete working LED circuit|rebuild/.test(body.message) ? LED_BUILD : reply(body.message);
    return route.fulfill({ json });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await accept(page, 8);
  return bodies;
}

// failed: a step that couldn't apply, so nothing was (a fix lands whole or not at all, #199).
async function accept(page, n, failed) {
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last())
    .toHaveText(failed ? /^Nothing was changed: .* didn't match your board \(.+\)\. Ask again\.$/ : `✓ Applied ${n} change${n === 1 ? '' : 's'} to your circuit.`);
}

// Types a message and waits for its reply (a preview when it has actions).
async function ask(page, text, { preview = true } = {}) {
  const before = await page.locator('.chat-msg.ai').count();
  await page.locator('#sparky-input').fill(text);
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('.chat-msg.ai')).toHaveCount(before + 1);
  if (preview) await expect(page.locator('#sparky-pending-bar')).toBeVisible();
}

async function simulate(page) {
  await page.locator('#sim-run-btn').click();
  const out = (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
  await page.locator('#sim-stop-btn').click();
  return out;
}

async function undo(page) {
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });   // focus the board, not the chat box
  await page.keyboard.press('ControlOrMeta+z');
}

// Each wire as [id, from, to], ends as the Wires table writes them.
const wireRows = page => page.evaluate(() => App.state.wires.map(w => {
  const end = (hole, comp, k) => (hole ? App.formatHole(hole) : comp ? `${comp.label}.${k}` : '?');
  return [w.id, end(w.startHole, w.startComp, w.startPinIdx), end(w.endHole, w.endComp, w.endPinIdx)];
}));
const wireIds = page => page.evaluate(() => App.state.wires.map(w => w.id));

// A wire drawn by hand between two holes, through App.finishWire as a click does.
const drawWire = (page, a, b) => page.evaluate(([a, b]) => {
  const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
  const s = hole(a), t = hole(b);
  App.state.wireStart = { world: s.world.clone(), holeRef: { col: s.col, row: s.row }, pinMesh: null };
  App.finishWire({ world: t.world.clone(), holeRef: { col: t.col, row: t.row }, pinMesh: null });
}, [a, b]);

// Deletes wire `id` the way the UI does: select it, then Delete.
const deleteWire = (page, id) => page.evaluate(id => {
  App.selectItem(App.state.wires.find(w => w.id === id), 'wire');
  App.deleteSelected();
}, id);

test('delete_wire W2: the preview names it, Accept removes exactly that wire and the LED goes dark, one Ctrl+Z brings it back', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  await openWithAI(page, message => (/W9/.test(message)
    ? { reply: 'Removing W9.', actions: [{ tool: 'delete_wire', wire: 'W9' }] }
    : { reply: 'Removing the battery\'s − wire.', actions: [{ tool: 'delete_wire', wire: 'W2' }] }));
  expect(await wireRows(page)).toEqual(LED_WIRES);
  expect(await simulate(page)).toContain('LED ON  (14.9 mA)');

  await ask(page, 'remove the battery minus wire');
  await expect(page.locator('.chat-msg.system').filter({ hasText: 'Remove wire W2 (BAT1.1 → tn_63).' })).toHaveCount(1);
  expect(await wireIds(page), 'nothing changes before Accept').toEqual(['W1', 'W2', 'W3', 'W4']);

  await accept(page, 1);
  expect(await wireRows(page)).toEqual([LED_WIRES[0], LED_WIRES[2], LED_WIRES[3]]);
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'LED1']);
  expect(await simulate(page)).not.toContain('LED ON');

  await undo(page);
  expect(await wireRows(page), 'undo restores W2 with its id, and every other id as it was').toEqual(LED_WIRES);
  expect(await simulate(page)).toContain('LED ON  (14.9 mA)');

  // An id that names no wire fails like any refused action and changes nothing.
  await ask(page, 'remove W9');
  await accept(page, 0, 1);
  expect(await wireRows(page)).toEqual(LED_WIRES);
});

test('the request carries `board`: parts and wires with ids (hand wires next, a deleted id not reused), the markdown Wires table leads with the id, and it simulates as the page does', async ({ page }) => {
  test.setTimeout(90_000);
  const bodies = await openWithAI(page, () => ({ reply: 'Looks good.', actions: [] }));
  expect(await wireIds(page)).toEqual(['W1', 'W2', 'W3', 'W4']);

  // By hand: W5, then W3 deleted, then W6 (never W3 again, never renumbered).
  await drawWire(page, 'a10', 'a14');
  await deleteWire(page, 'W3');
  await drawWire(page, 'tp_3', 'a2');
  expect(await wireRows(page)).toEqual([LED_WIRES[0], LED_WIRES[1], LED_WIRES[3], ['W5', 'a10', 'a14'], ['W6', 'tp_3', 'a2']]);
  const pageSim = await simulate(page);
  expect(pageSim).toContain('LED ON  (14.9 mA)');

  await ask(page, 'what is on my board?', { preview: false });
  const { board, markdown } = bodies[bodies.length - 1];
  expect(board, 'the /api/ask body has no board').toBeTruthy();
  expect(board.parts.map(p => [p.type, p.label, p.holes])).toEqual([
    ['battery', 'BAT1', undefined],
    ['resistor', 'R1', ['b2', 'b6']],
    ['led', 'LED1', ['c8', 'c6']],
  ]);
  expect(board.wires).toEqual([
    { id: 'W1', from: 'BAT1.0', to: 'tp_63' },
    { id: 'W2', from: 'BAT1.1', to: 'tn_63' },
    { id: 'W4', from: 'a8', to: 'tn_8' },
    { id: 'W5', from: 'a10', to: 'a14' },
    { id: 'W6', from: 'tp_3', to: 'a2' },
  ]);

  // The board model simulates the sent board as the page does: 14.9 mA.
  const { components, wires } = Board.toSim(board);
  const r = Sim.analyze(components, wires);
  expect(r.parts.LED1.m.on).toBe(true);
  expect(r.parts.LED1.m.current).toBeCloseTo(7 / 470.1 * 1000, 2);

  // The markdown the AI reads: every part in `board` is in it, and the
  // Wires table leads with each wire's id.
  for (const p of board.parts) expect(markdown, `${p.label} is in board but not in markdown`).toContain(`| ${p.label} |`);
  const wiresTable = markdown.split('## Wires')[1].split('\n## ')[0].split('\n').filter(l => l.startsWith('|'));
  expect(wiresTable[0].split('|').map(c => c.trim())[1]).toBe('id');
  const rows = wiresTable.slice(2).map(l => l.split('|').map(c => c.trim()).slice(1, 4));
  expect(rows).toEqual(board.wires.map(w => [w.id, w.from, w.to]));

  // The AI's delete_all rebuild starts the numbering again at W1.
  await ask(page, 'rebuild it');
  await accept(page, 8);
  expect(await wireRows(page)).toEqual(LED_WIRES);
});

// Saved circuits live in localStorage for a guest (see reload-circuit.spec.js).
const GUEST_KEY = 'sparky_local_projects:guest';

test('wire ids survive save and reload; a circuit saved before ids loads as W1…Wn in order', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.addInitScript(({ key, list, pending }) => {
    if (sessionStorage.getItem('__e2e_seeded')) return;
    sessionStorage.setItem('__e2e_seeded', '1');
    localStorage.setItem(key, JSON.stringify(list));
    sessionStorage.setItem('sparky_load_circuit', JSON.stringify(pending));
  }, { key: GUEST_KEY, list: [TWO_LEDS], pending: handOver(TWO_LEDS) });
  const ready = () => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.goto('/circuit3d/index.html');
  await ready();

  // TWO_LEDS has no wire ids: they come in the saved order.
  expect(TWO_LEDS.wires.some(w => 'id' in w)).toBe(false);
  const loaded = await wireRows(page);
  expect(loaded.map(w => w[0])).toEqual(['W1', 'W2', 'W3', 'W4']);
  expect(loaded[0][1], 'W1 is the first saved wire, from the battery +').toBe('BAT1.0');

  // W2 deleted, a new wire is W5; the autosave writes the ids.
  await deleteWire(page, 'W2');
  await drawWire(page, 'a20', 'a24');
  const want = ['W1', 'W3', 'W4', 'W5'];
  expect(await wireIds(page)).toEqual(want);
  await expect.poll(() => page.evaluate(k => {
    const saved = JSON.parse(localStorage.getItem(k) || '[]')[0];
    return saved ? saved.wires.map(w => w.id) : null;
  }, GUEST_KEY)).toEqual(want);

  await page.reload();
  await ready();
  const after = await wireRows(page);
  expect(after.map(w => w[0])).toEqual(want);
  expect(after[3]).toEqual(['W5', 'a20', 'a24']);
});
