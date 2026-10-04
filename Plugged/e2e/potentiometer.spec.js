// The potentiometer in the page, issue #31: picked from the generated sidebar
// (under Passives), placed by hand as a footprint part (3 leg spheres and a
// ghost, R rotates), wired into the LED dimmer, and turned while simulating:
// by the scroll wheel over it (through App.partGesture and the #26
// dispatcher) or by the inspector's position slider. The LED's glow follows
// its current (decision 6). /api/ask is stubbed; no AI is called. Guest only;
// Google sign-in stays a manual QA case.
//
// Shapes this spec assumes (the issue's decisions comment; stated so the
// builder matches them):
// - The pot's sidebar item is #sidebar .comp-group[data-category="Passives"]
//   .comp-item[data-type="potentiometer"]; it is labelled RV1, RV2…
// - Scroll while simulating (the #31 correction; generic for every slider):
//   wheel UP (deltaY < 0) increases the control, wheel down decreases it,
//   today's direction mapping. One tick moves 1/20 of the control's range,
//   not its step: 5 % for the pot's 0–100. Clamped to min–max. One scroll
//   gesture is one undo step and re-simulates at most once per 100 ms plus
//   once when it ends (300 ms after the last tick).
// - The inspector shows a .inspector-row[data-key="position"] with an
//   <input type="range"> (step 1); moving it re-simulates and is one undo step.
// - The LED's glow is its dome's material.emissiveIntensity (the mesh with
//   userData.ledDome in the LED's group): today 3.5 lit, 0.45 dark; lit, it
//   becomes 3.5 × clamp(current / 15 mA, 0.15, 1.3).
// - App.saveCircuit writes the pot's saved control as `controls` and one
//   named holeRef per pin; App.loadCircuitData reads them back.
//
// The dimmer (decision 5 as corrected: pin 3 to +, pin 1 to −, so scrolling
// up brightens) at C = 2, one lead per hole: pot 1 kΩ with pin 1 c2, wiper
// c3, pin 3 c4; tp_4 → a4 (pin 3), a2 → tn_2 (pin 1); resistor b3–b7; LED
// anode c7, cathode c9; a9 → tn_9. Hand-computed LED current (test/parts-
// potentiometer.test.js): 100 % → 14.84 mA ("14.8 mA"), 50 % → 3.47 mA
// ("3.5 mA"), 20 % → off (wiper 1.80 V).
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

const simLines = page => page.locator('#sim-results .sim-line').allTextContents();
const simText = async page => (await simLines(page)).join(' | ');
const historySize = page => page.evaluate(() => App.history.size());
const potOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'potentiometer');
  return c ? { label: c.label, values: c.values, controls: c.controls || null,
               legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});
const position = async page => { const p = await potOf(page); return p && p.controls ? p.controls.position : null; };

// The LED's glow: its dome's emissiveIntensity.
const glow = (page, label = 'LED1') => page.evaluate(l => {
  const c = App.state.components.find(x => x.label === l);
  let v = null;
  if (c && c.group) c.group.traverse(o => { if (o.userData && o.userData.ledDome) v = o.material.emissiveIntensity; });
  return v;
}, label);

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

async function hover(page, where) {
  const at = await holePoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  return at;
}

// The top centre of a part's model on screen, where a person points at it.
function partPoint(page, label) {
  return page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, label);
}

