// The multimeter's screen, issue #97: tools/meter-display.js shows a fixed,
// LCD-style panel #meter-display while a multimeter is on the board, with
// #meter-reading (e.g. "7.00 V", "14.9 mA", "FUSE", "--") and #meter-mode
// (V / A / Ω). It updates on every plugged:sim from result.parts.MM1.m,
// shows FUSE in red (class meter-fuse), and "--" after plugged:sim-stop.
// In Ω mode it shows Multimeter.ohms(...)'s reading, or "--" and why.
//
// Checked on the "Try it out" demo (demo.sparky): BAT1 + → tp_4, − → tn_16;
// tp_3 → a3; R1 b3–b7; LED1 c9/c7; jumper a9 → a12; SW1 b12–b15; a15 → tn_15.
// Holes are read off the loaded board, not typed in, so they follow the demo.
// The meter (MM1) is placed off the board on the far side from the battery;
// its probes are wires from MM1.red / MM1.black (its pin markers) to holes,
// built through window.App the way the mouse handlers do. SW1 is pressed
// with App.setControls (button.spec.js owns the click on the cap).
// /api/ask is stubbed; no real AI is called. Guest only.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
}

// The demo's holes, by name, read off the loaded board.
//   r1:     R1's two columns in row d (probes across the resistor)
//   jumper: the hole-to-hole wire from LED1's column to the button's
//   tp/tn:  the rail holes the battery's wires go to
function demoHoles(page) {
  return page.evaluate(() => {
    const at = (ref, row) => App.formatHole({ col: ref.col, row });
    const r1 = App.state.components.find(c => c.label === 'R1');
    const isRail = h => h.row === 'tp' || h.row === 'tn' || h.row === 'bp' || h.row === 'bn';
    const jumper = App.state.wires.find(w => w.startHole && w.endHole && !isRail(w.startHole) && !isRail(w.endHole));
    const bat = App.state.components.find(c => c.label === 'BAT1');
    const batEnd = k => {
      const w = App.state.wires.find(x => (x.startComp === bat && x.startPinIdx === k) || (x.endComp === bat && x.endPinIdx === k));
      return App.formatHole(w.startComp === bat ? w.endHole : w.startHole);
    };
    return {
      r1: [at(r1.holeRefs[0], 'd'), at(r1.holeRefs[1], 'd')],
      jumper: jumper && [App.formatHole(jumper.startHole), App.formatHole(jumper.endHole)],
      tp: batEnd(0),
      tn: batEnd(1),
    };
  });
}

// Places MM1 off the board (the far side from the battery) in `mode`, and
// its probes: a wire from MM1.red to `red` and one from MM1.black to `black`.
function placeMeter(page, mode, red, black) {
  return page.evaluate(({ mode, red, black }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const end  = s => { const h = hole(s); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    const meter = App.placePart('multimeter', { x: -16, z: 0 }, { mode });
    const probe = (k, s) => {
      const pm = meter.pinMeshes[k];
      App.state.wireStart = { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      App.finishWire(end(s));
    };
    probe(0, red);
    probe(1, black);
    return meter.label;
  }, { mode, red, black });
}

// What the meter's own 3D screen shows: its LCD mesh's userData.meterLcd
// ({ text, unit }, multimeter.js), repainted from the same reading as the panel.
const lcd = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'multimeter');
  let s = null;
  if (c && c.group) c.group.traverse(o => { if (typeof o.userData.meterLcd === 'string') s = JSON.parse(o.userData.meterLcd); });
  return s && { text: s.text, unit: s.unit };
});

const meterMode = page => page.evaluate(() => App.state.components.find(c => c.type === 'multimeter').values.mode);
const press  = page => page.evaluate(() => App.setControls(App.state.components.find(c => c.type === 'button'), { pressed: true }));
const setMode = (page, mode) => page.evaluate(m => App.setValues(App.state.components.find(c => c.type === 'multimeter'), { mode: m }), mode);

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.evaluate(() => App.simRunning)).toBe(true);
}

