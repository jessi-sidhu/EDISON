// Every registered part, placed the way a person does it (testing contract,
// item 8), issue #23: pick it in the sidebar, hover the board to see its
// ghost, click to place it, run the simulation, and no console errors.
// Plus: the resistor (the first registry part) looks the same as before, its
// ghost is the same model in ghost materials, and the viewer page draws a
// saved resistor through the registry.
//
// The part list comes from the Node registry (require('circuit3d/js/parts')),
// so each part gets its own test; the page must load the same list. /api/ask
// is stubbed; no AI is called. Guest only.
const { test, expect } = require('@playwright/test');
const Parts = require('../circuit3d/js/parts');

// The resistor (#23), the LED (#25), the battery, buzzer and button (#26),
// the potentiometer (#31), the light sensor (#40), the thermistor (#41),
// the diode (#33), the toggle switch (#32) and the slide switch (#39) are listed even before their files exist, so this spec fails (rather than
// running nothing) until each is registered.
const TYPES = [...new Set(['resistor', 'led', 'battery', 'buzzer', 'button', 'potentiometer', 'ldr', 'thermistor', 'diode', 'zener', 'toggle_switch', 'slide_switch', 'bulb', 'motor', 'current_source', 'rgb_led', ...Parts.all().map(d => d.type)])];

// Resistor colours, as the model has always drawn them.
const BODY = 0xd4a96a, LEAD = 0xc0c0c0, GHOST_LEAD = 0xcccccc;
const BLACK = 0x1a1a1a, BROWN = 0x7b3f00, RED = 0xd62828, YELLOW = 0xfcbf49, VIOLET = 0x7c3aed, GOLD = 0xd4af37;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openEditor(page) {
  await page.addInitScript(installHelpers);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  // Everything in the scene before a part is picked; the ghost is added after.
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

// Where a board hole ("c30") or a world point is on screen, in page pixels.
function screenPoint(page, where) {
  return page.evaluate(where => {
    let p;
    if (typeof where === 'string') {
      const { col, row } = App.parseHole(where);
      const h = App.state.breadboard.getHole(col, row);
      p = h.world ? h.world.clone() : new THREE.Vector3(h.x, 0, h.z);
    } else {
      p = new THREE.Vector3(where.x, 0, where.z);
    }
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, where);
}

// A mesh summary of a group: count, colours, bounding box, and the band
// colours (everything but body and leads) in order along the part. Installed
// in the page as window.__partSummary before its scripts run.
function installHelpers() {
  window.__partSummary = (g, skip) => {
    const meshes = [];
    g.updateMatrixWorld(true);
    g.traverse(o => { if (o.isMesh) meshes.push(o); });
    const box = new THREE.Box3().setFromObject(g);
    const horiz = box.max.x - box.min.x >= box.max.z - box.min.z;
    const at = m => { const v = new THREE.Vector3(); m.getWorldPosition(v); return horiz ? v.x : v.z; };
    const bands = meshes.filter(m => !skip.includes(m.material.color.getHex()))
      .sort((a, b) => at(a) - at(b)).map(m => m.material.color.getHex());
    return {
      meshes: meshes.length,
      colours: meshes.map(m => m.material.color.getHex()),
      transparent: meshes.every(m => m.material.transparent && m.material.opacity < 1),
      bands,
      min: box.min.toArray(), max: box.max.toArray(),
    };
  };
}
const SKIP = [BODY, LEAD, GHOST_LEAD];

// The ghost: a visible object added after the page loaded that isn't a
// placed part's group and is drawn entirely in see-through materials.
function ghost(page) {
  return page.evaluate(skip => {
    const owned = new Set(App.state.components.map(c => c.group).filter(Boolean));
    for (const o of App.scene.children) {
      if (window.__sceneBefore.has(o.uuid) || !o.visible || owned.has(o)) continue;
      const s = window.__partSummary(o, skip);
      if (s.meshes && s.transparent) return s;
    }
    return null;
  }, SKIP);
}

function lastPart(page) {
  return page.evaluate(skip => {
    const c = App.state.components[App.state.components.length - 1];
    if (!c) return null;
    return { type: c.type, label: c.label, values: c.values, holeRefs: c.holeRefs,
             model: c.group ? window.__partSummary(c.group, skip) : null };
  }, SKIP);
}

test('the editor loads the same parts as the registry in Node, the resistor among them', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const types = await page.evaluate(() => (window.Parts ? Parts.all().map(d => d.type) : null));
  expect(types, 'window.Parts in the editor').not.toBeNull();
  expect(types).toContain('resistor');
  expect(types).toEqual(Parts.all().map(d => d.type));
  expect(errors).toEqual([]);
});

for (const type of TYPES) {
  test(`${type}: pick it in the sidebar, see its ghost, place it, simulate, no console errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await openEditor(page);
    const def = await page.evaluate(t => {
      const d = window.Parts && Parts.get(t);
      return d && { kind: d.place.kind, span: d.place.span ? d.place.span.default : null, straddle: !!d.place.straddle };
    }, type);
    expect(def, `window.Parts.get('${type}') in the editor`).toBeTruthy();

    await page.locator(`#sidebar .comp-item[data-type="${type}"]`).click();
    // A chip that straddles the gap (#43) only fits with its anchor in row f.
    const at = def.kind === 'offboard'
      ? await screenPoint(page, await page.evaluate(() => App.batterySpot()))
      : await screenPoint(page, def.straddle ? 'f30' : 'c30');
    await page.mouse.move(at.x - 3, at.y);
    await page.mouse.move(at.x, at.y);

    const g = await ghost(page);
    expect(g, `a ghost ${type} on the board after hovering`).not.toBeNull();

    const before = await page.evaluate(() => App.state.components.length);
    await page.mouse.click(at.x, at.y);
    expect(await page.evaluate(() => App.state.components.length)).toBe(before + 1);
    const placed = await lastPart(page);
    expect(placed.type).toBe(type);

    if (def.kind === 'span') {
      // c30 is { col: 29, row: 'c' }; the default span runs along the row.
      expect(placed.holeRefs[0]).toMatchObject({ col: 29, row: 'c' });
      expect(placed.holeRefs[1]).toMatchObject({ col: 29 + def.span, row: 'c' });
      // The ghost stood where the part landed.
      for (const k of [0, 1, 2]) {
        expect(Math.abs(g.min[k] - placed.model.min[k]), `ghost min[${k}]`).toBeLessThan(0.1);
        expect(Math.abs(g.max[k] - placed.model.max[k]), `ghost max[${k}]`).toBeLessThan(0.1);
      }
    }

    await page.locator('#sim-run-btn').click();
    await expect(page.locator('#sim-results')).toBeVisible();
    await page.evaluate(() => App.stopSimulation());
    expect(errors).toEqual([]);
  });
}

