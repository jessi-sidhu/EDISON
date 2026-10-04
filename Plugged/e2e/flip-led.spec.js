// Placing an LED facing either way by hand, issue #64. In place mode with the
// LED picked, F flips it: the next click puts its cathode where the anode
// would go and the anode where the cathode would go. A record's holeRefs are
// in pin order, and the LED's pins are ['cathode', 'anode'], so a flipped LED
// is one whose two holes are swapped (the same thing the AI does for a
// backwards LED). The flip lasts until the part is picked again, F toggles it
// back, and F does nothing for a part without an anode and a cathode or while
// typing. QA LG-03 ("LG-01 with the LED turned around") is built here by hand
// in one placement. /api/ask is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');

const GUEST_KEY = 'sparky_local_projects:guest';   // SparkyStorage.projectsKey(null)
const BACKWARDS = 'LED is backwards';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
}

// Where a board hole ("c30") is on screen, in page pixels.
function screenPoint(page, where) {
  return page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const h = App.state.breadboard.getHole(col, row);
    const p = h.world ? h.world.clone() : new THREE.Vector3(h.x, 0, h.z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
}

// Hover a hole, the way a person aims the picked part.
async function hoverHole(page, where) {
  const at = await screenPoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
}

// Hover then click a hole, the way a person places the picked part.
async function clickHole(page, where) {
  await hoverHole(page, where);
  const at = await screenPoint(page, where);
  await page.mouse.click(at.x, at.y);
}

const item  = (page, type) => page.locator(`#sidebar .comp-item[data-type="${type}"]`);
// A fresh pick of `type` from the sidebar. Since #34, clicking the part that
// is already picked unpicks it, so when `type` is picked already this cancels
// with ESC first, then picks it again (and a new pick starts unflipped).
async function pick(page, type) {
  const already = await page.evaluate(t => App.state.mode === 'place' && App.state.pickedType === t, type);
  if (already) await page.keyboard.press('Escape');
  await item(page, type).click();
}
const hint  = page => page.locator('#hint-text');
const count = page => page.evaluate(() => App.state.components.length);

// A placed part's holes in pin order, as names ("c10"). For an LED that is
// [cathode, anode].
const holesOf = (page, label) => page.evaluate(label => {
  const c = App.state.components.find(p => p.label === label);
  return c ? c.holeRefs.map(r => r.row + (r.col + 1)) : null;
}, label);

// Battery beside the board, wired to the top rails (tp = +9 V, tn = 0 V),
// plus any hole-to-hole wires and resistors given, through the same calls
// the other specs use.
function build(page, { resistors = [], wires = [] }) {
  return page.evaluate(({ resistors, wires }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    App.placePart('battery', App.batterySpot());
    const bat = App.state.components.find(c => c.type === 'battery');
    for (const [k, rail] of [[0, 'tp_63'], [1, 'tn_63']]) {
      const pm = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(rail));
    }
    for (const [a, b] of resistors) App.placePart('resistor', [hole(a), hole(b)]);
    for (const [a, b] of wires) { App.state.wireStart = end(a); App.finishWire(end(b)); }
  }, { resistors, wires });
}

// The simulation part of the AI summary: one "- LED1: LED ON (lit), 14.9 mA"
// line per part.
async function simSummary(page) {
  const md = await page.evaluate(() => App.exportMarkdown());
  const at = md.indexOf('## Simulation');
  const next = md.indexOf('\n## ', at + 1);
  return md.slice(at, next < 0 ? undefined : next);
}
const simLines = page => page.locator('#sim-results .sim-line').allTextContents();

// Whether an LED's glow light is on (parts/led.js view.update lights it).
const glowing = (page, label) => page.evaluate(label => {
  const c = App.state.components.find(p => p.label === label);
  let lit = false;
  c.group.traverse(o => { if (o.isPointLight && o.userData.ledLight && o.visible && o.intensity > 0) lit = true; });
  return lit;
}, label);

// ── The flip itself ───────────────────────────────────────────────────────

test('F flips the picked LED: placed after F, its cathode and anode holes are swapped compared with the default', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);

  await pick(page, 'led');
  await clickHole(page, 'c10');
  expect(await holesOf(page, 'LED1'), 'default: cathode on the hovered hole, anode two columns right').toEqual(['c10', 'c12']);

  await pick(page, 'led');
  await page.keyboard.press('f');
  await expect(hint(page)).toContainText('Flipped');
  await expect(hint(page)).toContainText('F to flip back');
  await clickHole(page, 'c20');
  expect(await holesOf(page, 'LED2'), 'flipped: anode on the hovered hole, cathode two columns right')
    .toEqual(['c22', 'c20']);
  expect(await count(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('F again flips back to normal, and the next LED is placed in the default order', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'led');
  await page.keyboard.press('f');
  await expect(hint(page)).toContainText('Flipped');
  await page.keyboard.press('f');
  await expect(hint(page)).toContainText('Normal');
  await expect(hint(page)).toContainText('F to flip');
  await clickHole(page, 'c10');
  expect(await holesOf(page, 'LED1')).toEqual(['c10', 'c12']);
  expect(errors).toEqual([]);
});

