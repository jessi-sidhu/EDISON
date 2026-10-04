// The bench supply's two channels in the browser (issue #124): four posts,
// the front-panel mode button that flips SERIES / INDEP while editing and
// while simulating (one undo step), and an LED on CH2 alone lit from CH2's
// own ground. The circuit numbers are test/bench-two-channel.test.js; this
// spec is what needs a real page: the 3D click on the button, what it
// redraws, undo, and the path from that click to the simulator.
// /api/ask is stubbed; no AI is called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - The supply has 4 pin meshes in pin order pos, com, neg, com2. Left to
//   right on the case the posts read CH1 + (pos), CH1 − (com), CH2 + (com2),
//   CH2 − (neg).
// - Two LIMIT lights: meshes in the supply's group whose names start with
//   'limit-light' (the first is still 'limit-light', which
//   e2e/bench-supply.spec.js finds by name).
// - The mode button is a mesh (or group) in the supply's group named
//   'mode-button'. In select mode a click on it flips controls.mode
//   ('series' ⇄ 'independent'), editing or simulating; a click anywhere
//   else on the supply selects it as before. The flip is one undo step and
//   redraws the supply (its SERIES / INDEP label).
// - The inspector has a row for the mode (data-key="mode").
// - While simulating, the supply's headline in #sim-results names the mode
//   (SERIES / INDEP…).
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  // Keep the latest solve, as the Phase 3 tools hear it.
  await page.evaluate(() => document.addEventListener('plugged:sim', e => { window.__lastSim = e.detail.result; }));
}

// Place the supply beside the board with these values.
const placeSupply = (page, values) => page.evaluate(v => {
  App.placePart('bench_supply', App.batterySpot(), v);
}, values || {});

const supplyState = page => page.evaluate(() => {
  const c = App.state.components.find(p => p.type === 'bench_supply');
  return c ? { mode: (c.controls || {}).mode, count: App.state.components.length } : null;
});
const mode = async page => (await supplyState(page) || {}).mode;

// The screen point of the named object in PS1's group, and what a click there
// hits first: the names of the first hit mesh and its ancestors.
function aim(page, name) {
  return page.evaluate(name => {
    const c = App.state.components.find(p => p.label === 'PS1');
    const o = c && c.group && c.group.getObjectByName(name);
    if (!o) return { missing: true };
    const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    App.camera.updateMatrixWorld();
    const ndc = p.clone().project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ndc.x, y: ndc.y }, App.camera);
    const hit = ray.intersectObjects(App.scene.children, true).find(h => h.object.visible && h.object.isMesh);
    const chain = [];
    for (let x = hit && hit.object; x; x = x.parent) chain.push(x.name || '');
    return { x: r.left + (ndc.x + 1) / 2 * r.width, y: r.top + (1 - ndc.y) / 2 * r.height, hits: chain };
  }, name);
}

async function clickOn(page, name) {
  const at = await aim(page, name);
  expect(at.missing, `PS1's group has an object named '${name}'`).toBeUndefined();
  expect(at.hits, `a click at '${name}' lands on it first (nothing in front)`).toContain(name);
  await page.mouse.click(at.x, at.y);
}

// What the supply looks like on screen, with nothing selected or hovered.
async function supplyPixels(page) {
  await page.evaluate(() => App.deselect());
  await page.mouse.move(2, 2);
  const clip = await page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'PS1');
    const box = new THREE.Box3().setFromObject(c.group);
    const r = App.renderer.domElement.getBoundingClientRect();
    App.camera.updateMatrixWorld();
    const xs = [], ys = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(App.camera);
      xs.push(r.left + (p.x + 1) / 2 * r.width);
      ys.push(r.top + (1 - p.y) / 2 * r.height);
    }
    const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  });
  await page.waitForTimeout(250);   // render-on-demand: let the next frame draw
  return (await page.screenshot({ clip })).toString('base64');
}

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

// ── Editing: four posts, the mode button, undo ────────────────────────────

