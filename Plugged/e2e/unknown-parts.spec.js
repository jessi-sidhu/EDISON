// A part this build doesn't know (an op-amp from a teammate's newer build)
// survives opening, autosave, delete and undo, and is dropped only when the
// board is cleared. Issue #3. Opens the circuit the way the dashboard does
// (sessionStorage), then drives the board through window.App. Guest only; no
// AI calls.
const { test, expect } = require('@playwright/test');

const KEPT_HINT = "1 part from a newer version was kept but isn't shown.";

// Saved-file records. Holes are { col, row } with a 0-based column, as
// App.parseHole returns them ("a2" is { col: 1, row: 'a' }).
const h = (col, row) => ({ col, row });

// Component list: BAT1 (off-board), R1, the op-amp, LED1.
const OP_AMP = {
  type: 'op_amp', id: 'op_amp_0', label: 'U1', values: { gain: 100000 },
  holeRefs: [h(11, 'e'), h(12, 'e'), h(13, 'e'), h(11, 'f'), h(12, 'f'), h(13, 'f')],
  position: { x: 0, z: 0 }, foo: 'bar',
};
// The op-amp's output pin (index 2 in the list) wired to hole a20.
const OP_AMP_WIRE = { startHole: null, endHole: h(19, 'a'), startCompIdx: 2, startPinIdx: 2,
                      endCompIdx: -1, endPinIdx: -1, color: 0x22c55e };

