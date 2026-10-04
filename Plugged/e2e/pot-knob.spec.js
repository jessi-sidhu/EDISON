// The pot's knob shows its position straight away, issue #57: a circuit
// reopened with RV1 at 30 % draws the knob at 30 % before any Run, and the
// inspector slider (or App.setControls) turns the knob while the simulation
// is stopped. Before the fix, components.js drawPart built every part with
// its default controls (50 %) and view.update only ran on Run or Stop, so
// the numbers were right but the picture lagged. /api/ask is stubbed; no AI
// is called. Guest only; Google sign-in stays a manual QA case.
//
// Shapes this spec assumes (the builder keeps them):
// - The knob is the object in the pot's group with userData.potKnob; its
//   rotation.y is the drawn position (parts/potentiometer.js).
// - The mapping is potentiometer.js's knobAngle: −(p/100 − 0.5) · 1.5π,
//   so 0 % → +135°, 50 % → 0, 100 % → −135°.
const { test, expect } = require('@playwright/test');

const KNOB_SWEEP = Math.PI * 1.5;
const knobAngle = p => -(p / 100 - 0.5) * KNOB_SWEEP;
const deg = r => `${(r * 180 / Math.PI).toFixed(1)}°`;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

const position = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'potentiometer');
  return c && c.controls ? c.controls.position : null;
});

// The drawn knob's rotation.y (radians), found by userData.potKnob in the
// pot's group; null when there is no knob.
const knobRotation = (page, label = 'RV1') => page.evaluate(l => {
  const c = App.state.components.find(x => x.label === l);
  let v = null;
  if (c && c.group) c.group.traverse(o => { if (o.userData && o.userData.potKnob) v = o.rotation.y; });
  return v;
}, label);

// Polls until the knob shows `p` %, with a message naming the angles.
async function expectKnobAt(page, p, why) {
  const want = knobAngle(p);
  await expect.poll(async () => {
    const r = await knobRotation(page);
    return r === null ? null : Math.round(r * 1e4) / 1e4;
  }, { message: `${why}: knob should be at ${p} % (${deg(want)}); 50 % is ${deg(knobAngle(50))}`, timeout: 3000 })
    .toBeCloseTo(want, 3);
}

const simRunning = page => page.evaluate(() => !!App.simRunning);

// A saved circuit with only RV1 on c2 (1), c3 (wiper), c4 (3), at `pos` %.
const savedPot = pos => ({
  name: 'knob',
  components: [{
    type: 'potentiometer', label: 'RV1', values: { resistance: 10000 }, controls: { position: pos },
    holeRefs: [{ pin: '1', col: 1, row: 'c' }, { pin: 'wiper', col: 2, row: 'c' }, { pin: '3', col: 3, row: 'c' }],
  }],
  wires: [],
});

async function placePot(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('potentiometer', [hole('c2'), hole('c3'), hole('c4')]);
  });
  expect(await position(page), 'App.placePart placed a pot at the default 50 %').toBe(50);
}

async function selectPot(page) {
  await page.evaluate(() => App.selectItem(App.state.components.find(c => c.label === 'RV1'), 'component'));
  await expect(page.locator('#inspector-label')).toHaveText('RV1');
  const slider = page.locator('#inspector .inspector-row[data-key="position"] input[type="range"]');
  await expect(slider).toHaveCount(1);
  return slider;
}

// ── Done when 1: a reopened circuit shows its knob at the saved position ──

test('load a circuit with RV1 at 30 %: before any Run the knob is at 30 %, not 50 %', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(f => App.loadCircuitData(f), savedPot(30));
  expect(await position(page), 'the record loaded at 30 %').toBe(30);
  expect(await simRunning(page), 'no simulation has run').toBe(false);
  expect(await knobRotation(page), 'the pot has a knob marked userData.potKnob').not.toBeNull();
  await expectKnobAt(page, 30, 'loaded at 30 %, before any Run');
  expect(errors).toEqual([]);
});

// ── Done when 2: the inspector slider turns the knob while stopped ────────

test('with the simulation stopped, moving the inspector slider to 80 turns the knob to 80 %', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placePot(page);
  await expectKnobAt(page, 50, 'a new pot at the default 50 %');
  const slider = await selectPot(page);
  await expect(slider).toHaveValue('50');
  await slider.fill('80');
  await expect.poll(() => position(page)).toBe(80);
  expect(await simRunning(page), 'the simulation is still stopped').toBe(false);
  await expectKnobAt(page, 80, 'slider moved to 80 with the simulation stopped');
  expect(errors).toEqual([]);
});

test('with the simulation stopped, App.setControls (the AI\'s set_control) turns the knob', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placePot(page);
  await page.evaluate(() => App.setControls(App.state.components.find(c => c.label === 'RV1'), { position: 30 }));
  expect(await position(page)).toBe(30);
  expect(await simRunning(page)).toBe(false);
  await expectKnobAt(page, 30, 'App.setControls to 30 with the simulation stopped');
  expect(errors).toEqual([]);
});

// ── Undo puts the knob back with the position ─────────────────────────────

test('undo after the slider move: a new pot goes back to 50 % and its knob with it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placePot(page);
  const slider = await selectPot(page);
  await slider.fill('80');
  await expect.poll(() => position(page)).toBe(80);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => position(page), { message: 'one undo returns the pot to 50 %' }).toBe(50);
  await expectKnobAt(page, 50, 'after undo back to 50 %');
  expect(errors).toEqual([]);
});

test('undo after the slider move on a pot loaded at 30 %: the knob goes back to 30 %, not 50 %', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(f => App.loadCircuitData(f), savedPot(30));
  const slider = await selectPot(page);
  await expect(slider).toHaveValue('30');
  await slider.fill('80');
  await expect.poll(() => position(page)).toBe(80);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => position(page), { message: 'one undo returns the pot to 30 %' }).toBe(30);
  expect(await simRunning(page)).toBe(false);
  await expectKnobAt(page, 30, 'after undo back to 30 %');
  expect(errors).toEqual([]);
});

// ── Guard: 50 % and the Run / Stop path work as today ─────────────────────
// Battery on the rails, pot 1 → tn_2, pot 3 → tp_4, so the run is 'ok'.

test('guard: a pot at 50 % shows 50 %; while running a control change turns the knob, and Stop keeps it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placePot(page);
  await expectKnobAt(page, 50, 'a new pot at 50 %');
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    App.placePart('battery', App.batterySpot());
    const bat = App.state.components.find(c => c.type === 'battery');
    for (const [k, rail] of [[0, 'tp_63'], [1, 'tn_63']]) {
      const pm = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(rail));
    }
    wireHoles('tp_4', 'a4');
    wireHoles('a2', 'tn_2');
  });
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  expect(await simRunning(page), 'the circuit simulates').toBe(true);
  await expectKnobAt(page, 50, 'running at 50 %');

  await page.evaluate(() => App.setControls(App.state.components.find(c => c.label === 'RV1'), { position: 70 }));
  await expectKnobAt(page, 70, 'set to 70 % while running');

  await page.locator('#sim-stop-btn').click();
  expect(await simRunning(page)).toBe(false);
  await expectKnobAt(page, 70, 'after Stop, the knob keeps 70 %');
  expect(errors).toEqual([]);
});