test('editing: the supply has 4 posts (CH1 +, CH1 −, CH2 +, CH2 −) and 2 LIMIT lights; the mode button flips SERIES → INDEP and redraws it, a click elsewhere selects it, undo flips it back, and the selected supply\'s inspector follows the button', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placeSupply(page);

  const posts = await page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'PS1');
    const lights = [];
    c.group.traverse(o => { if (/^limit-light/.test(o.name)) lights.push(o.name); });
    return { pins: c.pinMeshes.map(pm => pm.userData.world.x), lights };
  });
  expect(posts.pins, 'four pin meshes: pos, com, neg, com2').toHaveLength(4);
  const [pos, com, neg, com2] = posts.pins;
  expect([pos < com, com < com2, com2 < neg], 'left to right: CH1 + (pos), CH1 − (com), CH2 + (com2), CH2 − (neg)')
    .toEqual([true, true, true]);
  expect(posts.lights, 'a LIMIT light per channel').toHaveLength(2);

  // A click on the case (its readout), not the button: selects PS1, no flip.
  await page.keyboard.press('Escape');
  await clickOn(page, 'readout');
  await expect.poll(() => page.evaluate(() => App.state.selected && App.state.selected.item.label)).toBe('PS1');
  expect(await mode(page), 'a click off the button leaves the mode alone').not.toBe('independent');
  await expect(page.locator('#inspector .inspector-row[data-key="mode"]'), 'the inspector shows the mode').toHaveCount(1);

  const seriesLook = await supplyPixels(page);
  await clickOn(page, 'mode-button');
  await expect.poll(() => mode(page), { message: 'a click on the mode button while editing flips it' }).toBe('independent');
  expect((await supplyState(page)).count).toBe(1);
  await expect.poll(() => supplyPixels(page), { message: 'the supply redraws (its SERIES / INDEP label)' }).not.toBe(seriesLook);

  // One click, one undo step: undo flips the mode back and keeps the supply.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => mode(page), { message: 'undo puts it back to series' }).toBe('series');
  expect((await supplyState(page)).count, 'the undo took back only the flip, not the placement').toBe(1);

  // With PS1 selected (its inspector open), a click on the mode button while
  // editing must keep the inspector's mode dropdown in step with the supply.
  const modeSelect = page.locator('#inspector .inspector-row[data-key="mode"] select');
  await clickOn(page, 'readout');
  await expect.poll(() => page.evaluate(() => App.state.selected && App.state.selected.item.label)).toBe('PS1');
  await expect(modeSelect).toHaveValue('series');
  await clickOn(page, 'mode-button');
  await expect.poll(() => mode(page), { message: 'the click on the button flips the selected supply' }).toBe('independent');
  await expect(modeSelect, 'the inspector\'s mode dropdown follows the click while editing').toHaveValue('independent');
  await clickOn(page, 'mode-button');
  await expect.poll(() => mode(page)).toBe('series');
  await expect(modeSelect, 'and follows it back').toHaveValue('series');
  expect(errors).toEqual([]);
});

// ── Simulating: an LED on CH2 alone, flipped live ─────────────────────────
// voltage 12, voltage2 5; CH2+ (com2) → bp, CH2− (neg) → bn; 1 kΩ g20–g24,
// red LED anode h24 / cathode h26; bp_20 → j20, j26 → bn_26.
//   series:      com2 = COM, neg = −12 V: (12 − 2) / 1000.1 = 10.0 mA
//   independent: CH2 = 5 V from neg:      (5 − 2) / 1000.1  =  3.0 mA, j26 at 0 V

test('simulating: an LED + 1 kΩ on CH2 alone lights at 10.0 mA in series; a click on the mode button flips to INDEP and it lights at 3.0 mA from CH2\'s own ground', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await placeSupply(page, { voltage: 12, voltage2: 5 });
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('g20'), hole('g24')], { resistance: 1000 });
    App.placePart('led', [hole('h26'), hole('h24')], { color: 'red' });   // cathode h26, anode h24
  });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => App.state.components.find(c => c.label === 'PS1').pinMeshes.length),
    'PS1 has a CH2 + post (PS1.3, com2) to wire').toBe(4);
  await wire(page, 'PS1.3', 'bp_63');   // com2, CH2 +
  await wire(page, 'PS1.2', 'bn_63');   // neg, CH2 −
  await wire(page, 'bp_20', 'j20');
  await wire(page, 'j26', 'bn_26');
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page)).toContain('LED ON  (10.0 mA)');
  expect(await simText(page), 'the headline names the mode').toMatch(/series/i);

  await clickOn(page, 'mode-button');
  await expect.poll(() => mode(page), { message: 'a click on the mode button while simulating flips it' }).toBe('independent');
  await expect.poll(() => simText(page), { message: 'the click re-solves: CH2 alone at 5 V' }).toContain('LED ON  (3.0 mA)');
  expect(await simText(page)).toMatch(/indep/i);
  const reading = await page.evaluate(() => {
    const r = window.__lastSim;
    const at = s => { const { col, row } = App.parseHole(s); return r.voltageAt({ col, row }); };
    return { on: r.parts.LED1.m.on, top: at('j20'), cathode: at('j26') };
  });
  expect(reading.on).toBe(true);
  expect(reading.cathode, 'the LED\'s cathode sits on CH2\'s own ground (neg), 0 V').toBeCloseTo(0, 6);
  expect(reading.top, 'the resistor\'s top is CH2\'s 5 V').toBeCloseTo(5, 6);
  expect(errors).toEqual([]);
});