test('no multimeter on the board: no meter display', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await run(page);
  await press(page);
  // Pin: already true before #97 (no panel at all); guards the panel showing only with a meter.
  await expect(page.locator('#meter-display'), 'absent or hidden with no meter').toBeHidden();
  expect(errors).toEqual([]);
});

test('V mode, probes across R1 of the pressed demo: the display reads about 7.0 V; Stop shows --', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);
  expect(await placeMeter(page, 'V', holes.r1[0], holes.r1[1])).toBe('MM1');

  // The panel is there as soon as a meter is on the board.
  await expect(page.locator('#meter-display'), 'a meter on the board shows #meter-display').toBeVisible();
  await expect(page.locator('#meter-mode')).toHaveText(/V/);

  await run(page);
  await press(page);
  // 9 V − the red LED's ~2.0 V at 14.9 mA, across 470 Ω.
  await expect(page.locator('#meter-reading')).toContainText('7.0');
  await expect(page.locator('#meter-reading')).toContainText('V');
  await expect(page.locator('#meter-reading')).not.toHaveClass(/meter-fuse/);
  // The meter's own screen shows the panel's number, in V.
  const panel = (await page.locator('#meter-reading').textContent()).trim().split(/\s+/)[0];
  await expect.poll(() => lcd(page), { message: "the meter's LCD shows the panel's reading" }).toEqual({ text: panel, unit: 'V' });

  await page.locator('#sim-stop-btn').click();
  await expect(page.locator('#meter-reading'), 'not simulating: --').toHaveText(/^\s*--\s*$/);
  await expect.poll(() => lcd(page), { message: "the meter's LCD shows dashes once stopped" }).toEqual({ text: '----', unit: 'V' });
  expect(errors).toEqual([]);
});

test('A mode in series (the jumper LED1 → button swapped for the probes): about 14.9 mA', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);
  expect(holes.jumper, 'the demo has a hole-to-hole jumper from LED1 to the button').toBeTruthy();
  // Break the loop at the jumper and put the meter in the gap: red on LED1's side.
  await page.evaluate(() => {
    const isRail = h => ['tp', 'tn', 'bp', 'bn'].includes(h.row);
    App.deleteWire(App.state.wires.find(w => w.startHole && w.endHole && !isRail(w.startHole) && !isRail(w.endHole)));
  });
  await placeMeter(page, 'A', holes.jumper[0], holes.jumper[1]);

  await run(page);
  await press(page);
  await expect(page.locator('#meter-mode')).toHaveText(/A/);
  await expect(page.locator('#meter-reading')).toContainText('14.9');
  await expect(page.locator('#meter-reading')).toContainText('mA');
  expect(errors).toEqual([]);
});

test('A mode straight across the battery (tp to tn): FUSE, in red', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);
  await placeMeter(page, 'A', holes.tp, holes.tn);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#meter-reading')).toContainText('FUSE');
  await expect(page.locator('#meter-reading')).toHaveClass(/meter-fuse/);
  await expect.poll(() => lcd(page), { message: "the meter's LCD shows FUSE too" }).toEqual({ text: 'FUSE', unit: '' });
  const colour = await page.locator('#meter-reading').evaluate(el => getComputedStyle(el).color);
  const [r, g, b] = colour.match(/\d+/g).map(Number);
  expect(r, `FUSE is shown in red (got ${colour})`).toBeGreaterThan(g + 60);
  expect(r).toBeGreaterThan(b + 60);
  expect(errors).toEqual([]);
});

test('turning the dial (App.setValues) changes the mode shown and the reading, while simulating', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);
  await placeMeter(page, 'V', holes.r1[0], holes.r1[1]);
  await run(page);
  await press(page);
  await expect(page.locator('#meter-reading')).toContainText('7.0');

  // Ω on a powered circuit: no reading, and the reason.
  await setMode(page, 'Ω');
  await expect(page.locator('#meter-mode')).toHaveText(/Ω/);
  await expect(page.locator('#meter-reading')).toHaveText(/^\s*--\s*$/);
  await expect(page.locator('#meter-display')).toContainText(/power off/i);

  await setMode(page, 'V');
  await expect(page.locator('#meter-mode')).toHaveText(/V/);
  await expect(page.locator('#meter-reading')).toContainText('7.0');
  expect(errors).toEqual([]);
});

