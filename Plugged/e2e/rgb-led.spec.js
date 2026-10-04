// The RGB LED in the page, issue #42: picked from the generated sidebar,
// placed by hand (4 leg spheres and the ghost show), wired as the known
// answer (9 V → 470 Ω → red pin, cathode to ground) and simulated, with the
// dome glowing red; and a stubbed AI purple build accepted cleanly, with the
// dome glowing purple. /api/ask is stubbed with page.route; no AI is called.
// Guest only; Google sign-in stays a manual QA case.
//
// The logic (currents, colour mix, warnings, placement, round trip, AI
// tools, recipe, complex circuits) is in test/parts-rgb_led.test.js and
// test/rgb-led-recipe.test.js. These tests cover what needs a real page: the
// sidebar pick, the hover spheres and ghost, the click that places it, Run
// and the results panel, the dome colour drawn by view.update, and Accept on
// an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="rgb_led"].
// - A footprint part: hovering c30 (rotation 0) shows 4 green 'hover-leg'
//   spheres on c30–c33 and the ghost (the part's own view.build, so a
//   visible mesh named 'rgb-dome' is in the scene before anything is
//   placed); a click puts red c30, cathode c31, green c32, blue c33.
// - The dome is a mesh named 'rgb-dome' in the placed part's group. While
//   lit, its material's emissive colour is m.color and its
//   emissiveIntensity is higher than when dark; with no result (before Run,
//   after Stop) it is back to dark.
// - While simulating, a #sim-results line names the RGB LED (/RGB/) and
//   each lit die with its mA ("red 14.9 mA").
//
// Known answer by hand (at c30): BAT1 on tp_63 / tn_63; R1 470 Ω b26–b30;
// tp_26 → a26; a31 → tn_31. Red (9 − 2) / 470.1 = 14.9 mA, green and blue 0.
// AI build (the recipe): RGB1 at c10 facing right; R1 470 Ω b6–b10 (red),
// tp_6 → a6; R2 470 Ω b13–b17 (blue), tp_17 → a17; a11 → tn_11. Red 14.9 mA,
// blue (9 − 3.2) / 470.1 = 12.3 mA, green 0: purple.
const { test, expect } = require('@playwright/test');

const LEGS_C30 = ['c30', 'c31', 'c32', 'c33'];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const rgbLine = async page => (await page.locator('#sim-results .sim-line').allTextContents()).find(t => /RGB/.test(t)) || '';

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

// The placed RGB LED's dome: its emissive colour (0–1 each) and intensity,
// or null when there is no mesh named 'rgb-dome' in its group.
const dome = page => page.evaluate(() => {
  const c = App.state.components.find(p => p.type === 'rgb_led');
  const o = c && c.group && c.group.getObjectByName('rgb-dome');
  if (!o) return null;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return { r: m.emissive.r, g: m.emissive.g, b: m.emissive.b, intensity: m.emissiveIntensity };
});

// ── By hand: pick, hover, place, wire the known answer, Run ───────────────

test('by hand: pick the RGB LED in the sidebar, 4 leg spheres and the ghost show at c30, a click places it; wired red through 470 Ω, Run shows "red 14.9 mA" and a red dome; Stop darkens it', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="rgb_led"]');
  await expect(item, 'the RGB LED has a sidebar item').toHaveCount(1);
  await item.click();

  const at = await screenPoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  const legs = await hoverLegs(page);
  expect(legs.length, `one sphere per leg at c30: ${JSON.stringify(legs)}`).toBe(4);
  expect(covered(legs, await holesXZ(page, LEGS_C30))).toEqual(LEGS_C30);
  expect(legs.some(s => s.red), 'allowed, so not red').toBe(false);
  expect(await sceneHas(page, 'rgb-dome'), "the ghost (the part's own model) shows while hovering").toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await page.evaluate(() => App.state.components.map(c => ({ type: c.type, label: c.label, legs: Parts.legsOf(c).map(l => l.pin + '@' + l.hole) })));
  expect(placed).toEqual([{ type: 'rgb_led', label: 'RGB1', legs: ['red@c30', 'cathode@c31', 'green@c32', 'blue@c33'] }]);
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [hole('b26'), hole('b30')], { resistance: 470 });
  });
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_26', 'a26'], ['a31', 'tn_31']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  const dark = await dome(page);
  expect(dark, "the placed part's group has a mesh named 'rgb-dome'").not.toBeNull();

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => rgbLine(page), { message: 'a results line for the RGB LED with red 14.9 mA' }).toMatch(/\bred\b[^|]*14\.9 ?mA/i);
  const lit = await dome(page);
  expect(lit.r, `red dome: ${JSON.stringify(lit)}`).toBeGreaterThan(0.6);
  expect(lit.g, `red dome: ${JSON.stringify(lit)}`).toBeLessThan(0.25);
  expect(lit.b, `red dome: ${JSON.stringify(lit)}`).toBeLessThan(0.25);
  expect(lit.intensity, 'it glows brighter lit than dark').toBeGreaterThan(dark.intensity);

  await page.evaluate(() => App.stopSimulation());
  expect((await dome(page)).intensity, 'Stop darkens the dome').toBeCloseTo(dark.intensity, 5);
  expect(errors).toEqual([]);
});

// ── A stubbed AI purple build ─────────────────────────────────────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const PURPLE_BUILD = {
  reply: 'Built a purple RGB LED: red and blue each through their own 470 Ω resistor, green unused, the common cathode to ground.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'place_rgb_led', hole: 'c10', direction: 'right' },
    { tool: 'place_resistor', holeA: 'b6', holeB: 'b10', resistance: 470 },     // red
    { tool: 'place_resistor', holeA: 'b13', holeB: 'b17', resistance: 470 },    // blue
    wireA('BAT1.0', 'tp_63', 'red'),
    wireA('BAT1.1', 'tn_63', 'black'),
    wireA('tp_6', 'a6', 'red'),
    wireA('tp_17', 'a17', 'red'),
    wireA('a11', 'tn_11', 'black'),
  ],
};

test('a stubbed AI reply to "Make an RGB LED glow purple" applies every change on Accept, and Run lights red and blue with a purple dome', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, PURPLE_BUILD);

  await page.locator('#sparky-input').fill('Make an RGB LED glow purple');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${PURPLE_BUILD.actions.length} changes to your circuit.`);
  const legs = await page.evaluate(() => {
    const c = App.state.components.find(p => p.type === 'rgb_led');
    return c && Parts.legsOf(c).map(l => l.pin + '@' + l.hole);
  });
  expect(legs).toEqual(['red@c10', 'cathode@c11', 'green@c12', 'blue@c13']);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => rgbLine(page)).toMatch(/\bred\b[^|]*14\.9 ?mA/i);
  expect(await rgbLine(page)).toMatch(/\bblue\b[^|]*12\.3 ?mA/i);
  const lit = await dome(page);
  expect(lit, "the placed part's group has a mesh named 'rgb-dome'").not.toBeNull();
  expect(lit.r, `purple dome: ${JSON.stringify(lit)}`).toBeGreaterThan(0.6);
  expect(lit.b, `purple dome: ${JSON.stringify(lit)}`).toBeGreaterThan(0.6);
  expect(lit.g, `purple dome: ${JSON.stringify(lit)}`).toBeLessThan(0.25);
  expect(errors).toEqual([]);
});
