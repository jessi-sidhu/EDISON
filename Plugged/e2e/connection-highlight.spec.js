// Connection highlight, issue #94: hovering a hole, wire or lead lights every
// hole, lead and wire electrically joined to it, while editing and while
// simulating. Checked on the "Try it out" demo (demo.sparky), hovering holes
// with the real mouse on the canvas. /api/ask is stubbed; no AI is called.
// Guest only (sign-in can't be automated).
//
// The demo's nets, by hand from demo.sparky:
//   + rail  tp_1…tp_63, joined to a3–e3 by W3 (tp_3 → a3, the wire to R1's
//           b3 lead), and to BAT1's + lead (pin 0) by W1 (BAT1.0 → tp_4).
//   − rail  tn_1…tn_63, BAT1.1 by W2, a15–e15 by W5.
//   column 20 is empty: a20–e20 is one net, f20–j20 another.
//
// Decided on the issue (the builder matches it):
// - window.Connections (circuit3d/js/tools/connections.js) recomputes nets on
//   every board change and glows the hovered net: holes through the
//   'bb-holes' InstancedMesh's instance colours, off-board pin leads and
//   wire tubes through their material's emissive. Pointer-out restores both.
// - Read-only debug accessor: Connections.lit() →
//     { holes: ['tp_1', …], pins: ['BAT1.0', …], wires: ['W1', …] }
//   the hole names, off-board pin leads (LABEL.k) and wire ids glowing now;
//   all three empty when nothing glows. Order doesn't matter.
// - In Place mode with a part picked, nothing glows (the ghost wins).
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// The demo from the landing page's "Try it out", seen from the home view so
// every hole is on screen (loading frames the camera on the parts).
async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
  await page.evaluate(() => App.resetCamera());
}

// Where a hole ("tp_10") is on screen, in page pixels. Hole names → holeData
// through App.parseHole and breadboard.getHole; its instance id in the
// 'bb-holes' InstancedMesh is that record's idx.
async function holePoint(page, name) {
  const at = await page.evaluate(name => {
    const { col, row } = App.parseHole(name);
    const h = App.state.breadboard.getHole(col, row);
    const p = h.world.clone();
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    return { x, y, onCanvas: document.elementFromPoint(x, y) === App.renderer.domElement };
  }, name);
  expect(at.onCanvas, `${name} is on the canvas, not under a panel`).toBe(true);
  return at;
}

async function hover(page, name) {
  const at = await holePoint(page, name);
  await page.mouse.move(at.x - 4, at.y);
  await page.mouse.move(at.x, at.y, { steps: 2 });
}

