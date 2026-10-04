// The 7-segment display in the page, issue #43: picked from the generated
// sidebar, placed by hand across the centre gap (the ghost and 10 leg
// spheres show, a spot off the gap is refused with the straddle message),
// wired into the known-answer circuit and simulated; and built by a stubbed
// AI reply. /api/ask is stubbed with page.route; no AI is called. Guest
// only; Google sign-in stays a manual QA case.
//
// The logic (digit table, currents, warnings, placement rules, AI checks)
// is in test/parts-seven_segment.test.js. These tests cover what needs a
// real page: the sidebar pick, the hover ghost and its refusal hint, the
// click that places it, Run, and the lit segment meshes.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="seven_segment"].
// - Each segment of the placed part's group is a mesh named 'seg-a' …
//   'seg-g', the dot 'seg-dp' (group.getObjectByName). A segment counts as
//   lit when it is visible and its material has a non-black emissive with
//   emissiveIntensity > 0 (as the bench supply's 'limit-light'); otherwise
//   it is dark. view.update lights the segments measure() reports lit, and
//   darkens them all when there is no result (Stop).
// - The footprint ghost is the part's own view.build, so while hovering a
//   visible 'seg-a' mesh is in the scene before anything is placed.
// - While simulating, #sim-results has a line saying "shows 1" (headline or
//   line).
//
// Layout (display at f30 facing right: e d com1 c dp on f30–f34, b a com2 f g
// on e34–e30), 470 Ω each: b c34–c39 fed tp_39→a39; c h33–h37 fed
// bp_37→j37; a b33–b37 fed tp_37→a37; commons a32→tn_32 and j32→bn_32;
// BAT1 on tp_63/tn_63; tp_1→bp_1 and tn_1→bn_1 join the bottom rails.
const { test, expect } = require('@playwright/test');

const STRADDLE = 'a chip must sit across the centre gap (rows e and f).';
const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
const LEGS_F30 = ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30'];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
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

async function hover(page, where) {
  const at = await screenPoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  return at;
}