// The shown 'hover-leg' spheres, as the holes under them ("c2").
function hoverLegHoles(page) {
  return page.evaluate(() => {
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const out = [];
    App.scene.traverse(o => {
      if (!o.isMesh || o.name !== 'hover-leg' || !shown(o)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      const h = App.state.breadboard.getNearestHole(v.x, v.z, null);
      out.push(h ? App.formatHole({ col: h.col, row: h.row }) : null);
    });
    return out.sort();
  });
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

// The rest of the dimmer around a pot already on c2 c3 c4, made with the
// calls Chat.acceptBuild's board makes. Sets the pot to 1 kΩ and `position`.
async function wireDimmer(page, pos, C = 2) {
  await page.evaluate(([pos, C]) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const wireHoles = (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); };
    let bat = App.state.components.find(c => c.type === 'battery');
    if (!bat) {
      App.placePart('battery', App.batterySpot());
      bat = App.state.components.find(c => c.type === 'battery');
      for (const [k, rail] of [[0, 'tp_63'], [1, 'tn_63']]) {
        const pm = bat.pinMeshes[k];
        App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
        App.finishWire(end(rail));
      }
    }
    const pot = App.state.components.find(c => c.type === 'potentiometer' && c.holeRefs && c.holeRefs[0].col === C - 1);
    App.setValues(pot, { resistance: 1000 });
    App.setControls(pot, { position: pos });
    wireHoles(`tp_${C + 2}`, `a${C + 2}`);   // pin 3 → +
    wireHoles(`a${C}`, `tn_${C}`);           // pin 1 → −
    App.placePart('resistor', [hole(`b${C + 1}`), hole(`b${C + 5}`)]);
    App.placePart('led', [hole(`c${C + 7}`), hole(`c${C + 5}`)]);   // cathode c{C+7}, anode c{C+5}
    wireHoles(`a${C + 7}`, `tn_${C + 7}`);
  }, [pos, C]);
}

// A pot placed straight through App.placePart at c{C} facing right.
async function placePot(page, C = 2) {
  await page.evaluate(C => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('potentiometer', [hole(`c${C}`), hole(`c${C + 1}`), hole(`c${C + 2}`)]);
  }, C);
  expect(await potOf(page), 'App.placePart placed a potentiometer').toBeTruthy();
}

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
}

// ── By hand: sidebar, ghost, rotate, place, wire, simulate, scroll, slider ──

test('by hand: pick the pot under Passives, see 3 leg spheres and the ghost, R rotates, place it, wire the dimmer; scrolling and the slider dim the LED', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);

  // The generated sidebar has it under Passives.
  const item = page.locator('#sidebar .comp-group[data-category="Passives"] .comp-item[data-type="potentiometer"]');
  await expect(item, 'the pot is in the sidebar under Passives').toHaveCount(1);
  await expect(item.locator('.comp-item-name')).toHaveText('Potentiometer');
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'potentiometer']);

  // Hover c2 facing right: spheres on c2 c3 c4, and the ghost.
  await hover(page, 'c2');
  await expect.poll(() => hoverLegHoles(page)).toEqual(['c2', 'c3', 'c4']);
  expect(await hasGhost(page), 'a see-through ghost pot on the board').toBe(true);

  // R: 90° (down). At a40: a40 b40 c40.
  await page.keyboard.press('r');
  await expect(page.locator('#hint-text')).toContainText('90');
  await hover(page, 'a40');
  await expect.poll(() => hoverLegHoles(page)).toEqual(['a40', 'b40', 'c40']);
  // R three more times: 180, 270, back to 0.
  for (let i = 0; i < 3; i++) await page.keyboard.press('r');
  await hover(page, 'c2');
  await expect.poll(() => hoverLegHoles(page)).toEqual(['c2', 'c3', 'c4']);

  // Click places RV1 on c2 (1), c3 (wiper), c4 (3), at 50 % and 10 kΩ.
  const at = await holePoint(page, 'c2');
  await page.mouse.click(at.x, at.y);
  expect(await potOf(page)).toEqual({ label: 'RV1', values: { resistance: 10000 }, controls: { position: 50 },
                                     legs: [['1', 'c2'], ['wiper', 'c3'], ['3', 'c4']] });
  await page.keyboard.press('Escape');   // select mode

  // The dimmer at the default 50 %: the LED lights at 3.5 mA.
  await wireDimmer(page, 50);
  await run(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');
  const g50 = await glow(page);

  // Scroll UP over the pot, 10 ticks: +5 % each → 100 %, 14.8 mA, brighter.
  const knob = await partPoint(page, 'RV1');
  await page.mouse.move(knob.x, knob.y);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  await expect.poll(() => position(page), { message: 'wheel up increases the position, 5 % a tick' }).toBe(100);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.8 mA)');
  await expect.poll(() => glow(page), { message: 'the LED glows more at 14.8 mA than at 3.5 mA' }).toBeGreaterThan(g50);
  const g100 = await glow(page);

  // Scroll DOWN 10 ticks: −5 % each → back to 50 %, 3.5 mA, dimmer again.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 100);
  await expect.poll(() => position(page), { message: 'wheel down decreases the position, 5 % a tick' }).toBe(50);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');
  await expect.poll(() => glow(page), { message: 'the LED glows less at 3.5 mA than at 14.8 mA' }).toBeLessThan(g100);

  // The inspector: a position slider at 50; moving it to 20 turns the LED off.
  await page.mouse.click(knob.x, knob.y);
  await expect(page.locator('#inspector-label')).toHaveText('RV1');
  const slider = page.locator('#inspector .inspector-row[data-key="position"] input[type="range"]');
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveValue('50');
  const steps = await historySize(page);
  await slider.fill('20');
  await expect.poll(() => position(page)).toBe(20);
  await expect.poll(() => simText(page), { message: 'at 20 % the wiper gives 1.8 V: the LED is off' }).not.toContain('LED ON');
  await expect.poll(() => glow(page)).toBeLessThan(g50);
  expect(await historySize(page), 'one slider move is one undo step').toBe(steps + 1);
  expect(errors).toEqual([]);
});

