// The electrolytic capacitor in the page, issue #104: picked from the
// generated sidebar and placed by hand, wired as 9 V → 1 kΩ → 1000 µF, then
// Run: the clock counts up and the capacitor's voltage climbs toward 9 V
// (about 5.7 V at 1 s), and hovering it shows its V and stored energy. With
// a button and an LED, the LED fades out after the button is released.
// /api/ask is stubbed; no AI is called. Guest only; Google sign-in stays a
// manual QA case.
//
// The logic (kit values, the RC known answers, energy, backwards, over, ai:
// false) is in test/capacitor.test.js. These tests cover what needs a real
// page: the sidebar pick and the click that places it, Run starting the time
// loop on a real capacitor, the hover card while it charges, and a real
// button click mid-run.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="capacitor"].
// - The part's one C element has pins [+, −] (element pins[0] is the +
//   lead), and its kit values are one `choices` value whose choices set the
//   C element's farads; the spec finds the + lead and the 1000 µF choice
//   from the registry, so pin names, the value key and choice names are the
//   builder's choice. Placed by hand it spans place.span.default columns.
// - measure() gives V = V(+) − V(−) in volts (read from each plugged:sim's
//   result.parts[label].m.V).
// - The hover card (#hover-card) over the capacitor shows its V ("5.7 V")
//   and its stored energy in µJ, mJ or J.
// - The clock is "t = <s> s" in #sim-results (#103).
const { test, expect } = require('@playwright/test');

const CLOCK = /t = (\d+(?:\.\d+)?) s/;
const charge = t => 9 * (1 - Math.exp(-t));   // V_C at t seconds, τ = 1 kΩ × 1000 µF = 1 s

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

// Page helpers: holes, wires (a hole or a pin in label form, "BAT1.0"), and
// the capacitor's polarity and 1000 µF choice, read from the registry.
const HELPERS = () => {
  const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
  const endAt = s => {
    const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
    if (m) {
      const comp = App.state.components.find(c => c.label === m[1]);
      const pm = comp.pinMeshes[Number(m[2])];
      return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
    }
    const h = hole(s);
    return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
  };
  const capInfo = () => {
    const def = Parts.get('capacitor');
    if (!def) return null;
    const vals = {};
    for (const [k, s] of Object.entries(def.values || {})) vals[k] = s.default;
    const [key, spec] = Object.entries(def.values || {}).find(([, s]) => s && s.choices) || [];
    const faradsOf = name => {
      const v = Object.assign({}, vals, { [key]: name }, spec.choices[name]);
      return def.elements(v, {}).find(e => e.kind === 'C').farads;
    };
    const name = Object.keys(spec.choices).find(n => Math.abs(faradsOf(n) - 1e-3) < 1e-9);
    const c = def.elements(Object.assign({}, vals, spec.choices[spec.default]), {}).find(e => e.kind === 'C');
    return { key, name, plus: c.pins[0], minus: c.pins[1], pins: def.pins.slice(), span: def.place.span.default };
  };
  window.__h = {
    hole,
    capInfo,
    wire: (a, b) => { App.state.wireStart = endAt(a); App.finishWire(endAt(b)); },
  };
};

