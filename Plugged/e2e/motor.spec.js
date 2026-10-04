// The DC motor in the page, issue #37: picked from the generated sidebar,
// placed by hand as a span part (the ghost shows), wired straight across a
// 3 V battery and simulated, with its shaft turning between frames and
// turning the other way when the battery is reversed; and built by a stubbed
// AI reply to the QA prompt (the switch closed by set_control), applied with
// Accept. /api/ask is stubbed with page.route; no AI is called. Guest only;
// Google sign-in stays a manual QA case.
//
// The logic (measure, speed, direction, the 0.5 A warning, placement, round
// trip, AI tools, recipe, series / parallel / reversed circuits) is in
// test/parts-motor.test.js and test/motor-recipe.test.js. These tests cover
// what needs a real page: the sidebar pick, the hover ghost, the click that
// places it, Run / Stop and the results panel, the shaft turned by
// view.update, and Accept on an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="motor"].
// - A span part, 4 columns by default: hovering c30 and clicking puts pin 1
//   in c30 and pin 2 in c34, as the 10 Ω / 0.05 A-start motor.
// - While simulating, a #sim-results line names the motor (/motor/i) and
//   says "spinning" with its current ("300.0 mA" or "300 mA"): the part's
//   line(r, m).
// - The turning object in the model is marked userData.motorShaft. While
//   the motor spins its world rotation changes from one animation frame to
//   the next (started from view.update); before Run and after Stop it holds
//   still. With the current reversed it turns about the opposite axis.
//
// Known answer by hand (pin 1 c30, pin 2 c34): BAT1 at 3 V on tp_63/tn_63;
// tp_30 → a30; a34 → tn_34. I = 3 / 10 = 300 mA, spinning, full speed.
// Reversed: BAT1.0 → tn_63, BAT1.1 → tp_63: −300 mA, the other way round.
// AI build (the recipe): BAT1 at 3 V; tp_2 → a2; switch b2–b4; motor c4–c8;
// a8 → tn_8; set_control closes the switch: 299.97 mA, spinning.
const { test, expect } = require('@playwright/test');
const Parts = require('../circuit3d/js/parts');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const motorLine = async page => (await page.locator('#sim-results .sim-line').allTextContents()).find(t => /motor/i.test(t)) || '';
const SPINNING = /^(?!.*(not spinning|stalled)).*spinning/i;

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

// Where a board hole ("c30") is on screen, in page pixels.
function holePoint(page, where) {
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

// The ghost: a visible object added after load that isn't a placed part's
// group, drawn entirely in see-through materials.
function hasGhost(page) {
  return page.evaluate(() => {
    const owned = new Set(App.state.components.map(c => c.group).filter(Boolean));
    for (const o of App.scene.children) {
      if (window.__sceneBefore.has(o.uuid) || !o.visible || owned.has(o)) continue;
      const meshes = [];
      o.traverse(m => { if (m.isMesh) meshes.push(m); });
      if (meshes.length && meshes.every(m => m.material.transparent && m.material.opacity < 1)) return true;
    }
    return false;
  });
}

const motorOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'motor');
  return c ? { label: c.label, values: c.values, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});

// How the placed motor's shaft (userData.motorShaft) turns over `frames`
// animation frames: the total angle it turns (radians) and the turn axis in
// world space, weighted by angle. Its world rotation, so it doesn't matter
// whether the shaft or a pivot above it is what turns.
function shaftTurn(page, frames = 8) {
  return page.evaluate(async frames => {
    const c = App.state.components.find(x => x.type === 'motor');
    if (!c || !c.group) return { error: 'no motor model on the board' };
    let shaft = null;
    c.group.traverse(o => { if (!shaft && o.userData && o.userData.motorShaft) shaft = o; });
    if (!shaft) return { error: 'no object marked userData.motorShaft in the motor model' };
    const q = () => { shaft.updateWorldMatrix(true, false); return shaft.getWorldQuaternion(new THREE.Quaternion()); };
    const frame = () => new Promise(r => requestAnimationFrame(r));
    await frame();
    let prev = q(), total = 0;
    const axis = new THREE.Vector3();
    for (let i = 0; i < frames; i++) {
      await frame();
      const cur = q();
      const d = cur.clone().multiply(prev.clone().invert());
      if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
      const angle = 2 * Math.acos(Math.min(1, d.w));
      const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
      if (angle > 1e-6 && s > 1e-9) axis.add(new THREE.Vector3(d.x / s, d.y / s, d.z / s).multiplyScalar(angle));
      total += angle;
      prev = cur;
    }
    return { total, axis: axis.toArray() };
  }, frames);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
}

// ── By hand: pick, ghost, place, wire the known answer, Run, the shaft turns ──

