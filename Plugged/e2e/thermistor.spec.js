// The thermistor (NTC 10 kΩ) in the page, issue #41: picked from the
// generated sidebar (under I/O), placed by hand as a span part (the ghost
// shows), wired into the temperature alarm, and warmed while simulating: by
// the scroll wheel over it (App.partGesture through the #26 dispatcher) or by
// the inspector's temperature slider. /api/ask is stubbed; no AI is called.
// Guest only; Google sign-in stays a manual QA case.
//
// Shapes this spec assumes (the issue's decisions comment; stated so the
// builder matches them):
// - The sidebar item is #sidebar .comp-group[data-category="I/O"]
//   .comp-item[data-type="thermistor"], named "Thermistor"; it is labelled
//   TH1…
// - A span part, 3 columns by default: a click on b2 places pin 1 in b2 and
//   pin 2 in b5, with values { r25: 10000 } and controls { temperature: 25 }.
// - Scroll (the generic slider rule): wheel UP is hotter, wheel DOWN colder,
//   one tick = 1/20 of −20–120 = 7 °C, clamped to −20–120.
// - The inspector shows .inspector-row[data-key="temperature"] with an
//   <input type="range">; moving it re-simulates and is one undo step.
// - App.saveCircuit writes the saved control as `controls` and one named
//   holeRef per pin; App.loadCircuitData reads them back.
//
// The temperature alarm (decision 3) at C = 2, one lead per hole: tp_3 → a2;
// thermistor b2 (pin 1) – b5 (pin 2); resistor c5–c9 at 3.3 kΩ; buzzer
// d9–d11; a11 → tn_11. I = 9 / (R_th + 3342); the buzzer sounds from 1 mA.
// Hand-computed (test/parts-thermistor.test.js): 25 °C → 0.67 mA silent;
// 32 °C → 0.84 mA silent; 39 °C → 1.02 mA sounding ("1.0 mA");
// 50 °C → 1.30 mA sounding ("1.3 mA").
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');

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
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const historySize = page => page.evaluate(() => App.history.size());
const thOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'thermistor');
  return c ? { label: c.label, values: c.values, controls: c.controls || null,
               legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});
const temperature = async page => { const p = await thOf(page); return p && p.controls ? p.controls.temperature : null; };

// Where a board hole ("d6") is on screen, in page pixels.
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

// The centre of the biggest mesh in a part's model (its body or face) on
// screen, where a person points at it. Aiming inside a mesh, not at the
// group's top edge, keeps a thin or round body under the pointer.
function partPoint(page, label) {
  return page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    c.group.updateMatrixWorld(true);
    let box = null, most = -1;
    c.group.traverse(o => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      if (s.x * s.y * s.z > most) { most = s.x * s.y * s.z; box = b; }
    });
    const p = box.getCenter(new THREE.Vector3());
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, label);
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

// The rest of the temperature alarm around a thermistor already on b2–b5,
// made with the calls Chat.acceptBuild's board makes.
async function wireAlarm(page) {
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
    wireHoles('tp_3', 'a2');
    App.placePart('resistor', [hole('c5'), hole('c9')], { resistance: 3300 });
    App.placePart('buzzer', [hole('d9'), hole('d11')]);
    wireHoles('a11', 'tn_11');
  });
}

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'the simulation has results' }).toContain('Battery 1');
}

// ── By hand: sidebar, ghost, place, wire, simulate, scroll, slider ──────────