// Where a hole, or the top centre of a part's model (by label), is on screen.
function toScreen(page, kind, arg) {
  return page.evaluate(([kind, arg]) => {
    let p;
    if (kind === 'hole') {
      const { col, row } = App.parseHole(arg);
      p = App.state.breadboard.getHole(col, row).world.clone();
    } else {
      // The top centre of the part's biggest mesh (its body, not a lead).
      const c = App.state.components.find(x => x.label === arg);
      let box = null, most = -1;
      c.group.traverse(o => {
        if (!o.isMesh) return;
        const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
        if (sz.x * sz.y * sz.z > most) { most = sz.x * sz.y * sz.z; box = b; }
      });
      p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    }
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, [kind, arg]);
}

// The ghost: a visible object added after load that isn't a placed part's
// group, drawn entirely in see-through materials (as zener.spec.js).
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

// Records every plugged:sim: wall time, the clock shown, and the given
// parts' measure() fields.
async function listen(page, labels) {
  await page.evaluate(([clock, labels]) => {
    const re = new RegExp(clock);
    window.__sims = [];
    document.addEventListener('plugged:sim', e => {
      const result = (e.detail && e.detail.result) || {};
      const box = document.getElementById('sim-results');
      const m = box ? box.textContent.match(re) : null;
      const sw = App.state.components.find(c => c.type === 'button');
      const rec = { at: performance.now(), clock: m ? Number(m[1]) : null, pressed: sw ? !!(sw.controls && sw.controls.pressed) : null };
      for (const l of labels) rec[l] = result.parts && result.parts[l] ? result.parts[l].m : null;
      const led = App.state.components.find(c => c.label === 'LED1');
      if (led && led.group) led.group.traverse(o => { if (o.userData.ledDome) rec.glow = o.material.emissiveIntensity; });
      window.__sims.push(rec);
    });
  }, [CLOCK.source, labels]);
}

const sims = page => page.evaluate(() => window.__sims);
const last = page => page.evaluate(() => window.__sims[window.__sims.length - 1] || null);
const shownClock = page => page.evaluate(clock => {
  const box = document.getElementById('sim-results');
  const m = box ? box.textContent.match(new RegExp(clock)) : null;
  return m ? Number(m[1]) : null;
}, CLOCK.source);

// The V on the hover card ("5.7 V"), from its value lines (not the title,
// "C1"), or null when the card is hidden.
const cardVolts = page => page.evaluate(() => {
  const card = document.getElementById('hover-card');
  if (!card || card.hidden) return null;
  const text = [...card.children].slice(1).map(d => d.textContent).join(' ');
  const m = /(\d+(?:\.\d+)?) V\b/.exec(text);
  return m ? Number(m[1]) : null;
});

// ── By hand: pick, place, wire the RC, Run, watch it charge ───────────────

test('by hand: pick the capacitor in the sidebar and place it; 9 V → 1 kΩ → 1000 µF, Run: the clock and its voltage climb (≈ 5.7 V at 1 s), and its hover card shows V and energy', async ({ page }) => {
  test.setTimeout(90_000);   // slow runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="capacitor"]');
  await expect(item, 'the capacitor has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'capacitor']);

  const at = await toScreen(page, 'hole', 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost capacitor on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Escape');

  // The placed capacitor: its label, and which column holds its + lead.
  await page.evaluate(HELPERS);
  const cap = await page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'capacitor');
    if (!c) return null;
    const info = window.__h.capInfo();
    const legs = Object.fromEntries(Parts.legsOf(c).map(l => [l.pin, l]));
    return { label: c.label, info, plusCol: legs[info.plus].col + 1, minusCol: legs[info.minus].col + 1,
             rows: Parts.legsOf(c).map(l => l.row) };
  });
  expect(cap, 'a capacitor is on the board').not.toBeNull();
  expect(cap.rows, 'placed by hand on the hovered row').toEqual(['c', 'c']);
  expect(cap.info.name, 'a kit choice gives 1000 µF').toBeTruthy();

  // 1000 µF; BAT1 on the rails; tp → R1 1 kΩ (a20–a24) → the + lead's
  // column; the − lead's column → tn.
  await page.evaluate(cap => {
    const H = window.__h;
    const c = App.state.components.find(x => x.label === cap.label);
    App.setValues(c, { [cap.info.key]: cap.info.name });
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [H.hole('a20'), H.hole('a24')], { resistance: 1000 });
    H.wire('BAT1.0', 'tp_63');
    H.wire('BAT1.1', 'tn_63');
    H.wire('tp_20', 'b20');
    H.wire('c24', 'a' + cap.plusCol);
    H.wire('e' + cap.minusCol, 'tn_' + cap.minusCol);
  }, cap);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(5);
  await listen(page, [cap.label]);

  // Run, then straight onto the capacitor: while it charges (τ = 1 s) its
  // hover card shows its V and stored energy, and the V on it climbs.
  const over = await toScreen(page, 'part', cap.label);
  await page.locator('#sim-run-btn').click();
  await page.mouse.move(over.x - 20, over.y - 20);
  await page.mouse.move(over.x, over.y, { steps: 3 });
  const onCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === App.renderer.domElement, over);
  expect(onCanvas, 'the capacitor is on screen and not under a panel').toBe(true);
  const card = page.locator('#hover-card');
  await expect(card, 'hovering the capacitor while simulating shows the card').toBeVisible();
  const v1 = await cardVolts(page);
  expect(v1, 'the card shows the capacitor\'s V').not.toBeNull();
  expect(v1, `caught while charging (room to climb): ${v1} V on the card`).toBeLessThan(9);
  await expect(card, 'the card shows the stored energy').toContainText(/\d\s?(µJ|uJ|mJ|J)\b/);
  await expect.poll(() => cardVolts(page), { message: `the card's V climbs from ${v1} V as it charges`, timeout: 5000 })
    .toBeGreaterThan(v1);

  // The clock and the capacitor's V (each plugged:sim's measure()).
  await expect.poll(() => shownClock(page), { message: 'the clock counts up past 1 s', timeout: 15_000 }).toBeGreaterThanOrEqual(1.05);
  const timed = (await sims(page)).filter(s => s.clock != null && s[cap.label] && typeof s[cap.label].V === 'number');
  expect(timed.length, 'plugged:sim carries the clock and the capacitor\'s V every frame').toBeGreaterThan(10);
  const atOne = timed.reduce((best, s) => (Math.abs(s.clock - 1) < Math.abs(best.clock - 1) ? s : best));
  const early = timed.find(s => s.clock > 0) || timed[0];
  const vOne = atOne[cap.label].V;
  expect(atOne.clock, 'the clock climbs').toBeGreaterThan(early.clock);
  expect(vOne, `the voltage climbs: ${early[cap.label].V} V at t = ${early.clock} s, ${vOne} V at t = ${atOne.clock} s`)
    .toBeGreaterThan(early[cap.label].V);
  expect(Math.abs(vOne - charge(atOne.clock)), `V at t = ${atOne.clock} s: expected ${charge(atOne.clock).toFixed(2)} V (5.69 V at 1 s), got ${vOne}`)
    .toBeLessThan(0.35);

  await page.locator('#sim-stop-btn').click();
  expect(errors).toEqual([]);
});

