// The ideal current source in the page, issue #38: picked from the generated
// sidebar, placed by hand as a span part (the ghost shows), Run on its own
// (the results panel says there is no path for the current, with no NaN or
// absurd voltage), then wired into the known answer and Run again; and built
// by a stubbed AI reply to the QA prompt, applied with Accept. /api/ask is
// stubbed with page.route; no AI is called. Guest only; Google sign-in stays
// a manual QA case.
//
// The logic (the I stamp, current division, superposition, two sources, the
// open circuit, placement, round trip, AI tools, findCircuitProblems, the
// recipe) is in test/simulate.test.js, test/parts-current_source.test.js and
// test/current-source-recipe.test.js. These tests cover what needs a real
// page: the sidebar pick, the hover ghost, the click that places it, Run and
// the results panel, and Accept on an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="current_source"].
// - A span part, 3 columns by default: hovering c30 and clicking puts `from`
//   in c30 and `to` in c33, at 10 mA (values.current 0.01).
// - While simulating, a #sim-results line has the source's current and the
//   voltage across it: "10 mA" and "10.0 V across" (its line(r, m)).
// - With nowhere for the current to go, a #sim-results line says "no path for
//   the current".
//
// Known answer by hand (from c30, to c33): a30 → tn_30; R1 1 kΩ d33–d37;
// a37 → tn_37. 10 mA × 1 kΩ = 10.0 V across. No battery.
// AI build (the recipe): source b2 (from) – b5 (to), a2 → tn_2; R1 c5–c9,
// a9 → tn_9; R2 d5–d10, a10 → tn_10: 10 mA into 500 Ω, 5.0 V across.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const acrossLine = async page => (await page.locator('#sim-results .sim-line').allTextContents()).find(t => /V across/.test(t)) || '';

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

const sourceOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'current_source');
  return c ? { label: c.label, values: c.values, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});

// Wire a hole to a hole, the way the mouse handlers finish a wire.
function wire(page, from, to) {
  return page.evaluate(([from, to]) => {
    const endAt = s => {
      const { col, row } = App.parseHole(s);
      const h = App.state.breadboard.getHole(col, row);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    App.state.wireStart = endAt(from);
    App.finishWire(endAt(to));
  }, [from, to]);
}

// ── By hand: pick, ghost, place, Run open, wire the known answer, Run ─────

test('by hand: pick the current source, see its ghost, place it on c30–c33; alone, Run says "no path for the current" with no NaN; wired into 1 kΩ, Run shows 10 mA and 10.0 V across', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="current_source"]');
  await expect(item, 'the current source has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'current_source']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost current source on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await sourceOf(page);
  expect(placed, 'a current source is on the board').not.toBeNull();
  expect(placed.legs).toEqual([['from', 'c30'], ['to', 'c33']]);
  expect(placed.values).toMatchObject({ current: 0.01 });
  await page.keyboard.press('Escape');

  // Alone, with `from` on the ground rail: nowhere for the current to go.
  await wire(page, 'a30', 'tn_30');
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'the panel says there is no path for the current' }).toMatch(/no path for the current/i);
  expect(await simText(page), 'no NaN, Infinity or giant voltage').not.toMatch(/NaN|Infinity|undefined|\de[+-]?\d|\d{5,}/);
  await page.evaluate(() => App.stopSimulation());

  // The known answer: `to` → 1 kΩ → the ground rail, where `from` is.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('d33'), hole('d37')], { resistance: 1000 });
  });
  await wire(page, 'a37', 'tn_37');
  expect(await page.evaluate(() => App.state.wires.length)).toBe(2);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => acrossLine(page), { message: 'a results line with the voltage across the source' }).toMatch(/\b10\.0 V across\b/);
  expect(await acrossLine(page), 'and its current').toMatch(/\b10 mA\b/);
  expect(await simText(page)).not.toMatch(/no path|Circuit open|No battery|⚠/i);
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: the QA prompt ─────────────────────────────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const ISRC_BUILD = {
  reply: 'Built it: a 10 mA current source pushes into one node with two 1 kΩ resistors to ground, so each takes 5 mA at 5 V.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_current_source', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'd5', holeB: 'd10', resistance: 1000 },
    wireA('a2', 'tn_2', 'black'),
    wireA('a9', 'tn_9', 'black'),
    wireA('a10', 'tn_10', 'black'),
  ],
};

test('a stubbed AI reply to "Build a nodal analysis circuit with a 10 mA current source and two resistors" applies cleanly on Accept, and Run shows 5.0 V across the source', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, ISRC_BUILD);

  await page.locator('#sparky-input').fill('Build a nodal analysis circuit with a 10 mA current source and two resistors');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${ISRC_BUILD.actions.length} changes to your circuit.`);
  const s = await sourceOf(page);
  expect(s, 'the AI build placed a current source').not.toBeNull();
  expect(s.legs).toEqual([['from', 'b2'], ['to', 'b5']]);
  expect(await page.evaluate(() => App.state.components.filter(c => c.type === 'resistor').length)).toBe(2);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => acrossLine(page), { message: '10 mA into 1 kΩ ∥ 1 kΩ: 5.0 V across' }).toMatch(/\b5\.0 V across\b/);
  expect(await simText(page)).not.toMatch(/no path|Circuit open|No battery|⚠/i);
  expect(errors).toEqual([]);
});
