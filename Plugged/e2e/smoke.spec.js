// Overload smoke, issue #99. On every plugged:sim, each part whose
// readings.part(label).over is true puffs smoke (a few sprites rising and
// fading, about 1.5 s) and its body goes dark (scorched). It stays scorched
// while still over, clears when a later solve says it is fine, and clears on
// Stop. Puffs are capped so many overloads stay smooth. Visual only: the
// simulator is unchanged.
//
// The seam these tests read (tools/smoke.js sets window.Smoke):
//   Smoke.scorched()     labels of the parts scorched right now (any order)
//   Smoke.activePuffs()  how many puffs are alive right now (0 once faded)
//   Smoke.MAX_PUFFS      the cap on activePuffs()
// "Darker" is also read off the part itself: the mean luminance of the
// material colours of the meshes in its model (comp.group), checked once the
// puffs have faded so no smoke is counted.
//
// The main flow goes through the real UI: the "Build an LED circuit" button
// with /api/ask stubbed to an LED straight across 9 V, Accept, then Run. The
// fix (a 470 Ω resistor in series) is made with the App calls the mouse
// handlers make, as sim-events.spec.js does. No real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

// The AI's LED build without its resistor: LED1 anode c6 / cathode c8,
// tp_3 → a6 straight onto the anode, a8 → tn_8. 70 A through the LED's
// 0.1 Ω model, over its 20 mA (test/smoke.test.js).
const SHORTED_LED = {
  reply: 'Built an LED.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a6', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
};

const simLines = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
// null / undefined until tools/smoke.js sets window.Smoke, so a missing
// module fails on the assertion, not a TypeError.
const scorched = page => page.evaluate(() => (window.Smoke ? window.Smoke.scorched().slice().sort() : null));
const puffs    = page => page.evaluate(() => (window.Smoke ? window.Smoke.activePuffs() : null));

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Mean luminance of the material colours of every mesh in the part's model.
const luminance = (page, label) => page.evaluate(label => {
  const c = App.state.components.find(x => x.label === label);
  let sum = 0, n = 0;
  c.group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (!m.color) return;
      sum += 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
      n++;
    });
  });
  return n ? sum / n : null;
}, label);

// Board edits through the App calls the mouse handlers make (sim-events.spec.js).
const EDIT_HELPERS = () => {
  const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
  const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
  window.__edit = {
    hole,
    wire: (a, b) => { App.state.wireStart = end(a); App.finishWire(end(b)); },
    wireBat: (k, b) => {
      const bat = App.state.components.find(c => c.type === 'battery');
      const pm  = bat.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(b));
    },
    findWire: (a, b) => App.state.wires.find(w => {
      const ends = [w.startHole, w.endHole].map(h => (h ? App.holeName(h) : null));
      return ends.includes(a) && ends.includes(b);
    }),
  };
};

test('an LED straight across 9 V smokes and scorches on Run, stays scorched after the puff, Stop clears it; with 470 Ω in series it does not', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: SHORTED_LED }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(() => App.state.components.some(c => c.label === 'LED1') && App.state.wires.length === 4);
  const plain = await luminance(page, 'LED1');
  // Puffs alive right after each solve. tools/smoke.js loads before this
  // listener, so its own plugged:sim handler has already run.
  await page.evaluate(() => {
    window.__puffsAtSim = [];
    document.addEventListener('plugged:sim', () => window.__puffsAtSim.push(window.Smoke ? window.Smoke.activePuffs() : null));
  });

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simLines(page), { message: 'the solver calls the LED a short' }).toMatch(/short circuit/i);
  expect(await scorched(page), 'LED1 is over its rating, so it is scorched').toEqual(['LED1']);
  const alive = await page.evaluate(() => window.__puffsAtSim[0]);
  expect(alive, 'a puff of smoke is rising over LED1').toBeGreaterThan(0);
  expect(alive).toBeLessThanOrEqual(await page.evaluate(() => window.Smoke.MAX_PUFFS));

  // The puff fades in about 1.5 s; the scorch stays while the part is over.
  await expect.poll(() => puffs(page), { message: 'the puff fades', timeout: 5000 }).toBe(0);
  expect(await scorched(page), 'still scorched after the puff, the LED is still over').toEqual(['LED1']);
  const dark = await luminance(page, 'LED1');
  expect(dark, `LED1's body goes dark: luminance ${dark} vs ${plain} before Run`).toBeLessThan(plain * 0.8);

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => scorched(page), { message: 'Stop clears the scorch' }).toEqual([]);
  expect(await puffs(page), 'no smoke after Stop').toBe(0);
  const back = await luminance(page, 'LED1');
  expect(Math.abs(back - plain), `LED1's colours are restored after Stop (${back} vs ${plain})`).toBeLessThan(0.01);

  // The fix: R1 470 Ω b2–b6 in series, tp_3 → a2 instead of straight onto the anode.
  await page.evaluate(EDIT_HELPERS);
  await page.evaluate(() => {
    const E = window.__edit;
    App.deleteWire(E.findWire('tp_3', 'a6'));
    App.placePart('resistor', [E.hole('b2'), E.hole('b6')], { resistance: 470 });
    E.wire('tp_3', 'a2');
  });
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simLines(page), { message: 'the fixed circuit lights the LED' }).toContain('LED ON  (14.9 mA)');
  expect(await scorched(page), 'nothing is over with 470 Ω in series').toEqual([]);
  expect(await puffs(page), 'no smoke with 470 Ω in series').toBe(0);
  const lit = await luminance(page, 'LED1');
  expect(lit, `LED1 is not dark (${lit} vs ${plain} before)`).toBeGreaterThanOrEqual(plain * 0.8);

  expect(errors).toEqual([]);
});