// ── The scroll burst: #26's throttle and one undo step ─────────────────────
// Ten wheel events dispatched on the canvas in one go (well under 100 ms),
// the way a fast flick arrives. Counted through App.runSimulation, which the
// dispatcher's simulate() calls while the simulation runs.

test('10 scroll ticks up over the pot within 100 ms: at most 2 re-simulations, one undo step, 50 % → 100 %', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placePot(page);
  await wireDimmer(page, 50);
  await run(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');
  const steps = await historySize(page);
  const knob = await partPoint(page, 'RV1');

  const burst = await page.evaluate(({ x, y }) => {
    window.__sims = 0;
    const orig = App.runSimulation;
    App.runSimulation = (...args) => { window.__sims++; return orig.apply(App, args); };
    const canvas = App.renderer.domElement;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      canvas.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY: -100, bubbles: true, cancelable: true }));
    }
    return { ms: performance.now() - t0, simsDuring: window.__sims };
  }, knob);
  expect(burst.ms, 'the 10 ticks arrived within 100 ms').toBeLessThan(100);

  await expect.poll(() => position(page), { message: '10 ticks up, +5 % each' }).toBe(100);
  await page.waitForTimeout(700);   // the gesture ends 300 ms after its last tick
  const sims = await page.evaluate(() => window.__sims);
  expect(sims, `re-simulations for the burst (${burst.simsDuring} during it)`).toBeGreaterThanOrEqual(1);
  expect(sims, 'at most one during the burst and one when it ends').toBeLessThanOrEqual(2);
  expect(await historySize(page), 'one scroll gesture = one undo step').toBe(steps + 1);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.8 mA)');

  // One Ctrl+Z takes the whole gesture back.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => position(page), { message: 'one undo returns the pot to 50 %' }).toBe(50);
  expect(errors).toEqual([]);
});

// ── The glow follows the current (decision 6) ─────────────────────────────
// Two circuits on one battery: the one-LED build at C = 2 (R1 b2–b6, LED1
// anode c6 / cathode c8, 14.9 mA) and the dimmer at C = 20 (RV1 c20 c21
// c22 at 1 kΩ, tp_22 → a22 (pin 3 → +), a20 → tn_20 (pin 1 → −), R2 b21–b25,
// LED2 anode c25 / cathode c27).