// ── The resistor looks the same as before ───────────────────────────────
// Measured from the pre-registry model (components.js buildResistor): two
// upright leads, two lead stubs, a tan body and four bands; leads 0.72 high,
// body radius 0.10, bands 0.104.

async function placeResistorAt(page, a, b, values) {
  await page.evaluate(([a, b, values]) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole(a), hole(b)], values);
  }, [a, b, values]);
  return lastPart(page);
}

const holeX = (page, h) => page.evaluate(h => {
  const { col, row } = App.parseHole(h);
  const o = App.state.breadboard.getHole(col, row);
  return { x: o.x, z: o.z };
}, h);

test('a placed 470 Ω resistor: one tan carbon-film body, yellow-violet-brown-gold bands, two bent leads in the holes', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const r = await placeResistorAt(page, 'a10', 'a14');
  const [A, B] = [await holeX(page, 'a10'), await holeX(page, 'a14')];

  expect(r.values.resistance).toBe(470);
  expect(r.model.meshes).toBe(7);                                     // body, 4 bands, 2 leads
  expect(r.model.colours.filter(c => c === BODY)).toHaveLength(1);
  expect(r.model.colours.filter(c => c === LEAD)).toHaveLength(2);
  expect(r.model.bands).toEqual([YELLOW, VIOLET, BROWN, GOLD]);
  expect(r.model.max[1]).toBeCloseTo(0.463, 2);                      // axis height + end-cap radius + band
  expect(r.model.min[1]).toBeCloseTo(-0.05, 2);                       // the leads go down into the holes
  expect(r.model.min[0]).toBeCloseTo(Math.min(A.x, B.x) - 0.026, 2);  // leads stand in the holes
  expect(r.model.max[0]).toBeCloseTo(Math.max(A.x, B.x) + 0.026, 2);
  expect(r.model.max[2] - r.model.min[2]).toBeCloseTo(0.326, 2);     // the end caps' diameter
  expect(errors).toEqual([]);
});

test('a resistor keeps its value on the bands (1 kΩ brown-black-red) and draws vertically across the gap', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const k = await placeResistorAt(page, 'a20', 'a24', { resistance: 1000 });
  expect(k.values.resistance).toBe(1000);
  expect(k.model.bands).toEqual([BROWN, BLACK, RED, GOLD]);

  const v = await placeResistorAt(page, 'e40', 'f40');
  const [E, F] = [await holeX(page, 'e40'), await holeX(page, 'f40')];
  expect(v.model.meshes).toBe(7);
  expect(v.model.min[2]).toBeCloseTo(Math.min(E.z, F.z) - 0.026, 2);
  expect(v.model.max[2]).toBeCloseTo(Math.max(E.z, F.z) + 0.026, 2);
  expect(errors).toEqual([]);
});