test('by hand: pick the motor in the sidebar, see its ghost, place it on c30–c34; across 3 V, Run shows it spinning at 300 mA and the shaft turns; reversed, it turns the other way; Stop holds it still', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="motor"]');
  await expect(item, 'the motor has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'motor']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost motor on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await motorOf(page);
  expect(placed, 'a motor is on the board').not.toBeNull();
  expect(placed.legs).toEqual([['1', 'c30'], ['2', 'c34']]);
  expect(placed.values).toMatchObject({ resistance: 10, startCurrent: 0.05 });
  await page.keyboard.press('Escape');

  // The known answer: a 3 V battery straight across the motor.
  await page.evaluate(() => App.placePart('battery', App.batterySpot(), { voltage: 3 }));
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_30', 'a30'], ['a34', 'tn_34']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  const idle = await shaftTurn(page);
  expect(idle.error, idle.error).toBeUndefined();
  expect(idle.total, 'before Run the shaft holds still').toBeLessThan(1e-4);

  await run(page);
  await expect.poll(() => motorLine(page), { message: 'a results line says the motor is spinning' }).toMatch(SPINNING);
  expect(await motorLine(page), 'and its current, 3 / 10 = 300 mA').toMatch(/\b300(\.0)? ?mA\b/);
  expect(await simText(page)).not.toMatch(/0\.5 ?A|⚠/);
  const fwd = await shaftTurn(page);
  expect(fwd.total, `while it spins the shaft turns between frames: ${JSON.stringify(fwd)}`).toBeGreaterThan(0.01);

  // Reverse the battery (+ to tn, − to tp): the same motor, the current the
  // other way through it.
  await page.evaluate(() => App.stopSimulation());
  const still = await shaftTurn(page);
  expect(still.total, 'after Stop the shaft holds still').toBeLessThan(1e-4);
  await page.evaluate(() => App.deletePart(App.state.components.find(c => c.type === 'battery')));
  await page.evaluate(() => App.placePart('battery', App.batterySpot(), { voltage: 3 }));
  for (const [a, b] of [['BAT1.0', 'tn_63'], ['BAT1.1', 'tp_63']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await run(page);
  await expect.poll(() => motorLine(page), { message: 'reversed, it still spins' }).toMatch(SPINNING);
  const back = await shaftTurn(page);
  expect(back.total, `reversed, the shaft still turns: ${JSON.stringify(back)}`).toBeGreaterThan(0.01);
  expect(dot(fwd.axis, back.axis), `reversed, it turns the other way: axes ${JSON.stringify(fwd.axis)} then ${JSON.stringify(back.axis)}`)
    .toBeLessThan(0);

  await page.evaluate(() => App.stopSimulation());
  expect((await shaftTurn(page)).total, 'after Stop the shaft holds still again').toBeLessThan(1e-4);
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: the QA prompt ─────────────────────────────────────

test('a stubbed AI reply to "Make a motor spin with a switch" (battery at 3 V, switch closed by set_control) applies cleanly on Accept, and Run shows the motor spinning with no warning', async ({ page }) => {
  test.setTimeout(90_000);
  const sw = Parts.get('toggle_switch').prefix + '1';
  const w = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
  const build = {
    reply: `Built it: the battery is set to 3 V so the motor draws 300 mA, and I've switched ${sw} on. Click it while the simulation runs to stop the motor.`,
    actions: [
      { tool: 'delete_all' },
      { tool: 'place_battery', voltage: 3 },
      { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
      { tool: 'place_motor', holeA: 'c4', holeB: 'c8' },
      w('BAT1.0', 'tp_63', 'red'),
      w('BAT1.1', 'tn_63', 'black'),
      w('tp_2', 'a2', 'red'),
      w('a8', 'tn_8', 'black'),
      { tool: 'set_control', part: sw, closed: true },
    ],
  };
  const errors = watchErrors(page);
  await openEditor(page, build);
  expect(await page.evaluate(() => !!Parts.get('motor')), 'the page registers the motor (js/parts/motor.js)').toBe(true);

  await page.locator('#sparky-input').fill('Make a motor spin with a switch');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${build.actions.length} changes to your circuit.`);
  const mo = await motorOf(page);
  expect(mo, 'the AI build placed a motor').not.toBeNull();
  expect(mo.legs).toEqual([['1', 'c4'], ['2', 'c8']]);
  expect(await page.evaluate(() => App.state.components.find(c => c.type === 'battery').values.voltage)).toBe(3);

  await run(page);
  await expect.poll(() => motorLine(page), { message: 'the motor spins' }).toMatch(SPINNING);
  expect(await motorLine(page)).toMatch(/\b(299\.9|300(\.0)?) ?mA\b/);
  expect(await simText(page)).not.toMatch(/0\.5 ?A|⚠/);
  expect(errors).toEqual([]);
});