test('by hand: pick the thermistor under I/O, see the ghost, place it on b2–b5, wire the alarm; scrolling up and the slider sound the buzzer', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);

  // The generated sidebar has it under I/O.
  const item = page.locator('#sidebar .comp-group[data-category="I/O"] .comp-item[data-type="thermistor"]');
  await expect(item, 'the thermistor is in the sidebar under I/O').toHaveCount(1);
  await expect(item.locator('.comp-item-name')).toHaveText('Thermistor');
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'thermistor']);

  // Hover b2: the ghost shows.
  const at = await holePoint(page, 'b2');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost thermistor on the board' }).toBe(true);

  // Click places TH1 on b2 (pin 1) and b5 (pin 2), 10 kΩ at 25 °C, at 25 °C.
  await page.mouse.click(at.x, at.y);
  expect(await thOf(page)).toEqual({ label: 'TH1', values: { r25: 10000 }, controls: { temperature: 25 },
                                    legs: [['1', 'b2'], ['2', 'b5']] });
  await page.keyboard.press('Escape');   // select mode

  // The alarm at room temperature (25 °C): 0.67 mA, silent.
  await wireAlarm(page);
  await run(page);
  expect(await simText(page), 'at 25 °C the loop carries 0.67 mA, under the buzzer\'s 1 mA').not.toContain('BUZZER ON');

  // Scroll UP over the thermistor (hotter): 7 °C a tick. 32 °C is still silent (0.84 mA);
  // 39 °C sounds (9 / (5520 + 3342) = 1.02 mA).
  const bead = await partPoint(page, 'TH1');
  await page.mouse.move(bead.x, bead.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => temperature(page), { message: 'wheel up adds 7 °C' }).toBe(32);
  await expect.poll(() => simText(page), { message: 'at 32 °C the buzzer is silent' }).not.toContain('BUZZER ON');
  await page.mouse.wheel(0, -100);
  await expect.poll(() => temperature(page), { message: 'a second tick up reaches 39 °C' }).toBe(39);
  await expect.poll(() => simText(page), { message: 'at 39 °C the buzzer sounds' }).toContain('BUZZER ON  (1.0 mA)');

  // Scroll DOWN one tick: back to 32 °C, silent again.
  await page.mouse.wheel(0, 100);
  await expect.poll(() => temperature(page), { message: 'wheel down takes 7 °C away' }).toBe(32);
  await expect.poll(() => simText(page), { message: 'at 32 °C the buzzer is silent again' }).not.toContain('BUZZER ON');

  // The inspector: a temperature slider; 50 °C sounds at 1.3 mA, 25 °C is silent.
  await page.mouse.click(bead.x, bead.y);
  await expect(page.locator('#inspector-label')).toHaveText('TH1');
  const slider = page.locator('#inspector .inspector-row[data-key="temperature"] input[type="range"]');
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveValue('32');
  const steps = await historySize(page);
  await slider.fill('50');
  await expect.poll(() => temperature(page)).toBe(50);
  await expect.poll(() => simText(page), { message: 'at 50 °C: 9 / (3588 + 3342) = 1.30 mA' }).toContain('BUZZER ON  (1.3 mA)');
  expect(await historySize(page), 'one slider move is one undo step').toBe(steps + 1);
  await slider.fill('25');
  await expect.poll(() => temperature(page)).toBe(25);
  await expect.poll(() => simText(page), { message: 'at 25 °C the buzzer is silent' }).not.toContain('BUZZER ON');
  expect(errors).toEqual([]);
});

// ── Save and load keep the holes, r25 and the temperature ───────────────────

test('the downloaded .sparky keeps TH1\'s holes, r25 and temperature 42; loading it back gives the same thermistor', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('thermistor', [hole('b2'), hole('b5')], { r25: 47000 });
  });
  expect(await thOf(page), 'App.placePart placed a thermistor').toBeTruthy();
  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'thermistor'), { temperature: 42 }); });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const rec = file.components.find(c => c.label === 'TH1');
  expect(rec, 'TH1 is in the file').toBeTruthy();
  expect(rec.type).toBe('thermistor');
  expect(rec.values.r25).toBe(47000);
  expect(rec.controls, 'the saved temperature is in the file').toEqual({ temperature: 42 });
  expect(rec.holeRefs).toEqual([{ pin: '1', col: 1, row: 'b' }, { pin: '2', col: 4, row: 'b' }]);

  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'thermistor'), { temperature: 100 }); });
  await page.evaluate(f => App.loadCircuitData(f), file);
  expect(await thOf(page)).toEqual({ label: 'TH1', values: { r25: 47000 }, controls: { temperature: 42 },
                                    legs: [['1', 'b2'], ['2', 'b5']] });
  expect(errors).toEqual([]);
});