test('the resistor ghost is the placed model in ghost materials: same meshes, same bands', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();
  const at = await screenPoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  const g = await ghost(page);
  expect(g, 'a resistor ghost after hovering c30').not.toBeNull();

  await page.mouse.click(at.x, at.y);
  const placed = await lastPart(page);
  expect(placed.type).toBe('resistor');
  expect(g.meshes, 'the ghost has the same meshes as the placed resistor').toBe(placed.model.meshes);
  expect(g.colours.filter(c => c === BODY)).toHaveLength(1);
  expect(g.bands).toEqual([YELLOW, VIOLET, BROWN, GOLD]);
  expect(g.bands).toEqual(placed.model.bands);
  expect(errors).toEqual([]);
});

// Review fix (#23): R rotates the hand-placement ghost to vertical, and the
// ghost must stand the way the placed resistor will (down the column, along z),
// not lie across the row.
test('rotated with R, the resistor ghost is vertical and matches the placed resistor', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.locator('#sidebar .comp-item[data-type="resistor"]').click();
  await page.keyboard.press('r');
  expect(await page.evaluate(() => App.state.placementRotation), 'R switches to vertical').toBe(1);

  const at = await screenPoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  const g = await ghost(page);
  expect(g, 'a rotated resistor ghost after hovering c30').not.toBeNull();
  const size = s => ({ x: s.max[0] - s.min[0], z: s.max[2] - s.min[2] });
  const gs = size(g);
  expect(gs.z, `ghost runs down the column: z extent ${gs.z.toFixed(3)} vs x extent ${gs.x.toFixed(3)}`)
    .toBeGreaterThan(gs.x * 2);

  await page.mouse.click(at.x, at.y);
  const placed = await lastPart(page);
  expect(placed.type).toBe('resistor');
  expect(placed.holeRefs[0]).toMatchObject({ col: 29, row: 'c' });
  expect(placed.holeRefs[1]).toMatchObject({ col: 29, row: 'g' });
  const ps = size(placed.model);
  expect(ps.z, `placed resistor runs down the column: z extent ${ps.z.toFixed(3)} vs x extent ${ps.x.toFixed(3)}`)
    .toBeGreaterThan(ps.x * 2);

  // The ghost stood where, and the way, the part landed.
  for (const k of [0, 1, 2]) {
    expect(Math.abs(g.min[k] - placed.model.min[k]), `ghost min[${k}]`).toBeLessThan(0.1);
    expect(Math.abs(g.max[k] - placed.model.max[k]), `ghost max[${k}]`).toBeLessThan(0.1);
  }
  expect(errors).toEqual([]);
});

// ── The viewer page ─────────────────────────────────────────────────────
// viewer.html draws ../demo.sparky; serve a saved circuit in its place.

const h = (col, row) => ({ col, row });
const VIEWER_CIRCUIT = {
  version: 1, name: 'Viewer resistors',
  components: [
    { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: -20, z: 0 } },
    { type: 'resistor', label: 'R1', values: { resistance: 470 },  holeRefs: [h(1, 'b'),  h(5, 'b')],  position: { x: 0, z: 0 } },
    { type: 'resistor', label: 'R2', values: { resistance: 1000 }, holeRefs: [h(10, 'b'), h(14, 'b')], position: { x: 0, z: 0 } },
    // Saved without values: drawn with the registry default, 470 Ω.
    { type: 'resistor', label: 'R3', holeRefs: [h(20, 'b'), h(24, 'b')], position: { x: 0, z: 0 } },
  ],
  wires: [],
};

test('viewer.html opens a saved circuit with resistors: registry loaded, each drawn with its bands, no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(installHelpers);
  await page.route('**/demo.sparky', route => route.fulfill({ json: VIEWER_CIRCUIT }));
  await page.goto('/circuit3d/viewer.html');
  await page.waitForFunction(() => window.App && App.scene);

  // Each resistor group, left to right, as its band colours.
  const resistors = () => page.evaluate(([skip, body]) => {
    return App.scene.children
      .filter(o => { let b = false; o.traverse(m => { if (m.isMesh && m.material.color.getHex() === body) b = true; }); return b; })
      .map(o => window.__partSummary(o, skip))
      .sort((a, b) => a.min[0] - b.min[0])
      .map(s => s.bands);
  }, [SKIP, BODY]);
  await expect.poll(async () => (await resistors()).length, { message: 'three resistors drawn in the viewer' }).toBe(3);

  expect(await page.evaluate(() => !!(window.Parts && Parts.get('resistor'))), 'window.Parts.get("resistor") in the viewer').toBe(true);
  expect(await resistors()).toEqual([
    [YELLOW, VIOLET, BROWN, GOLD],
    [BROWN, BLACK, RED, GOLD],
    [YELLOW, VIOLET, BROWN, GOLD],
  ]);
  expect(errors).toEqual([]);
});

