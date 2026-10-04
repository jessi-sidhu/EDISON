// The bench power supply in the browser, and clicking a picked part again to
// unpick it (issue #34). /api/ask is stubbed with page.route; no AI is
// called. Guest only; Google sign-in stays a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - The supply's sidebar item is .comp-item[data-type="bench_supply"]. It is
//   placed by hand like the battery: pick it, click beside the board.
// - Its pins are wired as off-board pins (pinMeshes[0] = pos, [1] = com,
//   [2] = neg), through App.finishWire as the other specs wire the battery.
// - The LIMIT light is a mesh in the placed part's group named
//   'limit-light' (group.getObjectByName). It counts as lit when it is
//   visible and its material has a non-black emissive with
//   emissiveIntensity > 0; otherwise it is off. view.update lights it when a
//   rail is over its limit, and puts it out otherwise (and on Stop).
// - While simulating, the results panel (#sim-results) shows the supply's
//   set volts and its + rail current (its headline or its line), and a rail
//   over its limit adds the warning "+ rail would current-limit: …".
// - The inspector edits `limit` in #inspector .inspector-row[data-key="limit"]
//   (a number input, Enter commits), and an edit re-simulates while running.
// - exportMarkdown: a 2-pin off-board part (the battery) prints exactly as
//   today; a 3-pin one lists every pin by name and ref,
//   "off-board pos → wire ref: PS1.0", "off-board com → wire ref: PS1.1",
//   "off-board neg → wire ref: PS1.2", and its wiring cheat-sheet line
//   ("- **PS1**: …") names all three refs.
// - Sidebar unpick: clicking the item of the part already picked (in place
//   mode) sets state.pickedType = null and goes to select mode (no ghost
//   follows the mouse, no item .active, the select hint). A different part
//   switches to it; the picked item is .comp-item.active. The place hint
//   ends "… · Click the part again or ESC to cancel".
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');

// Opens the editor with /api/ask stubbed to `reply`; every request body is
// pushed onto the returned array.
async function openEditor(page, reply = { reply: '', actions: [] }) {
  const asked = [];
  await page.route('**/api/ask', route => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: reply });
  });
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  return asked;
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
const batteryScreenSpot = async page => screenAt(page, await page.evaluate(() => App.batterySpot()));
const holeScreenSpot = async (page, where) => screenAt(page, await page.evaluate(w => {
  const { col, row } = App.parseHole(w);
  const h = App.state.breadboard.getHole(col, row);
  return { x: h.x, z: h.z };
}, where));

async function hover(page, at) {
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
}

const item = (page, type) => page.locator(`#sidebar .comp-item[data-type="${type}"]`);
const hint = page => page.locator('#hint-text');
const picked = page => page.evaluate(() => ({ mode: App.state.mode, type: App.state.pickedType }));
const activeItems = page => page.locator('#sidebar .comp-item.active').evaluateAll(els => els.map(e => e.dataset.type));
const sceneSize = page => page.evaluate(() => App.scene.children.length);

// Wire an off-board pin (label, pin index) or a hole to a hole, the way the
// mouse handlers finish a wire.
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

// The LIMIT light of a placed supply: null when there is no such mesh.
const limitLight = (page, label = 'PS1') => page.evaluate(label => {
  const c = App.state.components.find(p => p.label === label);
  const o = c && c.group && c.group.getObjectByName('limit-light');
  if (!o) return null;
  let visible = true;
  for (let x = o; x; x = x.parent) if (x.visible === false) visible = false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  const lit = visible && !!m && !!m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0;
  return { lit };
}, label);

// ── Place by hand, wire, simulate, LIMIT ──────────────────────────────────

