// The function generator in the browser (issue #120): place it from the
// sidebar beside the board, set its sine in the inspector, wire it to a
// 470 Ω resistor and an LED, Run, and the LED breathes (lit and dark in
// turn) while the clock runs. /api/ask is stubbed; no AI is called. Guest
// only; Google sign-in stays a manual QA case. The numbers (the output at
// t, the split into a load, the recipe) are test/function-generator.test.js.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is .comp-item[data-type="function_generator"]; it is
//   placed by hand like the bench supply (pick it, click beside the board).
//   Its label is its def's prefix + 1, read from Parts here.
// - Its pins are off-board pins: pinMeshes[0] = OUT, [1] = COM, wired
//   through App.finishWire as the bench supply spec does.
// - The panel is a mesh named 'readout' in the part's group (as the bench
//   supply's), and the text drawn on it is kept in its userData.text:
//   "SINE 1.00 Vp · 1.0 Hz" for the defaults, redrawn when a value changes.
// - The inspector edits amplitude, frequency and offset in
//   #inspector .inspector-row[data-key="<key>"] (a number input, Enter commits).
// - While running, #sim-results shows "sine <A> Vp at <f> Hz" (its line), and
//   each frame's plugged:sim carries result.parts.LED1.m ({ on, current }).
const { test, expect } = require('@playwright/test');

const TYPE  = 'function_generator';
const CLOCK = /t = (\d+(?:\.\d+)?) s/;

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
}