test('several overloads while running: each over part scorches, puffs never pass the cap, and a later fine solve clears a part without Stop', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

  // Three 100 Ω resistors each straight across 9 V: 0.81 W each, over ¼ W.
  // R1 a10–a14, R2 a20–a24, R3 a30–a34; tp → c<left>, c<right> → tn.
  await page.evaluate(EDIT_HELPERS);
  await page.evaluate(() => {
    const E = window.__edit;
    App.placePart('battery', { x: 13, z: 0 });
    E.wireBat(0, 'tp_2');
    E.wireBat(1, 'tn_2');
    for (const c of [10, 20, 30]) {
      App.placePart('resistor', [E.hole('a' + c), E.hole('a' + (c + 4))], { resistance: 100 });
      E.wire('tp_' + c, 'c' + c);
      E.wire('c' + (c + 4), 'tn_' + (c + 4));
    }
    // Every part the solver calls over, from each solve's own readings.
    window.__over = [];
    document.addEventListener('plugged:sim', e => {
      const r = e.detail && e.detail.readings;
      window.__over = App.state.components.map(c => c.label).filter(l => r && r.part(l) && r.part(l).over).sort();
    });
  });

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__over.length), { message: 'the solver calls the resistors over' }).toBe(3);
  const over = await page.evaluate(() => window.__over);
  expect(await scorched(page), 'every over part is scorched').toEqual(over);

  // Re-solve (as a click on a part or an edit does) until the uncapped puff
  // count, one per over part per solve, would be past the cap; sample after each.
  const peak = await page.evaluate(async () => {
    const max = window.Smoke.MAX_PUFFS;
    const solves = Math.ceil((max + 1) / window.__over.length) + 1;
    let most = window.Smoke.activePuffs();
    for (let i = 0; i < solves; i++) {
      App.runSimulation();
      most = Math.max(most, window.Smoke.activePuffs());
      await new Promise(r => requestAnimationFrame(r));
      most = Math.max(most, window.Smoke.activePuffs());
    }
    for (let f = 0; f < 30; f++) {
      await new Promise(r => requestAnimationFrame(r));
      most = Math.max(most, window.Smoke.activePuffs());
    }
    return { most, max };
  });
  expect(peak.most, 'smoke is showing').toBeGreaterThan(0);
  expect(peak.most, `puffs alive at once (${peak.most}) stay within MAX_PUFFS (${peak.max})`).toBeLessThanOrEqual(peak.max);

  // A later solve says R2 is fine (1 kΩ: 0.081 W): R2 clears, the others stay, still running.
  await page.evaluate(() => {
    App.setValues(App.state.components.find(c => c.label === 'R2'), { resistance: 1000 });
  });
  expect(await page.evaluate(() => App.simRunning), 'still simulating, no Stop').toBe(true);
  await expect.poll(() => page.evaluate(() => window.__over)).toEqual(over.filter(l => l !== 'R2'));
  expect(await scorched(page), 'R2 is fine now; the parts still over stay scorched').toEqual(over.filter(l => l !== 'R2'));

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => scorched(page), { message: 'Stop clears every scorch' }).toEqual([]);
  await expect.poll(() => puffs(page), { message: 'no smoke after Stop', timeout: 5000 }).toBe(0);

  expect(errors).toEqual([]);
});

// ── Scorch and selection together (reviewer fix) ─────────────────
// Selecting a part clones each mesh's material and sets its emissive to the
// selection blue (App.selectItem); deselecting puts the emissive back. A
// scorch taken while selected, or a selection made while scorched, must not
// leave the blue (or the dark) behind once both are gone.

