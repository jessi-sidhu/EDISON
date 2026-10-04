// The diode (1N4148 / 1N4001) in the page, issue #33: picked from the
// generated sidebar, placed by hand as a span part (the ghost shows), wired
// into the known-answer circuit and simulated; and built by a stubbed AI
// reply for reverse-polarity protection, applied with Accept. /api/ask is
// stubbed with page.route; no AI is called. Guest only; Google sign-in stays
// a manual QA case.
//
// The logic (currents, drops, blocking, warnings, placement, round trip, AI
// tools, complex circuits) is in test/parts-diode.test.js. These tests cover
// what needs a real page: the sidebar pick, the hover ghost, the click that
// places it, Run and the results panel, and Accept on an AI preview.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="diode"].
// - A span part, 4 columns by default: hovering c30 and clicking puts the
//   cathode in c30 and the anode in c34, as a 1N4148.
// - While simulating, a #sim-results line gives the diode's current in mA
//   ("8.3 mA" for the known answer), and no line calls anything backwards.
//
// Known answer by hand (diode cathode c30, anode c34): BAT1 on tp_63/tn_63;
// tp_38 → a38; 1 kΩ b34–b38; a30 → tn_30. (9 − 0.65) / 1000.1 = 8.35 mA.
// Protection build (AI): tp_2 → a2; diode anode b2, cathode b6; 470 Ω c6–c10;
// red LED anode d10, cathode d12; a12 → tn_12. (9 − 0.65 − 2.0) / 470.2 = 13.5 mA.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');

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

const diodeOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'diode');
  return c ? { values: c.values, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});

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

// ── By hand: pick, ghost, place, wire the known answer, Run ───────────────

test('by hand: pick the diode in the sidebar, see its ghost, click to place it on c30–c34; wired as the known answer, Run shows 8.3 mA and no warning', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="diode"]');
  await expect(item, 'the diode has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'diode']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost diode on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  const placed = await diodeOf(page);
  expect(placed, 'a diode is on the board').not.toBeNull();
  expect(placed.legs).toEqual([['cathode', 'c30'], ['anode', 'c34']]);
  expect(placed.values).toMatchObject({ model: '1N4148', vf: 0.65, maxCurrent: 0.2 });
  await page.keyboard.press('Escape');

  // The known answer: 9 V → 1 kΩ → the diode forward → ground.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [hole('b34'), hole('b38')], { resistance: 1000 });
  });
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_38', 'a38'], ['a30', 'tn_30']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(4);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'the diode carries (9 − 0.65) / 1000.1 = 8.35 mA' }).toMatch(/\b8\.3 ?mA\b/);
  expect(await simText(page)).not.toMatch(/backwards|⚠/i);
  await page.evaluate(() => App.stopSimulation());
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: reverse-polarity protection for an LED ────────────

const wireA = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const PROTECT_BUILD = {
  reply: 'Added a 1N4148 diode in series with the supply so the LED is protected if the battery goes in backwards.',
  actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    wireA('BAT1.0', 'tp_63', 'red'),
    wireA('BAT1.1', 'tn_63', 'black'),
    wireA('tp_2', 'a2', 'red'),
    { tool: 'place_diode', holeA: 'b6', holeB: 'b2' },          // cathode b6, anode b2
    { tool: 'place_resistor', holeA: 'c6', holeB: 'c10', resistance: 470 },
    { tool: 'place_led', holeA: 'd12', holeB: 'd10' },          // cathode d12, anode d10
    wireA('a12', 'tn_12', 'black'),
  ],
};

test('a stubbed AI reply to the reverse-polarity prompt, with place_diode, applies cleanly on Accept, and Run lights the LED at 13.5 mA', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openEditor(page, PROTECT_BUILD);

  await page.locator('#sparky-input').fill('Add a diode for reverse-polarity protection to an LED circuit');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${PROTECT_BUILD.actions.length} changes to your circuit.`);
  const d = await diodeOf(page);
  expect(d, 'the AI build placed a diode').not.toBeNull();
  expect(d.legs).toEqual([['cathode', 'b6'], ['anode', 'b2']]);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => simText(page), { message: 'LED lit at (9 − 0.65 − 2.0) / 470.2 = 13.5 mA' }).toMatch(/LED ON\s+\(13\.5 mA\)/);
  expect(await simText(page)).not.toMatch(/backwards|⚠/i);
  expect(errors).toEqual([]);
});