// ── Capacitor, button and LED: the LED fades after release ────────────────
// 9 V (tp) → SW1 button a6–a9 → column 9. C1 1000 µF, + lead c9, − lead to
// tn. e9 → f9 carries column 9 to the lower half: R1 1 kΩ g9–g13 → LED1
// (red) anode h13, cathode h15 → tn. Pressed, C1 charges to 9 V at once and
// the LED runs at (9 − 2) / 1 kΩ = 7 mA. Released, C1 feeds it alone:
// 7 e^(−t) mA, lit (dimming) for about 1.95 s, then dark.

// The cap of the button on screen (as e2e/time-run.spec.js clicks it).
async function clickButtonCap(page) {
  const at = await page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'button');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  await page.mouse.click(at.x, at.y);
}

test('capacitor, button and LED: after the button is released the LED stays lit, fades, then goes dark', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(HELPERS);
  expect(await page.evaluate(() => window.__h.capInfo()), 'the capacitor part is registered in the page').not.toBeNull();
  const capLabel = await page.evaluate(() => {
    const H = window.__h;
    const info = H.capInfo();
    const minusCol = 9 + info.span;
    App.placePart('battery', { x: 13, z: 0 });
    H.wire('BAT1.0', 'tp_2');
    H.wire('BAT1.1', 'tn_2');
    App.placePart('button', [H.hole('a6'), H.hole('a9')]);
    const c = App.placePart('capacitor', info.pins.map(p => H.hole(p === info.plus ? 'c9' : 'c' + minusCol)),
      { [info.key]: info.name });
    App.placePart('resistor', [H.hole('g9'), H.hole('g13')], { resistance: 1000 });
    App.placePart('led', [H.hole('h15'), H.hole('h13')], { color: 'red' });   // cathode h15, anode h13
    H.wire('tp_6', 'c6');
    H.wire('d' + minusCol, 'tn_' + minusCol);
    H.wire('e9', 'f9');
    H.wire('i15', 'tn_15');
    return c ? c.label : null;
  });
  expect(capLabel, 'the capacitor was placed').toBeTruthy();
  await listen(page, [capLabel, 'LED1']);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => shownClock(page), { message: 'the clock runs (a capacitor is on the board)', timeout: 5000 }).not.toBeNull();

  // Press: C1 charges to 9 V and the LED lights.
  await clickButtonCap(page);
  await expect.poll(async () => { const s = await last(page); return s && s[capLabel] ? s[capLabel].V : null; },
    { message: 'C1 charges past 8.5 V with the button pressed', timeout: 5000 }).toBeGreaterThan(8.5);
  await expect.poll(async () => { const s = await last(page); return !!(s && s.LED1 && s.LED1.on); },
    { message: 'the LED is lit while pressed' }).toBe(true);

  // Release, then wait for the LED to go dark. Judged on the sim clock, not
  // wall time, so a slow, loaded machine reads the same.
  const mark = (await sims(page)).length;
  await clickButtonCap(page);
  await expect.poll(async () => (await last(page) || {}).pressed, { message: 'a frame after release', timeout: 3000 }).toBe(false);
  await expect.poll(async () => { const s = await last(page); return !!(s && s.LED1 && s.LED1.on); },
    { message: 'the LED goes dark after the capacitor runs down', timeout: 15_000 }).toBe(false);

  const after = (await sims(page)).slice(mark).filter(s => s.pressed === false && s.LED1 && s.clock != null);
  const t0 = after[0].clock;
  expect(after[0].LED1.on, 'the LED is still lit on the first frame after release (the capacitor feeds it)').toBe(true);
  const at = dt => after.reduce((best, s) => (Math.abs(s.clock - t0 - dt) < Math.abs(best.clock - t0 - dt) ? s : best));
  const soon = at(0.2), later = at(1.2);
  expect(later.clock - soon.clock, 'frames about 0.2 s and 1.2 s after release').toBeGreaterThan(0.6);
  expect(soon.LED1.on && later.LED1.on, `lit 0.2 s and 1.2 s after release (${soon.LED1.current} mA, ${later.LED1.current} mA)`).toBe(true);
  expect(later.LED1.current, 'its current falls as the capacitor discharges').toBeLessThan(soon.LED1.current);
  expect(later.glow, `the LED fades: glow ${soon.glow} at 0.2 s, ${later.glow} at 1.2 s`).toBeLessThan(soon.glow);
  expect(later[capLabel].V, 'C1 discharges through the LED').toBeLessThan(soon[capLabel].V);
  const dark = after.find(s => !s.LED1.on);
  // 7 e^(−t) mA falls below the 1 mA threshold at ln 7 = 1.95 s.
  expect(dark.clock - t0, `dark ${(dark.clock - t0).toFixed(2)} s after release (about 1.95 s)`).toBeGreaterThan(1.5);
  expect(dark.clock - t0).toBeLessThan(2.5);

  await page.locator('#sim-stop-btn').click();
  expect(errors).toEqual([]);
});
