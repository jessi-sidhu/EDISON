// The light sensor (LDR) in the page, issue #40: picked from the generated
// sidebar (under I/O), placed by hand as a span part (the ghost shows), wired
// into the night light, and darkened while simulating: by the scroll wheel
// over it (App.partGesture through the #26 dispatcher) or by the inspector's
// light slider. /api/ask is stubbed; no AI is called. Guest only; Google
// sign-in stays a manual QA case.
//
// Shapes this spec assumes (the issue's decisions comment; stated so the
// builder matches them):
// - The sidebar item is #sidebar .comp-group[data-category="I/O"]
//   .comp-item[data-type="ldr"], named "Light sensor"; it is labelled LDR1…
// - A span part, 3 columns by default: a click on d6 places pin 1 in d6 and
//   pin 2 in d9, with values { r10: 10000 } and controls { light: 300 }.
// - Scroll (the pot's rule, generic for every slider): wheel UP adds light,
//   wheel DOWN takes it away, one tick = 1/20 of 1–10000 = 500 lux, clamped
//   to 1–10000. From 300 one tick down reaches the 1 lux floor.
// - The inspector shows .inspector-row[data-key="light"] with an
//   <input type="range">; moving it re-simulates and is one undo step.
// - App.saveCircuit writes the saved control as `controls` and one named
//   holeRef per pin; App.loadCircuitData reads them back.
//
// The night light (decision 3) at C = 2, one lead per hole: tp_3 → a2;
// resistor b2–b6 at 4.7 kΩ; LED anode c6, cathode c8; LDR d6 (pin 1) – d9
// (pin 2); a8 → tn_8; a9 → tn_9. Hand-computed (test/parts-ldr.test.js):
// 300 lux and 1000 lux → LED off; 10 lux → 1.289 mA ("1.3 mA");
// 1 lux → 1.449 mA ("1.4 mA"); 501 lux → off.
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
const ldrOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'ldr');
  return c ? { label: c.label, values: c.values, controls: c.controls || null,
               legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});
const light = async page => { const p = await ldrOf(page); return p && p.controls ? p.controls.light : null; };

// The LED's glow: its dome's emissiveIntensity.
const glow = (page, label = 'LED1') => page.evaluate(l => {
  const c = App.state.components.find(x => x.label === l);
  let v = null;
  if (c && c.group) c.group.traverse(o => { if (o.userData && o.userData.ledDome) v = o.material.emissiveIntensity; });
  return v;
}, label);

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

// The rest of the night light around an LDR already on d6–d9, made with the
// calls Chat.acceptBuild's board makes.
async function wireNightLight(page) {
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
    App.placePart('resistor', [hole('b2'), hole('b6')], { resistance: 4700 });
    App.placePart('led', [hole('c8'), hole('c6')]);   // cathode c8, anode c6
    wireHoles('tp_3', 'a2');
    wireHoles('a8', 'tn_8');
    wireHoles('a9', 'tn_9');
  });
}

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'the simulation has results' }).toContain('Battery 1');
}

// ── By hand: sidebar, ghost, place, wire, simulate, scroll, slider ──────────

test('by hand: pick the light sensor under I/O, see the ghost, place it on d6–d9, wire the night light; scrolling down and the slider turn the LED on', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);

  // The generated sidebar has it under I/O.
  const item = page.locator('#sidebar .comp-group[data-category="I/O"] .comp-item[data-type="ldr"]');
  await expect(item, 'the light sensor is in the sidebar under I/O').toHaveCount(1);
  await expect(item.locator('.comp-item-name')).toHaveText('Light sensor');
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'ldr']);

  // Hover d6: the ghost shows.
  const at = await holePoint(page, 'd6');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost light sensor on the board' }).toBe(true);

  // Click places LDR1 on d6 (pin 1) and d9 (pin 2), 10 kΩ at 10 lux, at 300 lux.
  await page.mouse.click(at.x, at.y);
  expect(await ldrOf(page)).toEqual({ label: 'LDR1', values: { r10: 10000 }, controls: { light: 300 },
                                     legs: [['1', 'd6'], ['2', 'd9']] });
  await page.keyboard.press('Escape');   // select mode

  // The night light at the default 300 lux: the LED is dark.
  await wireNightLight(page);
  await run(page);
  expect(await simText(page), 'at 300 lux the LDR holds the node under the LED\'s 2 V').not.toContain('LED ON');
  const gDark = await glow(page);

  // Scroll DOWN over the sensor (less light): 500 lux a tick, floored at 1 lux → the LED lights, 1.4 mA.
  const face = await partPoint(page, 'LDR1');
  await page.mouse.move(face.x, face.y);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
  await expect.poll(() => light(page), { message: 'wheel down takes light away, down to the 1 lux floor' }).toBe(1);
  await expect.poll(() => simText(page)).toContain('LED ON  (1.4 mA)');
  await expect.poll(() => glow(page), { message: 'the LED glows once it is dark' }).toBeGreaterThan(gDark);

  // Scroll UP one tick: +500 lux → 501 lux, the LED goes dark again.
  await page.mouse.wheel(0, -100);
  await expect.poll(() => light(page), { message: 'wheel up adds 500 lux' }).toBe(501);
  await expect.poll(() => simText(page), { message: 'at 501 lux the LED is off' }).not.toContain('LED ON');

  // The inspector: a light slider; 10 lux lights the LED at 1.3 mA, 1000 lux turns it off.
  await page.mouse.click(face.x, face.y);
  await expect(page.locator('#inspector-label')).toHaveText('LDR1');
  const slider = page.locator('#inspector .inspector-row[data-key="light"] input[type="range"]');
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveValue('501');
  const steps = await historySize(page);
  await slider.fill('10');
  await expect.poll(() => light(page)).toBe(10);
  await expect.poll(() => simText(page), { message: 'at 10 lux: (9 − 2)/4700 − 2/10000 = 1.29 mA' }).toContain('LED ON  (1.3 mA)');
  expect(await historySize(page), 'one slider move is one undo step').toBe(steps + 1);
  await slider.fill('1000');
  await expect.poll(() => light(page)).toBe(1000);
  await expect.poll(() => simText(page), { message: 'at 1000 lux the LED is off' }).not.toContain('LED ON');
  expect(errors).toEqual([]);
});

// ── Save and load keep the holes, r10 and the light ─────────────────────────

test('the downloaded .sparky keeps LDR1\'s holes, r10 and light 42; loading it back gives the same sensor', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('ldr', [hole('d6'), hole('d9')], { r10: 47000 });
  });
  expect(await ldrOf(page), 'App.placePart placed a light sensor').toBeTruthy();
  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'ldr'), { light: 42 }); });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const rec = file.components.find(c => c.label === 'LDR1');
  expect(rec, 'LDR1 is in the file').toBeTruthy();
  expect(rec.type).toBe('ldr');
  expect(rec.values.r10).toBe(47000);
  expect(rec.controls, 'the saved light is in the file').toEqual({ light: 42 });
  expect(rec.holeRefs).toEqual([{ pin: '1', col: 5, row: 'd' }, { pin: '2', col: 8, row: 'd' }]);

  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'ldr'), { light: 9000 }); });
  await page.evaluate(f => App.loadCircuitData(f), file);
  expect(await ldrOf(page)).toEqual({ label: 'LDR1', values: { r10: 47000 }, controls: { light: 42 },
                                     legs: [['1', 'd6'], ['2', 'd9']] });
  expect(errors).toEqual([]);
});