test('the flip stays on for more LEDs of the same pick; clicking the picked LED again unpicks it, and picking it after that starts unflipped', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'led');
  await page.keyboard.press('F');   // Shift+F works too
  await clickHole(page, 'c10');
  await clickHole(page, 'c20');
  expect(await holesOf(page, 'LED1')).toEqual(['c12', 'c10']);
  expect(await holesOf(page, 'LED2'), 'still flipped for the second LED').toEqual(['c22', 'c20']);

  // #34: a click on the picked LED's sidebar item unpicks it: select mode,
  // no flip hint, and a click on the board places nothing.
  await item(page, 'led').click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['select', null]);
  await expect(hint(page)).not.toContainText('Flipped');
  await expect(hint(page)).not.toContainText('F to flip');
  await clickHole(page, 'c40');
  expect(await count(page), 'nothing placed while unpicked').toBe(2);

  await item(page, 'led').click();  // picked again: a new pick resets the flip
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'led']);
  await expect(hint(page)).not.toContainText('Flipped');
  await clickHole(page, 'c30');
  expect(await holesOf(page, 'LED3')).toEqual(['c30', 'c32']);
  expect(errors).toEqual([]);
});

test('F also flips a vertical LED (R first), across the centre gap', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'led');
  await page.keyboard.press('r');
  await expect(hint(page)).toContainText('Vertical');
  await clickHole(page, 'e10');
  expect(await holesOf(page, 'LED1'), 'vertical default: cathode on the hovered hole, anode two rows down').toEqual(['e10', 'g10']);

  await page.keyboard.press('f');
  await expect(hint(page)).toContainText('Flipped');
  await clickHole(page, 'e20');
  expect(await holesOf(page, 'LED2'), 'vertical flipped: anode on the hovered hole').toEqual(['g20', 'e20']);
  expect(errors).toEqual([]);
});

test('the ghost shows the flip: its − mark moves to the far hole and its + mark to the hovered one', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);

  // World x of the ghost's − (blue, by the cathode) and + (red, by the anode)
  // marks: see-through meshes in parts/led.js's colours, in a visible chain.
  const marks = () => page.evaluate(() => {
    App.scene.updateMatrixWorld(true);
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const xs = { minus: [], plus: [] };
    App.scene.traverse(o => {
      const m = o.isMesh && o.material;
      if (!m || !m.transparent || !m.color || !shown(o)) return;
      const hex = m.color.getHex();
      const v = new THREE.Vector3();
      if (hex === 0x3355ff) xs.minus.push(o.getWorldPosition(v).x);
      if (hex === 0xff3333) xs.plus.push(o.getWorldPosition(v).x);
    });
    const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    return { minus: avg(xs.minus), plus: avg(xs.plus) };
  });
  const holeX = where => page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const h = App.state.breadboard.getHole(col, row);
    return h.world ? h.world.x : h.x;
  }, where);
  const [x10, x12] = [await holeX('c10'), await holeX('c12')];

  await pick(page, 'led');
  await hoverHole(page, 'c10');
  const normal = await marks();
  expect(normal.minus, 'unflipped ghost: − by c10 (cathode)').toBeCloseTo(x10, 1);
  expect(normal.plus,  'unflipped ghost: + by c12 (anode)').toBeCloseTo(x12, 1);

  await page.keyboard.press('f');
  await hoverHole(page, 'c20');
  await hoverHole(page, 'c10');
  const flipped = await marks();
  expect(flipped.minus, 'flipped ghost: − by c12 (cathode)').toBeCloseTo(x12, 1);
  expect(flipped.plus,  'flipped ghost: + by c10 (anode)').toBeCloseTo(x10, 1);
  expect(errors).toEqual([]);
});

// ── Where F does nothing ──────────────────────────────────────────────────

test('pin: F with a resistor picked does not flip it or show a flip hint', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'resistor');
  await page.keyboard.press('f');
  await expect(hint(page)).not.toContainText('Flipped');
  await clickHole(page, 'c10');
  expect(await holesOf(page, 'R1')).toEqual(['c10', 'c14']);
  expect(errors).toEqual([]);
});

test('pin: typing f in the chat box does not flip the picked LED', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'led');
  const input = page.locator('#sparky-input');
  await input.click();
  await page.keyboard.type('ff f');
  await expect(input).toHaveValue('ff f');
  await expect(hint(page)).not.toContainText('Flipped');
  await clickHole(page, 'c10');
  expect(await holesOf(page, 'LED1')).toEqual(['c10', 'c12']);
  expect(errors).toEqual([]);
});

