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
//   Smoke.puffsStarted() how many puffs have started since the page loaded
//                        (only ever counts up). Puffs fade in 1.5 s, which a
//                        loaded machine can outlast between samples, so "did
//                        it puff" is the change in this count around a solve,
//                        never activePuffs() at a sampled moment.
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

  const started = () => page.evaluate(() => (window.Smoke && window.Smoke.puffsStarted ? window.Smoke.puffsStarted() : null));
  const before = await started();
  expect(before, 'Smoke.puffsStarted() counts the puffs started').not.toBeNull();

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__over.length), { message: 'the solver calls the resistors over' }).toBe(3);
  const over = await page.evaluate(() => window.__over);
  expect(await scorched(page), 'every over part is scorched').toEqual(over);
  expect(await started() - before, 'going over puffs once per over part').toBe(over.length);

  // Re-solve (as a click on a part or an edit does) more times than one
  // puff per over part per solve would fit under the cap. Still over, so no
  // new puffs; puffs alive never pass the cap at any sample.
  const afterRun = await started();
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
    return { most, max, solves };
  });
  expect(await started() - afterRun, `${peak.solves} more solves with the same parts still over start no new puffs`).toBe(0);
  expect(peak.most, `puffs alive at once (${peak.most}) stay within MAX_PUFFS (${peak.max})`).toBeLessThanOrEqual(peak.max);

  // A later solve says R2 is fine (1 kΩ: 0.081 W): R2 clears, the others stay, still running.
  await page.evaluate(() => {
    App.setValues(App.state.components.find(c => c.label === 'R2'), { resistance: 1000 });
  });
  expect(await page.evaluate(() => App.simRunning), 'still simulating, no Stop').toBe(true);
  await expect.poll(() => page.evaluate(() => window.__over)).toEqual(over.filter(l => l !== 'R2'));
  expect(await scorched(page), 'R2 is fine now; the parts still over stay scorched').toEqual(over.filter(l => l !== 'R2'));
  expect(await started() - afterRun, 'a part going fine starts no puff').toBe(0);

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

// ── A time run fires plugged:sim every frame (#103 review, fixed with #104) ──
// While time runs, plugged:sim fires once per animation frame. A part that is
// over must puff once, when it first goes over (its scorch starts), not on
// every frame: one puff per frame would hit MAX_PUFFS at once, end each
// puff about 130 ms in, and churn sprite materials. It puffs again only
// after a solve found it fine and a later one finds it over again. Checked
// on Smoke.puffsStarted() deltas, so a slow machine reads the same.
//
// Board: 9 V; R1 1 kΩ a10–a14 → C1, the real 1000 µF capacitor (#104),
// + b14, − b17 → − (an RC, so the time run keeps going); R2 100 Ω a30–a34
// straight across 9 V (0.81 W, over ¼ W) every frame.

test('time run: an over part puffs once when it first goes over, not on every frame, and again only after it was fine', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: 'ok', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  const started = () => page.evaluate(() => (window.Smoke && window.Smoke.puffsStarted ? window.Smoke.puffsStarted() : null));
  const before = await started();
  expect(before, 'Smoke.puffsStarted() counts the puffs started').not.toBeNull();

  await page.evaluate(EDIT_HELPERS);
  await page.evaluate(() => {
    const E = window.__edit;
    App.placePart('battery', { x: 13, z: 0 });
    E.wireBat(0, 'tp_2');
    E.wireBat(1, 'tn_18');
    App.placePart('resistor', [E.hole('a10'), E.hole('a14')], { resistance: 1000 });
    App.placePart('capacitor', [E.hole('b14'), E.hole('b17')]);   // pins [plus, minus]
    E.wire('tp_10', 'c10');
    E.wire('c17', 'tn_17');
    App.placePart('resistor', [E.hole('a30'), E.hole('a34')], { resistance: 100 });
    E.wire('tp_30', 'c30');
    E.wire('c34', 'tn_34');
    // After each solve (tools/smoke.js's handler has run): is R2 over, the
    // puffs started so far, and the puffs alive now.
    window.__frames = [];
    document.addEventListener('plugged:sim', e => {
      const r = e.detail && e.detail.readings;
      const p = r && r.part('R2');
      window.__frames.push({ over: !!(p && p.over), started: window.Smoke.puffsStarted(), alive: window.Smoke.activePuffs() });
    });
  });
  expect(await page.evaluate(() => App.state.components.some(c => c.type === 'capacitor')), 'the capacitor is on the board').toBe(true);

  const frameCount = () => page.evaluate(() => window.__frames.length);
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => window.__frames.filter(f => f.over).length),
    { message: 'the time run fires plugged:sim frame after frame with R2 over', timeout: 10_000 }).toBeGreaterThanOrEqual(12);
  const frames = await page.evaluate(() => window.__frames);
  const max = await page.evaluate(() => window.Smoke.MAX_PUFFS);
  expect(frames.every(f => f.over), 'R2 is over on every frame').toBe(true);
  expect(frames[0].started - before, 'R2 puffs when it first goes over').toBe(1);
  expect(frames[frames.length - 1].started - before,
    `one over part, one puff: ${frames[frames.length - 1].started - before} puffs started over ${frames.length} frames`).toBe(1);
  expect(Math.max(...frames.map(f => f.alive)), `puffs alive never pass MAX_PUFFS (${max})`).toBeLessThanOrEqual(max);
  expect(await scorched(page), 'R2 is scorched the whole time').toEqual(['R2']);

  // Fine (1 kΩ: 81 mW): the scorch clears, no puff. Over again (100 Ω): one
  // new puff, and still only one as frames go by.
  const s1 = await started();
  await page.evaluate(() => App.setValues(App.state.components.find(c => c.label === 'R2'), { resistance: 1000 }));
  await expect.poll(() => scorched(page), { message: 'R2 is fine at 1 kΩ, the scorch clears' }).toEqual([]);
  expect(await started() - s1, 'going fine starts no puff').toBe(0);
  await page.evaluate(() => App.setValues(App.state.components.find(c => c.label === 'R2'), { resistance: 100 }));
  await expect.poll(() => scorched(page), { message: 'R2 is over again at 100 Ω' }).toEqual(['R2']);
  expect(await started() - s1, 'going over again puffs once more').toBe(1);
  const mark = await frameCount();
  await expect.poll(frameCount, { message: 'more frames go by with R2 still over', timeout: 10_000 }).toBeGreaterThanOrEqual(mark + 10);
  expect(await started() - s1, 'and only once, frame after frame').toBe(1);
  const tail = (await page.evaluate(() => window.__frames)).slice(mark);
  expect(tail.every(f => f.over && f.alive <= max), 'still over, puffs alive within the cap').toBe(true);

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => scorched(page), { message: 'Stop clears every scorch' }).toEqual([]);
  expect(errors).toEqual([]);
});