// A point on the canvas past the board's far edge: nothing to hover.
async function moveOffBoard(page) {
  const at = await page.evaluate(() => {
    const p = new THREE.Vector3(0, 0, -App.state.breadboard.BOARD_D / 2 - 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    return { x, y, onCanvas: document.elementFromPoint(x, y) === App.renderer.domElement };
  });
  expect(at.onCanvas, 'the off-board point is on the canvas').toBe(true);
  await page.mouse.move(at.x, at.y, { steps: 3 });
}

// What Connections reports glowing, sorted; a note when it doesn't exist.
const lit = page => page.evaluate(() => {
  if (!window.Connections || typeof Connections.lit !== 'function') return 'no window.Connections.lit()';
  const l = Connections.lit();
  const sort = a => [...(a || [])].sort();
  return { holes: sort(l.holes), pins: sort(l.pins), wires: sort(l.wires) };
});
const litHoles = async page => { const l = await lit(page); return typeof l === 'string' ? l : l.holes; };

const range = (f, from, to) => Array.from({ length: to - from + 1 }, (_, i) => f(from + i));
const PLUS_RAIL = range(n => `tp_${n}`, 1, 63);
const COL3_TOP  = ['a', 'b', 'c', 'd', 'e'].map(r => r + '3');
const sorted = a => [...a].sort();

// The demo's names, read from the page: BAT1's + and − leads, the wire to
// R1 (tp_3 → a3), the battery's + wire and a − rail wire.
const names = page => page.evaluate(() => {
  const bat = App.state.components.find(c => c.type === 'battery');
  const wire = (from, to) => (App.state.wires.find(w => {
    const e = App.wireEnds(w);
    return e.from === from && e.to === to;
  }) || {}).id;
  return {
    batPlus: `${bat.label}.0`, batMinus: `${bat.label}.1`,
    toR1: wire('tp_3', 'a3'), batWire: wire(`${bat.label}.0`, 'tp_4'), minusWire: wire(`${bat.label}.1`, 'tn_16'),
  };
});

// The glow as drawn: a hole's instance colour (null without instance
// colours), and the emissive of BAT1's leads and of two wires' tubes.
const looks = page => page.evaluate(() => {
  const mesh = App.state.breadboard.holesMesh;
  const hole = name => {
    if (!mesh.instanceColor) return null;
    const { col, row } = App.parseHole(name);
    const c = new THREE.Color();
    mesh.getColorAt(App.state.breadboard.getHole(col, row).idx, c);
    return c.getHexString();
  };
  const glow = m => `${m.material.emissive.getHexString()}@${m.material.emissiveIntensity}`;
  const bat = App.state.components.find(c => c.type === 'battery');
  const tube = (from, to) => {
    const w = App.state.wires.find(x => { const e = App.wireEnds(x); return e.from === from && e.to === to; });
    return glow(w.group.children.find(m => m.isMesh && m.geometry.type === 'TubeGeometry'));
  };
  return {
    tp10: hole('tp_10'), tn40: hole('tn_40'),
    batPlus: glow(bat.pinMeshes[0]), batMinus: glow(bat.pinMeshes[1]),
    toR1: tube('tp_3', 'a3'), minusWire: tube(`${bat.label}.1`, 'tn_16'),
  };
});

test('hovering the + rail lights the whole rail, the battery + lead and the wire to the resistor; off the board nothing glows', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const n = await names(page);
  const before = await looks(page);

  await hover(page, 'tp_10');
  await expect.poll(() => litHoles(page), { message: 'the + rail and a3–e3 (joined by the wire to R1) glow' })
    .toEqual(sorted([...PLUS_RAIL, ...COL3_TOP]));
  const on = await lit(page);
  expect(on.pins, 'BAT1 + lead glows').toContain(n.batPlus);
  expect(on.pins, 'BAT1 − lead does not').not.toContain(n.batMinus);
  expect(on.wires, 'the wire to the resistor and the battery + wire glow').toEqual(sorted([n.toR1, n.batWire]));
  expect(on.holes, 'the ground rail is another net').not.toContain('tn_40');

  // Drawn: the lit hole looks different from an unlit one, and the + lead
  // and the wire to R1 changed while the − lead and a − rail wire did not.
  const during = await looks(page);
  expect(during.tp10, 'tp_10 has an instance colour').not.toBeNull();
  expect(during.tp10, 'tp_10 glows, tn_40 does not').not.toBe(during.tn40);
  expect(during.batPlus, 'BAT1 + lead emissive changes').not.toBe(before.batPlus);
  expect(during.toR1, 'the wire to R1 emissive changes').not.toBe(before.toR1);
  expect(during.batMinus).toBe(before.batMinus);
  expect(during.minusWire).toBe(before.minusWire);

  // Off the board: every glow goes.
  await moveOffBoard(page);
  await expect.poll(() => lit(page), { message: 'nothing glows off the board' }).toEqual({ holes: [], pins: [], wires: [] });
  const after = await looks(page);
  expect(after.tp10, 'tp_10 back to an unlit hole').toBe(after.tn40);
  expect(after.batPlus).toBe(before.batPlus);
  expect(after.toR1).toBe(before.toR1);

  // While simulating it works the same.
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results .sim-line').first()).toBeVisible();
  await hover(page, 'tp_10');
  await expect.poll(() => litHoles(page), { message: 'the + rail glows while simulating' })
    .toEqual(sorted([...PLUS_RAIL, ...COL3_TOP]));
  expect(errors).toEqual([]);
});

test('hovering c20 lights only its half-column a20–e20, not f20–j20', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);

  await hover(page, 'c20');
  await expect.poll(() => litHoles(page)).toEqual(['a20', 'b20', 'c20', 'd20', 'e20']);

  await hover(page, 'h20');
  await expect.poll(() => litHoles(page)).toEqual(['f20', 'g20', 'h20', 'i20', 'j20']);
  expect(errors).toEqual([]);
});

test('after deleting the wire to the resistor, hovering the + rail no longer lights a3–e3', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const n = await names(page);

  await hover(page, 'tp_10');
  await expect.poll(() => litHoles(page)).toContain('a3');
  await moveOffBoard(page);

  await page.evaluate(id => App.deleteWire(App.state.wires.find(w => w.id === id)), n.toR1);
  await hover(page, 'tp_10');
  await expect.poll(() => litHoles(page), { message: 'the + rail alone: the cached nets were recomputed' })
    .toEqual(sorted(PLUS_RAIL));
  expect((await lit(page)).wires).toEqual([n.batWire]);

  await hover(page, 'c3');
  await expect.poll(() => litHoles(page), { message: 'a3–e3 is its own net now' }).toEqual(COL3_TOP);
  expect(errors).toEqual([]);
});

test('in Place mode with a part picked, hovering a hole shows no glow (the ghost wins)', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);

  // Proves the glow works here first, so the empty result below means something.
  await hover(page, 'c20');
  await expect.poll(() => litHoles(page)).toEqual(['a20', 'b20', 'c20', 'd20', 'e20']);
  await moveOffBoard(page);

  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();
  await hover(page, 'c20');
  await expect.poll(() => page.evaluate(() => App.state.mode)).toBe('place');
  // Give a late glow the chance to appear before reading.
  await page.waitForTimeout(200);
  expect(await lit(page), 'nothing glows in Place mode').toEqual({ holes: [], pins: [], wires: [] });
  expect(errors).toEqual([]);
});