test('bench supply by hand: place it beside the board, wire PS1.0 → tp and PS1.1 → tn, 1 kΩ reads 12 V and 12 mA with LIMIT off; a 5 mA limit warns and lights LIMIT', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);

  await expect(item(page, 'bench_supply'), 'the bench supply has a sidebar item').toHaveCount(1);
  await item(page, 'bench_supply').click();
  const spot = await batteryScreenSpot(page);
  await hover(page, spot);
  await page.mouse.click(spot.x, spot.y);
  const placed = await page.evaluate(() => App.state.components.map(c => ({ type: c.type, label: c.label, holeRefs: c.holeRefs || null })));
  expect(placed).toEqual([{ type: 'bench_supply', label: 'PS1', holeRefs: null }]);
  await page.keyboard.press('Escape');

  await wire(page, 'PS1.0', 'tp_63');
  await wire(page, 'PS1.1', 'tn_63');
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('b10'), hole('b14')], { resistance: 1000 });
  });
  await wire(page, 'tp_10', 'a10');
  await wire(page, 'a14', 'tn_14');
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  expect(await limitLight(page), "a mesh named 'limit-light' in PS1's group").not.toBeNull();
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  const sim = await simText(page);
  expect(sim, 'the set volts').toMatch(/\b12(\.0+)? ?V\b/);
  expect(sim, 'the + rail current').toMatch(/\b12(\.0)? ?mA\b/);
  expect(sim).not.toContain('current-limit');
  expect(await limitLight(page)).toEqual({ lit: false });

  // The inspector: a 5 mA limit is under the 12 mA load.
  await page.evaluate(() => App.selectItem(App.state.components.find(c => c.label === 'PS1'), 'component'));
  await expect(page.locator('#inspector-label')).toHaveText('PS1');
  const limit = page.locator('#inspector .inspector-row[data-key="limit"] input:not([type="checkbox"]):not([type="range"])');
  await limit.fill('0.005');
  await limit.press('Enter');
  await expect.poll(() => page.evaluate(() => App.state.components.find(c => c.label === 'PS1').values.limit)).toBe(0.005);
  await expect.poll(() => simText(page)).toContain('+ rail would current-limit');
  expect(await limitLight(page)).toEqual({ lit: true });

  // Stop puts the light out.
  await page.evaluate(() => App.stopSimulation());
  expect(await limitLight(page)).toEqual({ lit: false });
  expect(errors).toEqual([]);
});

// ── An AI build on the supply ─────────────────────────────────────────────
// 5 V, default 470 Ω, red LED: (5 − 2) / 470.1 = 6.38 mA → "LED ON  (6.4 mA)".

const SUPPLY_BUILD = {
  reply: 'Built an LED on the bench supply at 5 V with a series resistor.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_bench_supply', voltage: 5 },
    { tool: 'add_wire', from: 'PS1.0', to: 'tp_63', color: 'red' },
    { tool: 'add_wire', from: 'PS1.1', to: 'tn_63', color: 'black' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ],
};

test('a stubbed AI supply build applies, lights the LED at 6.4 mA, and the next request\'s board names PS1.0, PS1.1 and PS1.2 by pin', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const asked = await openEditor(page, SUPPLY_BUILD);

  await page.getByRole('button', { name: /Build an LED circuit/ }).click();
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText('✓ Applied 8 changes to your circuit.');
  const ps = await page.evaluate(() => {
    const c = App.state.components.find(p => p.type === 'bench_supply');
    return c && { label: c.label, voltage: c.values.voltage };
  });
  expect(ps).toEqual({ label: 'PS1', voltage: 5 });
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  expect(await simText(page)).toContain('LED ON  (6.4 mA)');
  expect(await limitLight(page)).toEqual({ lit: false });

  // The next question carries the board: every supply pin by name and ref.
  await page.locator('#sparky-input').fill('Is my LED bright enough?');
  await page.locator('#sparky-input').press('Enter');
  await expect.poll(() => asked.length).toBe(2);
  const md = asked[1].markdown;
  expect(md).toContain('| PS1 | bench_supply |');
  for (const [name, ref] of [['pos', 'PS1.0'], ['com', 'PS1.1'], ['neg', 'PS1.2']]) {
    expect(md).toContain(`off-board ${name} → wire ref: ${ref}`);
  }
  expect(md, 'COM is not the − terminal').not.toContain('off-board − → wire ref: PS1.1');
  const sheet = md.split('\n').find(l => l.startsWith('- **PS1**'));
  expect(sheet, 'a wiring cheat-sheet line for PS1').toBeTruthy();
  for (const ref of ['PS1.0', 'PS1.1', 'PS1.2']) expect(sheet).toContain(ref);
  expect(md).toContain('| PS1.0 | tp_63 |');
  expect(errors).toEqual([]);
});

