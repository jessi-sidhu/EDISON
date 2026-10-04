// The toggle switch (SPST) in the page, issue #32: picked from the generated
// sidebar, placed by hand (the ghost shows), wired into the known answer and
// simulated; clicked while simulating it flips and STAYS where it's left
// (Stop keeps it, unlike the push button), and its state is saved with the
// circuit (autosave → reload, and the downloaded .sparky → load). Also built
// by a stubbed AI reply (place_toggle_switch + set_control) applied with
// Accept. /api/ask is stubbed with page.route; no AI is called. Guest only;
// Google sign-in stays a manual QA case.
//
// The logic (elements, measure, report, the known answer both ways, AND/OR
// circuits, placement, hole map, AI tools and recipe) is in
// test/parts-toggle_switch.test.js and test/toggle-switch-recipe.test.js.
// These tests cover what needs a real page: the sidebar pick, the hover
// ghost, the click that places it, the click on the model that flips it
// (App.partGesture through interaction.js), Run / Stop and the results
// panel, Accept on an AI preview, and App.saveCircuit / autosave / reload /
// App.loadCircuitData.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="toggle_switch"].
// - A span part, 2 columns: hovering c30 and clicking puts pin '1' in c30 and
//   pin '2' in c32, open (controls { closed: false }).
// - Its state is the record's controls.closed; a click on its model while
//   simulating flips it; Stop leaves it as it is.
// - A saved control is written to the file and the autosave, and read back.
//
// Known answer by hand (switch c30–c32): BAT1 on tp_63 / tn_63; tp_30 → a30;
// 470 Ω b32–b36; red LED anode c36, cathode c38; a38 → tn_38.
// Closed: (9 − 2.0) / 470.101 = 14.89 mA ("LED ON  (14.9 mA)"). Open: no path.
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const Parts = require('../circuit3d/js/parts');

const GUEST_KEY = 'sparky_local_projects:guest';   // SparkyStorage.projectsKey(null)

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