// Testing contract item 8, issue #26: the viewer loads a circuit that uses
// every part, each drawn by its own view.build (App.buildPart), none by the
// old per-type builders. #31 adds the potentiometer (RV1 on e40/e41/e42, one
// named holeRef per pin, its saved position); #40 the light sensor (LDR1 on
// b51–b54, its saved light); #41 the thermistor (TH1 on c56–c59, its saved
// temperature). The expected lists come from
// the circuit and the registry the page loads, so a new part doesn't break
// this test; give EVERY_PART one of each new part to keep item 8 covered.
const EVERY_PART = {
  version: 1, name: 'Every part',
  components: [
    { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: 0 } },
    { type: 'resistor', label: 'R1',  holeRefs: [{ pin: 'lead1', ...h(1, 'b') }, { pin: 'lead2', ...h(5, 'b') }] },
    { type: 'led',      label: 'LED1', values: { color: 'red' }, holeRefs: [{ pin: 'cathode', ...h(7, 'c') }, { pin: 'anode', ...h(5, 'c') }] },
    { type: 'buzzer',   label: 'BZ1', holeRefs: [h(10, 'b'), h(12, 'b')] },     // saved before pin names
    { type: 'button',   label: 'SW1', holeRefs: [h(15, 'b'), h(18, 'b')] },
    { type: 'potentiometer', label: 'RV1', values: { resistance: 10000 }, controls: { position: 50 },
      holeRefs: [{ pin: '1', ...h(39, 'e') }, { pin: 'wiper', ...h(40, 'e') }, { pin: '3', ...h(41, 'e') }] },
    { type: 'slide_switch', label: 'SS1', controls: { toB: true },   // #39, c45 c46 c47, flipped to b
      holeRefs: [{ pin: 'a', ...h(44, 'c') }, { pin: 'common', ...h(45, 'c') }, { pin: 'b', ...h(46, 'c') }] },
    { type: 'ldr', label: 'LDR1', values: { r10: 10000 }, controls: { light: 300 },   // #40, b51–b54
      holeRefs: [{ pin: '1', ...h(50, 'b') }, { pin: '2', ...h(53, 'b') }] },
    { type: 'thermistor', label: 'TH1', values: { r25: 10000 }, controls: { temperature: 25 },   // #41, c56–c59
      holeRefs: [{ pin: '1', ...h(55, 'c') }, { pin: '2', ...h(58, 'c') }] },
  ],
  wires: [
    { startHole: null, endHole: h(62, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
    { startHole: null, endHole: h(62, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
  ],
};

test('viewer.html opens a circuit with every part: all six registered, each drawn through App.buildPart, no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.__built = [];
    let app;
    Object.defineProperty(window, 'App', {
      configurable: true,
      get: () => app,
      set: v => {
        app = v;
        if (!v || v.__buildPartWatched) return;
        v.__buildPartWatched = true;
        let buildPart;
        Object.defineProperty(app, 'buildPart', {
          configurable: true,
          get: () => (buildPart ? (type, ...rest) => { window.__built.push(type); return buildPart(type, ...rest); } : buildPart),
          set: f => { buildPart = f; },
        });
      },
    });
  });
  await page.route('**/demo.sparky', route => route.fulfill({ json: EVERY_PART }));
  await page.goto('/circuit3d/viewer.html');
  await page.waitForFunction(() => window.App && App.scene);

  const types = await page.evaluate(() => (window.Parts ? Parts.all().map(d => d.type).sort() : null));
  expect(types, 'window.Parts in the viewer').not.toBeNull();
  // At least today's six; later parts are allowed.
  const SIX = ['battery', 'button', 'buzzer', 'led', 'potentiometer', 'resistor'];
  expect(SIX.filter(t => !types.includes(t)), `registered in the viewer: ${JSON.stringify(types)}`).toEqual([]);
  // Every part in the circuit is one the viewer's registry knows, and each is
  // drawn once through App.buildPart.
  const inCircuit = [...new Set(EVERY_PART.components.map(c => c.type))].sort();
  expect(inCircuit.filter(t => !types.includes(t)), 'circuit parts the viewer does not register').toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__built.slice().sort()), { message: 'each saved part drawn with App.buildPart' })
    .toEqual(inCircuit);
  expect(errors).toEqual([]);
});