const CIRCUIT = {
  id: 'unknown-parts-e2e', name: 'Op-amp from a newer build',
  components: [
    { type: 'battery',  id: 'battery_0',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: -20, z: 0 } },
    { type: 'resistor', id: 'resistor_0', label: 'R1', values: { resistance: 470 }, holeRefs: [h(1, 'a'), h(5, 'a')], position: { x: 0, z: 0 } },
    OP_AMP,
    { type: 'led',      id: 'led_0',      label: 'LED1', values: { color: 'red' }, holeRefs: [h(8, 'a'), h(5, 'a')], position: { x: 0, z: 0 } },
  ],
  wires: [
    { startHole: null, endHole: h(1, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    { startHole: null, endHole: h(1, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    { startHole: h(2, 'tp'), endHole: h(1, 'a'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    OP_AMP_WIRE,
  ],
};

// Console errors and uncaught exceptions, collected from before the page loads.
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Open CIRCUIT the way the dashboard does: it is handed over in sessionStorage
// and the editor loads it on boot, with a clean undo history.
async function openSaved(page, data = CIRCUIT) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.evaluate(d => sessionStorage.setItem('sparky_load_circuit', JSON.stringify(d)), data);
  await page.reload();
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer
                                   && App.state.components.length > 0);
}

// A resistor at a24-a28, so the board changes and autosave fires.
async function placeResistor(page, a = 'a24', b = 'a28') {
  await page.evaluate(([a, b]) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placeResistor(hole(a), hole(b));
  }, [a, b]);
}

// The autosaved entry for the circuit now on the board.
async function savedEntry(page) {
  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  return page.evaluate(() => {
    const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
    return JSON.parse(localStorage.getItem(key) || '[]').find(p => p.id === App.state.circuitId);
  });
}

const hasPlaceholder = page => page.evaluate(() => App.state.components.some(c => c && c.unknown === true));

test('a circuit with an unknown part opens without errors and says the part was kept', async ({ page }) => {
  const errors = watchErrors(page);
  await openSaved(page);

  await expect(page.locator('#hint-box')).toBeVisible();
  await expect(page.locator('#hint-text')).toContainText(KEPT_HINT);
  expect(await hasPlaceholder(page)).toBe(true);

  // Clicking and hovering the board walks every part's meshes; running the
  // simulation hands every part to the solver. None may trip on the placeholder.
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await page.evaluate(() => { App.runSimulation(); App.stopSimulation(); });

  expect(errors).toEqual([]);
});

test('the AI export lists only the parts this build knows', async ({ page }) => {
  await openSaved(page);
  expect(await hasPlaceholder(page)).toBe(true);

  const md = await page.evaluate(() => App.exportMarkdown());
  expect(md).toContain('**Board status: 3 component(s), 3 wire(s).**');
  expect(md).not.toContain('op_amp');
  expect(md).not.toMatch(/\bU1\b/);
  expect(md).not.toContain('_pin');
  expect(md).toMatch(/\bR1\b/);
  expect(md).toMatch(/\bLED1\b/);
});

test('autosave keeps the unknown part and its wire, and reopening keeps them again', async ({ page }) => {
  await openSaved(page);
  await placeResistor(page);

  const saved = await savedEntry(page);
  expect(saved.components).toHaveLength(5);
  expect(saved.components[2]).toEqual(OP_AMP);
  expect(saved.wires).toContainEqual(OP_AMP_WIRE);
  expect(saved.wires).toHaveLength(4);

  // Reopen what was saved, change it again: still there.
  await openSaved(page, saved);
  await placeResistor(page, 'a30', 'a34');
  const again = await savedEntry(page);
  expect(again.components[2]).toEqual(OP_AMP);
  expect(again.wires).toContainEqual(OP_AMP_WIRE);
});

test('deleting a part before the unknown part keeps its wire pointing at it', async ({ page }) => {
  await openSaved(page);
  await page.evaluate(() => {
    App.selectItem(App.state.components.find(c => c.label === 'R1'), 'component');
    App.deleteSelected();
  });

  const saved = await savedEntry(page);
  expect(saved.components.map(c => c.label)).toEqual(['BAT1', 'U1', 'LED1']);
  expect(saved.components[1]).toEqual(OP_AMP);
  expect(saved.wires).toContainEqual({ ...OP_AMP_WIRE, startCompIdx: 1 });
});

test('undo after a change keeps the unknown part and its wire', async ({ page }) => {
  await openSaved(page);
  await placeResistor(page);
  await page.evaluate(() => App.undo());

  expect(await hasPlaceholder(page)).toBe(true);
  const saved = await savedEntry(page);
  expect(saved.components).toHaveLength(4);
  expect(saved.components[2]).toEqual(OP_AMP);
  expect(saved.wires).toContainEqual(OP_AMP_WIRE);
});

test('clearing the board drops the unknown part and its wire', async ({ page }) => {
  await openSaved(page);
  expect(await hasPlaceholder(page)).toBe(true);

  await page.evaluate(() => App.clearAll());
  expect(await page.evaluate(() => App.state.components.length)).toBe(0);
  expect(await page.evaluate(() => (App.state.unknownWires || []).length)).toBe(0);

  await placeResistor(page);
  const saved = await savedEntry(page);
  expect(saved.components.map(c => c.type)).toEqual(['resistor']);
  expect(saved.wires).toEqual([]);
});

// Known parts that can't be rebuilt (an LED at holes off the board, a battery
// with no position) are dropped, as before #3. Only a type this build doesn't
// know becomes a placeholder. A placeholder 'led' would crash Run/Stop when
// the simulator dims it; a placeholder 'battery' would read as a short.
test('known parts that fail to rebuild are dropped, and Run/Stop work with the unknown part kept', async ({ page }) => {
  const errors = watchErrors(page);
  const broken = {
    ...CIRCUIT,
    id: 'unknown-parts-broken-known-e2e',
    components: CIRCUIT.components.concat([
      { type: 'led',     id: 'led_1',     label: 'LED2', values: { color: 'green' }, holeRefs: [h(99, 'a'), h(98, 'a')], position: { x: 0, z: 0 } },
      { type: 'battery', id: 'battery_1', label: 'BAT2', values: { voltage: 9 }, holeRefs: null },
    ]),
    // Close the series loop: LED1's cathode column (a9) to the - rail.
    wires: CIRCUIT.wires.concat([
      { startHole: h(8, 'b'), endHole: h(2, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    ]),
  };
  await openSaved(page, broken);

  // Run, Stop, then Run again for the results panel. An error thrown in the
  // page comes back as its message, so it shows in the failure.
  const thrown = await page.evaluate(() => {
    try { App.runSimulation(); App.stopSimulation(); App.runSimulation(); return null; }
    catch (e) { return String(e && e.message || e); }
  });
  expect(thrown).toBeNull();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect(page.locator('#sim-results')).not.toContainText('Short circuit');
  await expect(page.locator('#sim-results')).toContainText('LED ON');
  await page.evaluate(() => App.stopSimulation());

  const parts = await page.evaluate(() => App.state.components.map(c => c && { type: c.type, unknown: !!c.unknown, label: c.label }));
  expect(parts).toContainEqual({ type: 'op_amp', unknown: true, label: 'U1' });
  expect(parts.filter(c => c && c.unknown && c.type !== 'op_amp')).toEqual([]);
  expect(parts.filter(c => c && ['LED2', 'BAT2'].includes(c.label))).toEqual([]);
  expect(errors).toEqual([]);
});