const SELECTION_BLUE = 0x1a5a99;

// Each LED1 mesh's material colour and emissive, in traverse order.
const ledLook = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.label === 'LED1');
  const out = [];
  c.group.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    out.push({ color: o.material.color.getHex(), emissive: o.material.emissive ? o.material.emissive.getHex() : null });
  });
  return out;
});
const selectedLabel = page => page.evaluate(() => (App.state.selected ? App.state.selected.item.label : null));

// The top centre of a part's model, as a person clicks it (inspector.spec.js).
async function clickPart(page, label) {
  const at = await page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, label);
  await page.mouse.click(at.x, at.y);
}

// An empty hole on screen: a click there deselects (inspector.spec.js).
// Panels (results, mistakes) sit over the canvas, so check the hole is clear.
async function clickHole(page, where) {
  const at = await page.evaluate(where => {
    const { col, row } = App.parseHole(where);
    const p = App.state.breadboard.getHole(col, row).world.clone();
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
  const onCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === App.renderer.domElement, at);
  expect(onCanvas, `hole ${where} is on screen and not under a panel`).toBe(true);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
}

// Empty in both builds here (LED1 c6–c8, R1 b2–b6, wires at columns 2, 3, 6, 8).
const EMPTY = 'e11';

test('selected while it scorches, or while scorched: once deselected and cleared, LED1 has its own colours and no selection blue', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: SHORTED_LED }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForFunction(() => App.state.components.some(c => c.label === 'LED1') && App.state.wires.length === 4);
  const before = await ledLook(page);
  expect(before.some(m => m.emissive === SELECTION_BLUE), 'not selected yet').toBe(false);

  // 1. Selected, then Run scorches it, then deselect, then Stop.
  await clickPart(page, 'LED1');
  expect(await selectedLabel(page), 'the click selected LED1').toBe('LED1');
  // The material each mesh has going into Run (the selection's own copy).
  await page.evaluate(() => {
    const c = App.state.components.find(x => x.label === 'LED1');
    window.__mats = [];
    c.group.traverse(o => { if (o.isMesh && o.material && o.material.color) window.__mats.push([o, o.material]); });
  });
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => scorched(page), { message: 'LED1 scorches while selected' }).toEqual(['LED1']);
  await clickHole(page, EMPTY);
  expect(await selectedLabel(page), 'the click on an empty hole deselected LED1').toBe(null);
  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => scorched(page)).toEqual([]);

  const afterStop = await ledLook(page);
  expect(afterStop.filter(m => m.emissive === SELECTION_BLUE), 'no LED1 mesh keeps the selection blue after Stop').toEqual([]);
  expect(afterStop, 'every LED1 mesh has the colour and emissive it had before it was selected').toEqual(before);
  expect(await page.evaluate(() => window.__mats.filter(([o, m]) => o.material !== m).length),
    'after Stop each LED1 mesh has the material it had going into Run (no scorch clone left)').toBe(0);

  // 2. Scorched, then selected, then the fix (470 Ω in series) clears the scorch, then deselect.
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => scorched(page)).toEqual(['LED1']);
  await clickPart(page, 'LED1');
  expect(await selectedLabel(page), 'the click selected the scorched LED1').toBe('LED1');
  // While running, each edit re-solves except finishWire, so the short wire
  // goes last: its delete is the solve that finds the fixed circuit.
  await page.evaluate(EDIT_HELPERS);
  await page.evaluate(() => {
    const E = window.__edit;
    App.placePart('resistor', [E.hole('b2'), E.hole('b6')], { resistance: 470 });
    E.wire('tp_3', 'a2');
    App.deleteWire(E.findWire('tp_3', 'a6'));
  });
  await expect.poll(() => simLines(page), { message: 'the fixed circuit lights the LED' }).toContain('LED ON  (14.9 mA)');
  expect(await scorched(page), 'the fix clears the scorch while still running').toEqual([]);
  await clickHole(page, EMPTY);
  expect(await selectedLabel(page), 'deselected').toBe(null);

  const fixed = await ledLook(page);
  expect(fixed.filter(m => m.emissive === SELECTION_BLUE), 'no LED1 mesh keeps the selection blue once deselected').toEqual([]);
  // The LED's view changes only its glow's intensity, never these hexes, so
  // lit or not they match the look from before anything was selected.
  expect(fixed, 'LED1 has its own colour and emissive again, not the scorched or selected ones').toEqual(before);

  expect(errors).toEqual([]);
});
