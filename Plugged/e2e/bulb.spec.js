// The incandescent bulb in the page, issue #36: picked from the generated
// sidebar, placed by hand as a span part (the ghost shows), wired straight
// across a 6 V battery and simulated, with its glass glowing; and built by a
// stubbed AI reply to the QA prompt, applied with Accept. /api/ask is
// stubbed with page.route; no AI is called. Guest only; Google sign-in stays
// a manual QA case.
//
// The logic (power, brightness, burn-out, placement, round trip, AI tools,
// recipe, complex circuits) is in test/parts-bulb.test.js and
// test/bulb-recipe.test.js. These tests cover what needs a real page: the
// sidebar pick, the hover ghost, the click that places it, Run and the
// results panel, the glow drawn by view.update, and Accept on an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="bulb"].
// - A span part, 3 columns by default: hovering c30 and clicking puts pin 1
//   in c30 and pin 2 in c33, as the 60 Ω / 6 V bulb.
// - While simulating, a #sim-results line names the bulb (/bulb/i) with its
//   power ("0.60 W") and brightness ("100%"): the part's line(r, m).
// - The glow: the brightest emissive (non-black) mesh in the bulb's model
//   glows more at brightness 1.0 than at 0.25, more at 0.25 than before
//   Run, and after Stop it is back as before Run.
//
// Known answer by hand (pin 1 c30, pin 2 c33): BAT1 at 6 V on tp_63/tn_63;
// tp_30 → a30; a33 → tn_33. I = 6 / 60 = 100 mA, P = 0.6 W, brightness 1.0.
// The battery at 3 V: 50 mA, 0.15 W, brightness 0.25.
// AI build (the recipe): BAT1 at 6 V; tp_2 → a2; bulb b2–b5; a5 → tn_5.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const bulbLine = async page => (await page.locator('#sim-results .sim-line').allTextContents()).find(t => /bulb/i.test(t)) || '';

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

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

const bulbOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'bulb');
  return c ? { label: c.label, values: c.values, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});

// How much the placed bulb glows: the brightest emissive (non-black) mesh in
// its model.
function glow(page) {
  return page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'bulb');
    let emissive = 0;
    c.group.traverse(o => {
      const m = o.isMesh && o.material;
      if (m && m.emissive && m.emissive.getHex() !== 0) emissive = Math.max(emissive, m.emissiveIntensity);
    });
    return emissive;
  });
}

// Wire a pin in label form ("BAT1.0") or a hole to a hole, the way the mouse
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

// ── By hand: pick, ghost, place, wire the known answer, Run, glow ─────────

test('by hand: pick the bulb in the sidebar, see its ghost, place it on c30–c33; across 6 V, Run shows 0.60 W at 100% and it glows; at 3 V 25% and dimmer; Stop puts it dark', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="bulb"]');
  await expect(item, 'the bulb has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'bulb']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost bulb on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await bulbOf(page);
  expect(placed, 'a bulb is on the board').not.toBeNull();
  expect(placed.legs).toEqual([['1', 'c30'], ['2', 'c33']]);
  expect(placed.values).toMatchObject({ resistance: 60, ratedVoltage: 6 });
  await page.keyboard.press('Escape');

  // The known answer: a 6 V battery straight across the bulb.
  await page.evaluate(() => App.placePart('battery', App.batterySpot(), { voltage: 6 }));
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_30', 'a30'], ['a33', 'tn_33']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  const idle = await glow(page);
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => bulbLine(page), { message: 'a results line names the bulb at full brightness' }).toMatch(/\b100 ?%/);
  expect(await bulbLine(page), 'and its power, 6² / 60 = 0.60 W').toMatch(/\b0\.60 ?W\b/);
  expect(await simText(page)).not.toMatch(/burn out|⚠/i);
  const full = await glow(page);
  expect(full, `the lit bulb glows: before Run ${idle}, after ${full}`).toBeGreaterThan(idle);

  // The battery at 3 V, while it runs: a quarter as bright, and dimmer.
  await page.evaluate(() => App.setValues(App.state.components.find(c => c.label === 'BAT1'), { voltage: 3 }));
  await expect.poll(() => bulbLine(page), { message: 'at 3 V the bulb is at 25%' }).toMatch(/\b25 ?%/);
  expect(await bulbLine(page)).toMatch(/\b0\.15 ?W\b/);
  const quarter = await glow(page);
  expect(quarter, `at 25% it glows less than at 100% (${full})`).toBeLessThan(full);
  expect(quarter, `at 25% it still glows above dark (${idle})`).toBeGreaterThan(idle);

  await page.evaluate(() => App.stopSimulation());
  expect(await glow(page), 'after Stop the bulb is dark again, as before Run').toBe(idle);
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: the QA prompt ─────────────────────────────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const BULB_BUILD = {
  reply: 'Built it: the battery is set to 6 V to match the bulb, wired straight across it.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery', voltage: 6 },
    { tool: 'place_bulb', holeA: 'b2', holeB: 'b5' },
    wireA('BAT1.0', 'tp_63', 'red'),
    wireA('BAT1.1', 'tn_63', 'black'),
    wireA('tp_2', 'a2', 'red'),
    wireA('a5', 'tn_5', 'black'),
  ],
};

test('a stubbed AI reply to "Light a 6 V bulb from a battery" applies cleanly on Accept, and Run shows the bulb at 100% with no burn-out warning', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, BULB_BUILD);

  await page.locator('#sparky-input').fill('Light a 6 V bulb from a battery');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${BULB_BUILD.actions.length} changes to your circuit.`);
  const b = await bulbOf(page);
  expect(b, 'the AI build placed a bulb').not.toBeNull();
  expect(b.legs).toEqual([['1', 'b2'], ['2', 'b5']]);
  expect(await page.evaluate(() => App.state.components.find(c => c.type === 'battery').values.voltage)).toBe(6);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => bulbLine(page), { message: 'the bulb is at full brightness' }).toMatch(/\b100 ?%/);
  expect(await simText(page)).not.toMatch(/burn out|⚠/i);
  expect(errors).toEqual([]);
});