test('Ω mode on an unpowered resistor beside the running demo reads its 1 kΩ', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('a40'), hole('a44')], { resistance: 1000 });
  });
  await placeMeter(page, 'Ω', 'c40', 'c44');
  await run(page);

  await expect(page.locator('#meter-mode')).toHaveText(/Ω/);
  await expect(page.locator('#meter-reading')).toContainText('Ω');
  await expect.poll(async () => {
    const t = await page.locator('#meter-reading').textContent();
    const m = /([\d.]+)\s*(k?)Ω/.exec(t || '');
    return m ? Number(m[1]) * (m[2] ? 1000 : 1) : t;
  }, { message: 'the reading, in ohms' }).toBeCloseTo(1000, 0);
  const [num, unit] = (await page.locator('#meter-reading').textContent()).trim().split(/\s+/);
  await expect.poll(() => lcd(page), { message: "the meter's LCD shows the panel's ohms" }).toEqual({ text: num, unit });
  expect(errors).toEqual([]);
});

// Where the meter is on screen, issue #110. The knob is the dial: the only
// group nested in the meter's model. `knob` is the top centre of the dial's
// bounding box; `body` is a point on the case (the model's direct meshes)
// halfway between the case's left edge and the dial's, level with the dial,
// so it lands on the face plate away from the knob. Read fresh after every
// mode change: setValues rebuilds the model.
function meterPoints(page) {
  return page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'multimeter');
    const dial = c.group.children.find(o => o.isGroup);
    const dialBox = new THREE.Box3().setFromObject(dial);
    const caseBox = new THREE.Box3();
    c.group.children.filter(o => o.isMesh).forEach(o => caseBox.expandByObject(o));
    App.camera.updateMatrixWorld();
    const r = App.renderer.domElement.getBoundingClientRect();
    const screen = v => {
      const p = v.clone().project(App.camera);
      return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
    };
    const dialZ = (dialBox.min.z + dialBox.max.z) / 2;
    return {
      knob: screen(new THREE.Vector3((dialBox.min.x + dialBox.max.x) / 2, dialBox.max.y, dialZ)),
      body: screen(new THREE.Vector3((caseBox.min.x + dialBox.min.x) / 2, caseBox.max.y, dialZ)),
    };
  });
}

const selectedMeter = page => page.evaluate(() => {
  const s = App.state.selected;
  return s ? { kind: s.kind, label: s.item.label } : null;
});

test('clicking the meter body selects it and keeps the mode; a second click, or a click on the knob, turns the dial', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);
  await placeMeter(page, 'V', holes.r1[0], holes.r1[1]);
  // Off the board the meter is out of the demo's view (frameCircuit skips
  // off-board parts): look down at it, as a person orbiting to it would.
  await page.evaluate(() => {
    const p = App.state.components.find(c => c.type === 'multimeter').group.position;
    App.controls.target.set(p.x, 0, p.z);
    App.camera.position.set(p.x, 14, p.z + 8);
    App.controls.update();
  });
  await run(page);
  await expect(page.locator('#meter-mode')).toHaveText(/V/);
  expect(await selectedMeter(page), 'nothing selected yet').toBeNull();

  const onCanvas = async (pt, what) => {
    expect(pt.onScreen, `${what} is in view`).toBe(true);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).id, pt), `nothing covers ${what}`).toBe('canvas');
  };

  // 1. A plain click on the body selects the meter and leaves the dial alone.
  let at = await meterPoints(page);
  await onCanvas(at.body, 'the body');
  await page.mouse.click(at.body.x, at.body.y);
  await expect.poll(() => selectedMeter(page), { message: 'the click selects MM1' }).toEqual({ kind: 'component', label: 'MM1' });
  await page.waitForTimeout(200);   // give a wrong dial turn time to show
  await expect(page.locator('#meter-mode'), 'one click on the body keeps V').toHaveText(/V/);
  expect(await meterMode(page)).toBe('V');

  // 2. Clicking the body again, now that it's selected, turns V → A.
  at = await meterPoints(page);
  await onCanvas(at.body, 'the body');
  await page.mouse.click(at.body.x, at.body.y);
  await expect(page.locator('#meter-mode')).toHaveText(/A/);
  expect(await meterMode(page)).toBe('A');

  // 3. A click on the knob turns A → Ω with the meter NOT selected: the
  // knob needs no prior selection.
  await page.evaluate(() => App.deselect());
  expect(await selectedMeter(page), 'deselected before the knob click').toBeNull();
  at = await meterPoints(page);
  await onCanvas(at.knob, 'the knob');
  await page.mouse.click(at.knob.x, at.knob.y);
  await expect(page.locator('#meter-mode')).toHaveText(/Ω/);
  expect(await meterMode(page)).toBe('Ω');
  expect(errors).toEqual([]);
});