// The shown 'hover-leg' spheres: world x/z and whether each is red.
function hoverLegs(page) {
  return page.evaluate(() => {
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const out = [];
    App.scene.traverse(o => {
      if (!o.isMesh || o.name !== 'hover-leg' || !shown(o)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      const c = o.material.color;
      out.push({ x: v.x, z: v.z, red: c.r > 0.6 && c.g < 0.4 && c.b < 0.4 });
    });
    return out;
  });
}

// Each hole name ("f30") that has a shown sphere on it.
const holesXZ = (page, names) => page.evaluate(names => names.map(n => {
  const { col, row } = App.parseHole(n);
  const h = App.state.breadboard.getHole(col, row);
  return { n, x: h.x, z: h.z };
}), names);
const covered = (spheres, holes) => holes.filter(h => spheres.some(s => Math.abs(s.x - h.x) < 0.02 && Math.abs(s.z - h.z) < 0.02)).map(h => h.n);

// A visible mesh named `name` anywhere in the scene (the hover ghost included).
const sceneHas = (page, name) => page.evaluate(name => {
  let found = false;
  App.scene.traverse(o => {
    if (o.name !== name) return;
    let visible = true;
    for (let x = o; x; x = x.parent) if (x.visible === false) visible = false;
    if (visible) found = true;
  });
  return found;
}, name);

// Wire a pin in label form ("BAT1.0") or a hole to a hole, the way the mouse
// handlers finish a wire.
function wire(page, from, to) {
  return page.evaluate(([from, to]) => {
    const endAt = s => {
      const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
      if (m) {
        const comp = App.state.components.find(c => c.label === m[1]);
        const pm = comp.pinMeshes[Number(m[2])];
        return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      }
      const { col, row } = App.parseHole(s);
      const h = App.state.breadboard.getHole(col, row);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    App.state.wireStart = endAt(from);
    App.finishWire(endAt(to));
  }, [from, to]);
}

// Which segments of the placed display are lit: { a: false, b: true, … },
// or null when a segment mesh is missing.
const litSegments = page => page.evaluate(segs => {
  const c = App.state.components.find(p => p.type === 'seven_segment');
  if (!c || !c.group) return null;
  const out = {};
  for (const s of segs) {
    const o = c.group.getObjectByName('seg-' + s);
    if (!o) return null;
    let visible = true;
    for (let x = o; x; x = x.parent) if (x.visible === false) visible = false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    out[s] = visible && !!m && !!m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0;
  }
  return out;
}, SEGMENTS);
const onlyLit = lit => Object.fromEntries(SEGMENTS.map(s => [s, lit.includes(s)]));

// ── By hand: pick, hover (refused, then allowed), place, wire the 1, Run ──

test('by hand: pick it in the sidebar, the ghost refuses b30 with the straddle message and fits f30, a click places it; wired as the known answer, Run shows 1 with b and c lit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="seven_segment"]');
  await expect(item, 'the 7-segment display has a sidebar item').toHaveCount(1);
  await item.click();

  // Off the gap: 10 red leg spheres and the straddle message as the hint.
  await hover(page, 'b30');
  const bad = await hoverLegs(page);
  const B30 = ['b30', 'b31', 'b32', 'b33', 'b34', 'a34', 'a33', 'a32', 'a31', 'a30'];
  expect(bad.length, `one sphere per leg at b30: ${JSON.stringify(bad)}`).toBe(10);
  expect(covered(bad, await holesXZ(page, B30))).toEqual(B30);
  expect(bad.every(s => s.red), 'refused, so red').toBe(true);
  await expect(page.locator('#hint-text')).toContainText(STRADDLE);

  // Across the gap: 10 green spheres on f30–f34 / e34–e30, the ghost shows.
  await hover(page, 'f30');
  const ok = await hoverLegs(page);
  expect(ok.length, `one sphere per leg at f30: ${JSON.stringify(ok)}`).toBe(10);
  expect(covered(ok, await holesXZ(page, LEGS_F30))).toEqual(LEGS_F30);
  expect(ok.some(s => s.red), 'allowed, so not red').toBe(false);
  await expect(page.locator('#hint-text')).not.toContainText(STRADDLE);
  expect(await sceneHas(page, 'seg-a'), "the ghost (the part's own model) shows while hovering").toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  const at = await screenPoint(page, 'f30');
  await page.mouse.click(at.x, at.y);
  const placed = await page.evaluate(() => App.state.components.map(c => ({ type: c.type, legs: Parts.legsOf(c).map(l => l.pin + '@' + l.hole) })));
  expect(placed).toHaveLength(1);
  expect(placed[0].type).toBe('seven_segment');
  expect(placed[0].legs).toEqual(['e', 'd', 'com1', 'c', 'dp', 'b', 'a', 'com2', 'f', 'g'].map((p, i) => `${p}@${LEGS_F30[i]}`));
  await page.keyboard.press('Escape');

  // The known answer: b and c each through 470 Ω from 9 V, commons to ground.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [hole('c34'), hole('c39')], { resistance: 470 });
    App.placePart('resistor', [hole('h33'), hole('h37')], { resistance: 470 });
  });
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_1', 'bp_1'], ['tn_1', 'bn_1'],
                        ['tp_39', 'a39'], ['bp_37', 'j37'], ['a32', 'tn_32'], ['j32', 'bn_32']]) {
    await wire(page, a, b);
  }
  expect(await page.evaluate(() => App.state.wires.length)).toBe(8);

  expect(await litSegments(page), "8 meshes named 'seg-a' … 'seg-dp', all dark before Run").toEqual(onlyLit([]));
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page)).toMatch(/shows 1\b/);
  expect(await litSegments(page)).toEqual(onlyLit(['b', 'c']));

  await page.evaluate(() => App.stopSimulation());
  expect(await litSegments(page), 'Stop darkens every segment').toEqual(onlyLit([]));
  expect(errors).toEqual([]);
});

// ── A stubbed AI build of the digit 7 ─────────────────────────────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const SEVEN_BUILD = {
  reply: 'Built a 7 on the seven-segment display: segments a, b and c, each through its own 470 Ω resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    wireA('BAT1.0', 'tp_63', 'red'),
    wireA('BAT1.1', 'tn_63', 'black'),
    wireA('tp_1', 'bp_1', 'red'),
    wireA('tn_1', 'bn_1', 'black'),
    { tool: 'place_seven_segment', hole: 'f30', direction: 'right' },
    { tool: 'place_resistor', holeA: 'b33', holeB: 'b37' },   // a
    wireA('tp_37', 'a37', 'red'),
    { tool: 'place_resistor', holeA: 'c34', holeB: 'c39' },   // b
    wireA('tp_39', 'a39', 'red'),
    { tool: 'place_resistor', holeA: 'h33', holeB: 'h37' },   // c
    wireA('bp_37', 'j37', 'red'),
    wireA('a32', 'tn_32', 'black'),                           // com2
    wireA('j32', 'bn_32', 'black'),                           // com1
  ],
};

test('a stubbed AI reply to "Show the number 7 on a seven-segment display" applies on Accept, and Run shows 7 with a, b and c lit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, SEVEN_BUILD);

  await page.locator('#sparky-input').fill('Show the number 7 on a seven-segment display');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${SEVEN_BUILD.actions.length} changes to your circuit.`);
  const legs = await page.evaluate(() => {
    const c = App.state.components.find(p => p.type === 'seven_segment');
    return c && Parts.legsOf(c).map(l => l.hole);
  });
  expect(legs).toEqual(LEGS_F30);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page)).toMatch(/shows 7\b/);
  expect(await litSegments(page)).toEqual(onlyLit(['a', 'b', 'c']));
  expect(errors).toEqual([]);
});