test('guard (passes today): a battery\'s board markdown is unchanged, row and cheat sheet word for word', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => App.placePart('battery', App.batterySpot()));
  await wire(page, 'BAT1.0', 'tp_63');
  await wire(page, 'BAT1.1', 'tn_63');
  const md = await page.evaluate(() => App.exportMarkdown());
  expect(md).toMatch(/^\| BAT1 \| battery \| [^|\n]+ \| off-board \+ → wire ref: BAT1\.0 \| off-board − → wire ref: BAT1\.1 \|$/m);
  expect(md).toContain('\n## Battery wiring (how to connect in add_wire actions)\n');
  expect(md).toContain('- **BAT1**: positive terminal → use `"from": "BAT1.0"`  |  negative terminal → use `"from": "BAT1.1"`\n');
  expect(md).toContain("Voltages are measured from BAT1.1 (the first battery's − terminal).");
});

// ── Click a picked part again to unpick it ────────────────────────────────

test('pick the battery, click it again: select mode, nothing picked, no item active, no preview follows the mouse', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page);
  const bare = await sceneSize(page);

  await item(page, 'battery').click();
  expect(await picked(page)).toEqual({ mode: 'place', type: 'battery' });
  expect(await activeItems(page)).toEqual(['battery']);

  const spot = await batteryScreenSpot(page);
  await hover(page, spot);
  expect(await sceneSize(page), 'the battery preview follows the mouse').toBeGreaterThan(bare);

  await item(page, 'battery').click();
  expect(await picked(page)).toEqual({ mode: 'select', type: null });
  expect(await activeItems(page)).toEqual([]);
  await expect(hint(page)).toHaveText('Click a component or wire to select it · DEL to delete');
  expect(await sceneSize(page), 'the preview is gone').toBe(bare);

  await hover(page, spot);
  await hover(page, await holeScreenSpot(page, 'c30'));
  expect(await sceneSize(page), 'no preview follows the mouse').toBe(bare);
  await page.mouse.click(spot.x, spot.y);
  expect(await page.evaluate(() => App.state.components.length), 'a click places nothing').toBe(0);
  expect(errors).toEqual([]);
});

test('pick the battery, then the LED: the LED is picked and its item is the active one; Wire twice stays in wire mode', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);

  await item(page, 'battery').click();
  await item(page, 'led').click();
  expect(await picked(page)).toEqual({ mode: 'place', type: 'led' });
  expect(await activeItems(page)).toEqual(['led']);

  // Unpicking works for any part, not just the battery.
  await item(page, 'led').click();
  expect(await picked(page)).toEqual({ mode: 'select', type: null });

  await item(page, 'wire').click();
  await item(page, 'wire').click();
  expect((await picked(page)).mode).toBe('wire');
  expect(await activeItems(page)).toEqual(['wire']);
  expect(errors).toEqual([]);
});

test('the place hint says to click the part again or press ESC to cancel', async ({ page }) => {
  await openEditor(page);
  for (const type of ['battery', 'led', 'potentiometer']) {
    await item(page, type).click();
    await expect(hint(page)).toContainText('Click the part again or ESC to cancel');
    await page.keyboard.press('Escape');
  }
});

test('guard (passes today): ESC still cancels a pick', async ({ page }) => {
  await openEditor(page);
  await item(page, 'resistor').click();
  expect((await picked(page)).mode).toBe('place');
  await page.keyboard.press('Escape');
  expect((await picked(page)).mode).toBe('select');
});

// A value change redraws the supply's model; the old one's geometries,
// materials and canvas textures are freed (App's disposeModel), so five
// changes don't pile up GPU textures. Counted through
// App.renderer.info.memory.textures, after the frame that uploads them.
test('changing the bench supply\'s voltage five times frees each old model: GPU textures do not pile up', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const frames = () => page.evaluate(() => new Promise(r => { App.requestRender(); requestAnimationFrame(() => requestAnimationFrame(r)); }));
  await page.evaluate(() => App.placePart('bench_supply', App.batterySpot()));
  await frames();
  const textures = () => page.evaluate(() => App.renderer.info.memory.textures);
  const before = await textures();
  for (let v = 1; v <= 5; v++) {
    await page.evaluate(v => App.setValues(App.state.components.find(c => c.type === 'bench_supply'), { voltage: v }), v);
    await frames();
  }
  expect(await textures(), `GPU textures went from ${before}`).toBeLessThanOrEqual(before);
  expect(errors).toEqual([]);
});
