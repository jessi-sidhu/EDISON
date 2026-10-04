// The Zener diode in the page, issue #35: picked from the generated sidebar,
// placed by hand as a span part (the ghost shows), wired into the known-
// answer regulator on the bench supply at 12 V and simulated; and built by a
// stubbed AI reply to the QA prompt, applied with Accept. /api/ask is stubbed
// with page.route; no AI is called. Guest only; Google sign-in stays a
// manual QA case.
//
// The logic (breakdown, forward, loads, power warning, placement, round
// trip, AI tools, recipe, complex circuits) is in test/parts-zener.test.js
// and test/zener-recipe.test.js. These tests cover what needs a real page:
// the sidebar pick, the hover ghost, the click that places it, Run and the
// results panel, and Accept on an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="zener"].
// - A span part, 4 columns by default: hovering c30 and clicking puts the
//   cathode in c30 and the anode in c34, as the 5.1V model.
// - While simulating, a #sim-results line names the Zener and gives its
//   held voltage ("5.10 V") and current ("6.9 mA"): the part's line(r, m).
//
// Known answer by hand (Zener cathode c30, anode c34): PS1 at 12 V on
// tp_63/tn_63; tp_26 → a26; 1 kΩ b26–b30 (into the cathode's column);
// a34 → tn_34. I = (12 − 5.1) / 1000.1 = 6.90 mA, V = 5.10 V.
// Regulator build (AI, the recipe): PS1 at 12 V on tp_63/tn_63; tp_2 → a2;
// 1 kΩ b2–b6; Zener cathode c6, anode c10; a10 → tn_10. Same numbers.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const zenerLine = async page => (await page.locator('#sim-results .sim-line').allTextContents()).find(t => /zener/i.test(t)) || '';

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

const zenerOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'zener');
  return c ? { label: c.label, values: c.values, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});

// Wire a pin in label form ("PS1.0") or a hole to a hole, the way the mouse
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

// ── By hand: pick, ghost, place, wire the known answer, Run ───────────────

test('by hand: pick the Zener in the sidebar, see its ghost, click to place it on c30–c34; wired as the 12 V regulator, Run shows it holding 5.1 V at 6.9 mA, no warning', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="zener"]');
  await expect(item, 'the Zener has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'zener']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost Zener on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await zenerOf(page);
  expect(placed, 'a Zener is on the board').not.toBeNull();
  expect(placed.label).toBe('ZD1');
  expect(placed.legs).toEqual([['cathode', 'c30'], ['anode', 'c34']]);
  expect(placed.values).toMatchObject({ model: '5.1V', vz: 5.1 });
  await page.keyboard.press('Escape');

  // The known answer: the bench supply at 12 V → 1 kΩ → the Zener's cathode; anode → ground.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('bench_supply', App.batterySpot(), { voltage: 12 });
    App.placePart('resistor', [hole('b26'), hole('b30')], { resistance: 1000 });
  });
  for (const [a, b] of [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['tp_26', 'a26'], ['a34', 'tn_34']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => zenerLine(page), { message: 'a results line names the Zener holding 5.1 V' })
    .toMatch(/\b5\.1\d* ?V\b/);
  expect(await zenerLine(page), 'and its current, (12 − 5.1) / 1000.1 = 6.90 mA').toMatch(/\b6\.9\d* ?mA\b/);
  expect(await simText(page)).not.toMatch(/backwards|⚠/i);
  await page.evaluate(() => App.stopSimulation());
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: the QA prompt's regulator ─────────────────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const REGULATOR_BUILD = {
  reply: 'Built a 5.1 V Zener regulator: the bench supply at 12 V feeds a 1 kΩ resistor into the Zener\'s cathode, and its anode goes to ground.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_bench_supply', voltage: 12 },
    wireA('PS1.0', 'tp_63', 'red'),
    wireA('PS1.1', 'tn_63', 'black'),
    wireA('tp_2', 'a2', 'red'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 1000 },
    { tool: 'place_zener', holeA: 'c6', holeB: 'c10' },          // cathode c6, anode c10
    wireA('a10', 'tn_10', 'black'),
  ],
};

test('a stubbed AI reply to the Zener regulator prompt applies cleanly on Accept, and Run shows the Zener holding 5.1 V', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, REGULATOR_BUILD);

  await page.locator('#sparky-input').fill('Build a 5.1 V Zener regulator from a 12 V supply');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${REGULATOR_BUILD.actions.length} changes to your circuit.`);
  const z = await zenerOf(page);
  expect(z, 'the AI build placed a Zener').not.toBeNull();
  expect(z.legs).toEqual([['cathode', 'c6'], ['anode', 'c10']]);
  expect(await page.evaluate(() => App.state.components.find(c => c.type === 'bench_supply').values.voltage)).toBe(12);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => zenerLine(page), { message: 'the Zener holds 5.1 V' }).toMatch(/\b5\.1\d* ?V\b/);
  expect(await simText(page)).not.toMatch(/backwards|⚠/i);
  expect(errors).toEqual([]);
});