// The switch's definition in Node: its label is its prefix + 1.
function switchDef() {
  const def = Parts.get('toggle_switch');
  expect(def, "Parts.get('toggle_switch') in Node: parts/toggle_switch.js must exist and be listed in parts/index.js").toBeTruthy();
  return def;
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

// The top centre of a part's model on screen, where a person clicks it.
function partPoint(page, type) {
  return page.evaluate(t => {
    const c = App.state.components.find(x => x.type === t);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, type);
}

async function clickSwitch(page) {
  const at = await partPoint(page, 'toggle_switch');
  await page.mouse.click(at.x, at.y);
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

const switchOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'toggle_switch');
  return c ? { label: c.label, controls: c.controls || null, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});
const closed = async page => { const s = await switchOf(page); return s && s.controls ? s.controls.closed : `no switch or no controls: ${JSON.stringify(s)}`; };

// The switch's controls in this tab's autosaved circuit.
const autosavedSwitch = page => page.evaluate(k => {
  const id = App.state.circuitId;
  const rec = JSON.parse(localStorage.getItem(k) || '[]').find(p => p.id === id);
  const sw = rec && (rec.components || []).find(c => c.type === 'toggle_switch');
  return sw ? (sw.controls || {}) : null;
}, GUEST_KEY);

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

// ── By hand: pick, ghost, place, wire the known answer, Run, click to flip ──

test('by hand: place the switch from the sidebar (ghost shows), wire the known answer, Run; clicks flip the LED on and off, Stop keeps it on, and a reload reopens it on', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="toggle_switch"]');
  await expect(item, 'the toggle switch has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'toggle_switch']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost switch on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await switchOf(page);
  expect(placed, 'a toggle switch is on the board').not.toBeNull();
  expect(placed.legs).toEqual([['1', 'c30'], ['2', 'c32']]);
  expect(placed.controls, 'a new switch starts open').toEqual({ closed: false });
  await page.keyboard.press('Escape');

  // The known answer: 9 V → the switch → 470 Ω → red LED → ground.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [hole('b32'), hole('b36')], { resistance: 470 });
    App.placePart('led', [hole('c38'), hole('c36')]);   // cathode c38, anode c36
  });
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_30', 'a30'], ['a38', 'tn_38']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  // Open: no path, the LED is dark.
  await run(page);
  await expect.poll(() => simText(page)).toContain('Circuit open');
  expect(await simText(page)).not.toContain('LED ON');

  // Click: closed, the LED lights at 14.9 mA.
  await clickSwitch(page);
  await expect.poll(() => closed(page), { message: 'a click on the switch while simulating closes it' }).toBe(true);
  await expect.poll(() => simText(page), { message: 'closed, the LED lights at 14.9 mA' }).toContain('LED ON  (14.9 mA)');

  // Click again: open, dark.
  await clickSwitch(page);
  await expect.poll(() => closed(page)).toBe(false);
  await expect.poll(() => simText(page)).toContain('Circuit open');
  expect(await simText(page)).not.toContain('LED ON');

  // Click once more, then Stop: a toggle stays where it's left (the button's
  // momentary press is what Stop resets).
  await clickSwitch(page);
  await expect.poll(() => closed(page)).toBe(true);
  await page.locator('#sim-stop-btn').click();
  expect(await closed(page), 'Stop leaves the switch closed').toBe(true);
  await run(page);
  await expect.poll(() => simText(page), { message: 'Run again: still on' }).toContain('LED ON  (14.9 mA)');
  await page.locator('#sim-stop-btn').click();

  // Saved with the circuit: the autosave keeps the flipped state, and a
  // reload reopens the switch closed.
  await expect.poll(() => autosavedSwitch(page), { message: 'the autosaved circuit has the switch closed', timeout: 5_000 })
    .toEqual({ closed: true });
  await page.reload();
  await editorReady(page);
  await expect.poll(() => page.evaluate(() => App.state.components.length)).toBe(4);
  expect(await closed(page), 'reopened after a reload, the switch is still closed').toBe(true);
  await run(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: place_toggle_switch + set_control, Accept, Run ────

test('a stubbed AI reply to "Add an on/off switch to an LED circuit" (place_toggle_switch, then set_control closed) applies on Accept; Run lights the LED, and a click turns it off', async ({ page }) => {
  test.setTimeout(90_000);
  const label = switchDef().prefix + '1';
  const w = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
  const build = {
    reply: `Added an on/off switch in front of the LED. I've switched it on; click ${label} while the simulation runs to flip it.`,
    actions: [
      { tool: 'delete_all' },
      { tool: 'place_battery' },
      { tool: 'place_toggle_switch', holeA: 'b2', holeB: 'b4' },
      { tool: 'place_resistor', holeA: 'c4', holeB: 'c8', resistance: 470 },
      { tool: 'place_led', holeA: 'd10', holeB: 'd8', color: 'red' },   // cathode d10, anode d8
      w('BAT1.0', 'tp_63', 'red'),
      w('BAT1.1', 'tn_63', 'black'),
      w('tp_2', 'a2', 'red'),
      w('a10', 'tn_10', 'black'),
      { tool: 'set_control', part: label, closed: true },
    ],
  };
  const errors = watchErrors(page);
  await openEditor(page, build);

  await page.locator('#sparky-input').fill('Add an on/off switch to an LED circuit');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${build.actions.length} changes to your circuit.`);
  const sw = await switchOf(page);
  expect(sw, 'the AI build placed a toggle switch').not.toBeNull();
  expect(sw).toEqual({ label, controls: { closed: true }, legs: [['1', 'b2'], ['2', 'b4']] });

  await run(page);
  await expect.poll(() => simText(page), { message: 'the AI closed the switch: the LED lights at 14.9 mA' }).toContain('LED ON  (14.9 mA)');
  await clickSwitch(page);
  await expect.poll(() => closed(page)).toBe(false);
  await expect.poll(() => simText(page)).toContain('Circuit open');
  expect(errors).toEqual([]);
});

// ── The downloaded .sparky: the switch's state is kept, the button's not ──

test("the downloaded .sparky keeps the switch's closed state and not the button's press; loading it back gives a closed switch and a released button", async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const label = switchDef().prefix + '1';
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('toggle_switch', [hole('e20'), hole('f20')]);   // across the gap
    App.placePart('button', [hole('b40'), hole('b43')]);
    App.setControls(App.state.components.find(c => c.type === 'toggle_switch'), { closed: true });
    App.setControls(App.state.components.find(c => c.type === 'button'), { pressed: true });
  });
  expect(await switchOf(page)).toEqual({ label, controls: { closed: true }, legs: [['1', 'e20'], ['2', 'f20']] });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const swRec = file.components.find(c => c.type === 'toggle_switch');
  const btnRec = file.components.find(c => c.type === 'button');
  expect(swRec, 'the switch is in the file').toBeTruthy();
  expect(swRec.label).toBe(label);
  expect(swRec.controls, "the switch's saved state is in the file").toEqual({ closed: true });
  expect(swRec.holeRefs).toEqual([{ pin: '1', col: 19, row: 'e' }, { pin: '2', col: 19, row: 'f' }]);
  expect(btnRec, 'the button is in the file').toBeTruthy();
  expect(btnRec.controls && btnRec.controls.pressed, "the button's momentary press is never saved").toBeUndefined();

  // Change both, then load the file back.
  await page.evaluate(() => {
    App.setControls(App.state.components.find(c => c.type === 'toggle_switch'), { closed: false });
  });
  await page.evaluate(f => App.loadCircuitData(f), file);
  expect(await switchOf(page)).toEqual({ label, controls: { closed: true }, legs: [['1', 'e20'], ['2', 'f20']] });
  const pressed = await page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'button');
    return c && c.controls ? c.controls.pressed : null;
  });
  expect(pressed, 'the button reopens released').toBe(false);
  expect(errors).toEqual([]);
});