test('LED glow: LED1 at 14.9 mA glows as today (3.5); the dimmer\'s LED2 glows less at 50 % than at 100 %, and least at 20 % (off)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
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
    App.placePart('resistor', [hole('b2'), hole('b6')]);
    App.placePart('led', [hole('c8'), hole('c6')]);
    wireHoles('tp_3', 'a2');
    wireHoles('a8', 'tn_8');
  });
  await placePot(page, 20);
  await wireDimmer(page, 100, 20);
  expect(await page.evaluate(() => App.state.components.map(c => c.label))).toEqual(['BAT1', 'R1', 'LED1', 'RV1', 'R2', 'LED2']);

  await run(page);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  await expect.poll(() => simText(page)).toContain('LED ON  (14.8 mA)');
  const one = await glow(page, 'LED1');
  expect(Math.abs(one - 3.5), `LED1 at 14.9 mA glows as today (3.5); got ${one}`).toBeLessThan(0.05);

  const setPos = p => page.evaluate(p => {
    App.setControls(App.state.components.find(c => c.label === 'RV1'), { position: p });
  }, p);
  const g100 = await glow(page, 'LED2');
  await setPos(50);
  await expect.poll(() => simText(page)).toContain('LED ON  (3.5 mA)');
  const g50 = await glow(page, 'LED2');
  await setPos(20);
  await expect.poll(() => simText(page)).not.toContain('LED ON  (3.5 mA)');
  const g20 = await glow(page, 'LED2');
  expect(g100, `glow at 100 % (${g100}) > at 50 % (${g50})`).toBeGreaterThan(g50);
  expect(g50, `glow at 50 % (${g50}) > at 20 %, off (${g20})`).toBeGreaterThan(g20);
  expect(g100, 'LED2 at 14.8 mA ≈ 3.5 × 14.84 / 15').toBeCloseTo(3.5 * 14.84 / 15, 1);
  expect(g50, 'LED2 at 3.47 mA ≈ 3.5 × 3.47 / 15').toBeCloseTo(3.5 * 3.4717 / 15, 1);
  expect(g20, 'LED2 off: the dark glow, 0.45').toBeCloseTo(0.45, 2);
  expect(await glow(page, 'LED1'), 'LED1 is unchanged by the pot').toBeCloseTo(one, 3);
  expect(errors).toEqual([]);
});

// ── Save and load keep legs, values and the knob ──────────────────────────

test('the downloaded .sparky keeps RV1\'s legs, 1 kΩ and position 30; loading it back gives the same pot', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('potentiometer', [hole('e30'), hole('f30'), hole('g30')], { resistance: 1000 });   // facing down
  });
  expect(await potOf(page), 'App.placePart placed a potentiometer').toBeTruthy();
  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'potentiometer'), { position: 30 }); });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => App.saveCircuit()),
  ]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const rv = file.components.find(c => c.label === 'RV1');
  expect(rv, 'RV1 is in the file').toBeTruthy();
  expect(rv.type).toBe('potentiometer');
  expect(rv.values.resistance).toBe(1000);
  expect(rv.controls, 'the saved position is in the file').toEqual({ position: 30 });
  expect(rv.holeRefs).toEqual([{ pin: '1', col: 29, row: 'e' }, { pin: 'wiper', col: 29, row: 'f' }, { pin: '3', col: 29, row: 'g' }]);

  await page.evaluate(() => { App.setControls(App.state.components.find(c => c.type === 'potentiometer'), { position: 90 }); });
  await page.evaluate(f => App.loadCircuitData(f), file);
  expect(await potOf(page)).toEqual({ label: 'RV1', values: { resistance: 1000 }, controls: { position: 30 },
                                     legs: [['1', 'e30'], ['wiper', 'f30'], ['3', 'g30']] });
  expect(errors).toEqual([]);
});