// Issue #108: meter leads are red from MM1.red and black from MM1.black,
// whatever wire colour is picked; other wires keep the picked colour.
// A wire's colour is its arc's: the TubeGeometry mesh in wire.group.
// The probe wires are found by their meter pin (0 = red, 1 = black).
function leadColours(page) {
  return page.evaluate(() => {
    const tubeHex = w => {
      const tube = w.group.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'TubeGeometry');
      return tube ? tube.material.color.getHex() : null;
    };
    const onMeter = (w, k) => (w.startComp && w.startComp.type === 'multimeter' && w.startPinIdx === k)
                           || (w.endComp && w.endComp.type === 'multimeter' && w.endPinIdx === k);
    const lead = k => { const w = App.state.wires.find(x => onMeter(x, k)); return w ? tubeHex(w) : 'no wire'; };
    const plain = App.state.wires.find(w => w.id === window.__plainWireId);
    return { red: lead(0), black: lead(1), plain: plain ? tubeHex(plain) : 'no wire', picked: App.state.wireColor };
  });
}

test('probe leads are red and black whatever wire colour is picked; a later wire keeps the picked colour', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  const holes = await demoHoles(page);

  // Pick blue the way a person does: the Wire tool, then the Blue swatch.
  await page.locator('#wire-tool-btn').click();
  await page.locator('#wire-color-row .swatch[title="Blue"]').click();
  expect(await page.evaluate(() => App.state.wireColor), 'Blue swatch picked').toBe(0x3b82f6);

  await placeMeter(page, 'V', holes.r1[0], holes.r1[1]);
  // A plain hole-to-hole wire drawn after the meter's leads.
  await page.evaluate(() => {
    const end = s => { const { col, row } = App.parseHole(s); const h = App.state.breadboard.getHole(col, row); return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null }; };
    App.state.wireStart = end('a50');
    App.finishWire(end('a54'));
    window.__plainWireId = App.state.wires[App.state.wires.length - 1].id;
  });

  const BLUE = 0x3b82f6, RED = 0xef4444, BLACK = 0x000000;
  const hex = n => (typeof n === 'number' ? '0x' + n.toString(16).padStart(6, '0') : String(n));
  let c = await leadColours(page);
  expect(hex(c.red), 'lead from MM1.red is red').toBe(hex(RED));
  expect(hex(c.black), 'lead from MM1.black is black').toBe(hex(BLACK));
  expect(hex(c.plain), 'a normal wire keeps the picked colour').toBe(hex(BLUE));
  expect(hex(c.picked), 'the picked colour is unchanged').toBe(hex(BLUE));

  // Save/load round trip: undo then redo rebuilds the board from its saved
  // record (serializeBoard -> rebuildBoard), colours included.
  await page.evaluate(() => { App.undo(); App.redo(); });
  c = await leadColours(page);
  expect(hex(c.red), 'after a rebuild: red lead').toBe(hex(RED));
  expect(hex(c.black), 'after a rebuild: black lead').toBe(hex(BLACK));
  expect(hex(c.plain), 'after a rebuild: normal wire still blue').toBe(hex(BLUE));
  expect(errors).toEqual([]);
});
