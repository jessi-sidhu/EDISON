// The hole map in the page, issue #24 (testing contract, item 7): after an
// AI build, place, delete, undo and reload, App.holeMap() equals a fresh
// rebuild from the records (App.buildHoleMap, board-io.js's pure helper,
// tested in Node by test/hole-map.test.js), and every part has one leg per
// pin. The map is never saved. /api/ask is stubbed with the recorded LED
// build; no AI is called. Guest only.
//
// The build is the one-lead-per-hole recipe (test/fixtures/recipes.js
// ONE_LED): R1 b2–b6, LED1 cathode c8 / anode c6, tp_3 → a2, a8 → tn_8. The
// old stacked build put the LED anode on R1's a6, which the registry LED
// refuses since #25.
const { test, expect } = require('@playwright/test');

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

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// App.holeMap() and a fresh rebuild, as sorted [hole, occupant] entries,
// plus each on-board part's pin count and leg count.
function mapState(page) {
  return page.evaluate(() => {
    const entries = m => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const hasLive  = typeof App.holeMap === 'function';
    const hasFresh = typeof App.buildHoleMap === 'function';
    const live  = hasLive ? App.holeMap() : null;
    const fresh = hasFresh ? App.buildHoleMap(App.state.components, App.state.wires) : null;
    const parts = App.state.components.filter(c => c && !c.unknown && c.holeRefs).map(c => ({
      label: c.label, pins: c.pins.length, legs: Parts.legsOf(c).filter(l => l.hole).length,
    }));
    return {
      hasLive, hasFresh,
      isMap: live instanceof Map,
      live:  live instanceof Map ? entries(live) : null,
      fresh: fresh instanceof Map ? entries(fresh) : null,
      parts,
    };
  });
}

async function expectConsistent(page, step) {
  const s = await mapState(page);
  expect(s.hasLive, `${step}: App.holeMap() exists`).toBe(true);
  expect(s.hasFresh, `${step}: App.buildHoleMap() exists`).toBe(true);
  expect(s.isMap, `${step}: App.holeMap() returns a Map`).toBe(true);
  expect(s.live, `${step}: App.holeMap() equals a fresh rebuild`).toEqual(s.fresh);
  for (const p of s.parts) expect(p.legs, `${step}: ${p.label} has one leg per pin`).toBe(p.pins);
  return new Map(s.live);
}

test('App.holeMap() equals a fresh rebuild after an AI build, place, delete, undo and reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: LED_BUILD }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  // AI build: the demo path, unchanged.
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  let map = await expectConsistent(page, 'AI build');
  expect(map.get('b2')).toEqual({ label: 'R1', pin: 'lead1' });
  expect(map.get('b6')).toEqual({ label: 'R1', pin: 'lead2' });
  expect(map.get('c8')).toEqual({ label: 'LED1', pin: 'cathode' });
  expect(map.get('c6')).toEqual({ label: 'LED1', pin: 'anode' });
  expect(map.get('a2')).toMatchObject({ end: 'to' });     // the tp_3 → a2 wire
  expect(map.get('a8')).toMatchObject({ end: 'from' });   // the a8 → tn_8 wire

  // Place R2 at d20–d24.
  await page.evaluate(() => {
    const at = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placeResistor(at('d20'), at('d24'));
  });
  map = await expectConsistent(page, 'place');
  expect(map.get('d20')).toEqual({ label: 'R2', pin: 'lead1' });
  expect(map.get('d24')).toEqual({ label: 'R2', pin: 'lead2' });

  // Delete R2.
  await page.evaluate(() => {
    App.selectItem(App.state.components.find(c => c.label === 'R2'), 'component');
    App.deleteSelected();
  });
  map = await expectConsistent(page, 'delete');
  expect(map.has('d20'), 'd20 is free once R2 is deleted').toBe(false);

  // Undo the delete.
  await page.evaluate(() => App.undo());
  map = await expectConsistent(page, 'undo');
  expect(map.get('d20')).toEqual({ label: 'R2', pin: 'lead1' });

  // Reload the autosaved circuit.
  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  const entry = await page.evaluate(() => {
    const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
    return JSON.parse(localStorage.getItem(key) || '[]').find(p => p.id === App.state.circuitId);
  });
  expect(entry, 'the circuit was autosaved').toBeTruthy();
  expect(entry.holeMap, 'the hole map is never saved').toBeUndefined();
  const r2 = entry.components.find(c => c.label === 'R2');
  expect(r2.holeRefs).toEqual([{ pin: 'lead1', col: 19, row: 'd' }, { pin: 'lead2', col: 23, row: 'd' }]);
  await page.evaluate(e => App.loadCircuitData(e), entry);
  map = await expectConsistent(page, 'reload');
  expect(map.get('d20')).toEqual({ label: 'R2', pin: 'lead1' });
  expect(map.get('b2')).toEqual({ label: 'R1', pin: 'lead1' });
  expect(map.get('c8')).toEqual({ label: 'LED1', pin: 'cathode' });
  expect(map.get('c6')).toEqual({ label: 'LED1', pin: 'anode' });
  const led = entry.components.find(c => c.label === 'LED1');
  expect(led.holeRefs).toEqual([{ pin: 'cathode', col: 7, row: 'c' }, { pin: 'anode', col: 5, row: 'c' }]);

  expect(errors).toEqual([]);
});