// Where a world point { x, z } on the board plane is on screen.
function screenAt(page, at) {
  return page.evaluate(({ x, z }) => {
    const p = new THREE.Vector3(x, 0, z);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, at);
}

// Wire an off-board pin (LABEL.k) or a hole to a hole, the way the mouse
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

// The text on the generator's panel, or null when there is no such mesh.
const readout = (page, label) => page.evaluate(label => {
  const c = App.state.components.find(p => p.label === label);
  const o = c && c.group && c.group.getObjectByName('readout');
  return o && typeof o.userData.text === 'string' ? o.userData.text : null;
}, label);

const valueNow = (page, label, key) =>
  page.evaluate(([label, key]) => App.state.components.find(c => c.label === label).values[key], [label, key]);

async function setValue(page, label, key, value) {
  const input = page.locator(`#inspector .inspector-row[data-key="${key}"] input:not([type="checkbox"]):not([type="range"])`);
  await expect(input, `the inspector has a ${key} row`).toHaveCount(1);
  await input.fill(String(value));
  await input.press('Enter');
  await expect.poll(() => valueNow(page, label, key), { message: `${label}.${key} becomes ${value}` }).toBe(value);
}

test('function generator by hand: place it, set 5 Vp · 2 Hz · 5 V offset in the inspector, wire it to 470 Ω and an LED, Run, and the LED breathes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);

  // Place it from the sidebar, beside the board.
  const item = page.locator(`#sidebar .comp-item[data-type="${TYPE}"]`);
  await expect(item, 'the function generator has a sidebar item').toHaveCount(1);
  await item.click();
  const spot = await screenAt(page, await page.evaluate(() => App.batterySpot()));
  await page.mouse.move(spot.x - 3, spot.y);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  const L = await page.evaluate(t => Parts.get(t).prefix + '1', TYPE);
  const placed = await page.evaluate(() => App.state.components.map(c => ({ type: c.type, label: c.label, holeRefs: c.holeRefs || null })));
  expect(placed).toEqual([{ type: TYPE, label: L, holeRefs: null }]);
  await page.keyboard.press('Escape');
  expect(await readout(page, L), 'the panel shows the default sine').toBe('SINE 1.00 Vp · 1.0 Hz');

  // The inspector edits the three values; the panel follows.
  await page.evaluate(l => App.selectItem(App.state.components.find(c => c.label === l), 'component'), L);
  await expect(page.locator('#inspector-label')).toHaveText(L);
  await setValue(page, L, 'amplitude', 5);
  await setValue(page, L, 'frequency', 2);
  await setValue(page, L, 'offset', 5);
  await expect.poll(() => readout(page, L), { message: 'the panel shows the new sine' }).toBe('SINE 5.00 Vp · 2.0 Hz');

  // OUT → + rail → 470 Ω → LED (anode c6, cathode c8) → − rail → COM.
  await wire(page, `${L}.0`, 'tp_63');
  await wire(page, `${L}.1`, 'tn_63');
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('b2'), hole('b6')], { resistance: 470 });
    App.placePart('led', [hole('c8'), hole('c6')]);
  });
  await wire(page, 'tp_3', 'a2');
  await wire(page, 'a8', 'tn_8');
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  // Record each frame's LED reading and the clock shown.
  await page.evaluate(clock => {
    const re = new RegExp(clock);
    window.__frames = [];
    document.addEventListener('plugged:sim', e => {
      const p = e.detail && e.detail.result && e.detail.result.parts && e.detail.result.parts.LED1;
      const box = document.getElementById('sim-results');
      const m = box ? box.textContent.match(re) : null;
      window.__frames.push({ clock: m ? Number(m[1]) : null, on: p ? p.m.on : null, current: p ? p.m.current : null });
    });
  }, CLOCK.source);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();

  // Frame-rate proof: wait on SIM time and on what the frames have shown,
  // not on wall time. At 3 fps (CI) each frame still advances the clock by
  // real time, so the sampled phases drift across periods; this keeps
  // collecting until they have covered the sine.
  //   ≥ 2.5 s of sim time (5 periods at 2 Hz), ≥ 10 frames with an LED
  //   reading, a frame near the peak (> 14 mA), a dark frame, and ≥ 3
  //   on/off changes between frames.
  const seen = () => page.evaluate(() => {
    const fr = window.__frames.filter(f => f.on !== null && f.clock !== null);
    const changes = fr.slice(1).filter((f, i) => f.on !== fr[i].on).length;
    return { clock: Math.max(0, ...fr.map(f => f.clock)), frames: fr.length, peak: Math.max(0, ...fr.map(f => f.current || 0)),
             dark: fr.some(f => f.on === false), changes };
  });
  await expect.poll(async () => {
    const s = await seen();
    return s.clock >= 2.5 && s.frames >= 10 && s.peak > 14 && s.dark && s.changes >= 3;
  }, { message: 'frames covering 5 periods: ≥ 10 LED readings, one near the peak, one dark, ≥ 3 on/off changes', timeout: 60_000 }).toBe(true);
  await expect(page.locator('#sim-results'), 'the results line names the sine').toContainText('sine 5.00 Vp at 2.0 Hz');

  // 0–10 V (the recipe's sine, at 2 Hz). Peak: (10 − 2.0) / 520.1 = 15.4 mA,
  // lit. Trough: 0 V, dark, never reverse-biased.
  const frames = (await page.evaluate(() => window.__frames)).filter(f => f.on !== null && f.clock !== null);
  const peak = Math.max(...frames.map(f => f.current || 0));
  expect(peak, `the LED's brightest current, about 15.4 mA (got ${peak.toFixed(2)} mA)`).toBeGreaterThan(14);
  expect(peak, 'under the LED\'s 20 mA rating').toBeLessThan(16.5);
  const changes = frames.slice(1).filter((f, i) => f.on !== frames[i].on).length;
  expect(changes, `the LED turns on and off again and again (${changes} changes over ${frames.length} frames)`).toBeGreaterThanOrEqual(3);
  // Every frame's LED current is the sine's at that frame's clock:
  // max(0, 5 + 5·sin(2π·2·t) − 2.0) / 520.1 A. The clock shows 2 decimals
  // (±5 ms, up to ±0.6 mA on the steepest slope), so ±1 mA.
  const want = t => Math.max(0, (5 + 5 * Math.sin(2 * Math.PI * 2 * t) - 2.0) / 520.1 * 1000);
  const off = frames.filter(f => Math.abs((f.current || 0) - want(f.clock)) > 1)
    .map(f => `t = ${f.clock} s: ${(f.current || 0).toFixed(2)} mA, expected ${want(f.clock).toFixed(2)}`);
  expect(off, `frames whose LED current is not the sine's at their clock (of ${frames.length})`).toEqual([]);

  await page.locator('#sim-stop-btn').click();
  expect(errors).toEqual([]);
});