test('the place-mode hint mentions F to flip for the LED, not for a resistor', async ({ page }) => {
  await openEditor(page);
  await pick(page, 'led');
  await expect(hint(page)).toContainText('F to flip');
  await pick(page, 'resistor');
  await expect(hint(page)).not.toContainText('F to flip');
});

test('undo after a flipped placement removes that LED in one step', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'led');
  await page.keyboard.press('f');
  await clickHole(page, 'c10');
  expect(await holesOf(page, 'LED1')).toEqual(['c12', 'c10']);
  await page.keyboard.press('Control+z');
  expect(await count(page)).toBe(0);
  expect(errors).toEqual([]);
});

// ── Circuits built with a flipped LED ─────────────────────────────────────
// Branch layout: tp_14 → a14, R1 b10–b14, the LED over columns 8 and 10,
// a8 → tn_8. Current comes in on column 10, so an LED placed by hovering c8
// is the right way round by default (cathode c8, anode c10) and backwards
// when flipped (cathode c10, anode c8).

test('QA LG-03 by hand: one LED placed flipped stays dark and says it is backwards', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await build(page, { resistors: [['b10', 'b14']], wires: [['tp_14', 'a14'], ['a8', 'tn_8']] });

  await pick(page, 'led');
  await page.keyboard.press('f');
  await clickHole(page, 'c8');
  expect(await holesOf(page, 'LED1'), 'placed turned around: cathode c10, anode c8').toEqual(['c10', 'c8']);

  await page.locator('#sim-run-btn').click();
  const lines = await simLines(page);
  expect(lines.some(l => l.includes(BACKWARDS)), `a line says the LED is backwards:\n${lines.join('\n')}`).toBe(true);
  expect(lines.some(l => /LED ON/.test(l)), 'no LED is on').toBe(false);
  expect(await simSummary(page)).toContain('LED1: LED OFF (dark)');
  expect(await glowing(page, 'LED1'), 'the LED stays dark').toBe(false);
  expect(errors).toEqual([]);
});

test('two branches, one LED normal and one flipped: one lights, one is backwards, and both survive a reload', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  // Branch 1 as above; branch 2 the same shape 16 columns right.
  await build(page, {
    resistors: [['b10', 'b14'], ['b26', 'b30']],
    wires: [['tp_14', 'a14'], ['a8', 'tn_8'], ['tp_30', 'a30'], ['a24', 'tn_24']],
  });

  await pick(page, 'led');
  await clickHole(page, 'c8');                  // LED1, the right way round
  await pick(page, 'led');
  await page.keyboard.press('f');
  await clickHole(page, 'c24');                 // LED2, turned around
  expect(await holesOf(page, 'LED1')).toEqual(['c8', 'c10']);
  expect(await holesOf(page, 'LED2')).toEqual(['c26', 'c24']);

  const checkRun = async when => {
    await page.locator('#sim-run-btn').click();
    const sim = await simSummary(page);
    expect(sim, `${when}: LED1 lights at 9 V through 470 Ω`).toContain('LED1: LED ON (lit), 14.9 mA');
    expect(sim, `${when}: LED2 is dark`).toContain('LED2: LED OFF (dark), 0.0 mA');
    const lines = await simLines(page);
    expect(lines.some(l => l.includes(BACKWARDS)), `${when}: a line says an LED is backwards:\n${lines.join('\n')}`).toBe(true);
    expect(await glowing(page, 'LED1'), `${when}: LED1 glows`).toBe(true);
    expect(await glowing(page, 'LED2'), `${when}: LED2 stays dark`).toBe(false);
    await page.locator('#sim-stop-btn').click();
  };
  await checkRun('before reload');

  // Autosave, then reload: the editor reopens this tab's circuit.
  await expect.poll(() => page.evaluate(k => {
    const list = JSON.parse(localStorage.getItem(k) || '[]');
    const rec = list.find(p => p.components && p.components.some(c => c.label === 'LED2'));
    const led2 = rec && rec.components.find(c => c.label === 'LED2');
    return led2 ? led2.holeRefs.map(r => r.row + (r.col + 1)) : null;
  }, GUEST_KEY), { timeout: 10_000 }).toEqual(['c26', 'c24']);
  await page.reload();
  await editorReady(page);
  await page.waitForFunction(() => App.state.components.length === 5);
  expect(await holesOf(page, 'LED1')).toEqual(['c8', 'c10']);
  expect(await holesOf(page, 'LED2'), 'the flipped LED is still flipped after a reload').toEqual(['c26', 'c24']);
  await checkRun('after reload');
  expect(errors).toEqual([]);
});
