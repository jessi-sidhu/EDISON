// The slide switch (SPDT) in the page, issue #39: picked from the generated
// sidebar, placed by hand as a footprint part (3 leg spheres and a ghost),
// wired into the known answer (+ into common; a → 470 Ω → red LED; b →
// 470 Ω → green LED) and simulated; clicked while simulating it flips from a
// (red lit) to b (green lit) and back. Also built by a stubbed AI reply (the
// worked build the prompt gives the AI) applied with Accept. /api/ask is
// stubbed with page.route; no AI is called. Guest only; Google sign-in stays
// a manual QA case.
//
// The logic (elements, measure, report, the known answer both ways, the
// 2-way staircase pair, break before make, placement limits, hole map, round
// trip, AI tools, recipe and guide) is in test/parts-slide_switch.test.js and
// test/slide-switch-recipe.test.js. These tests cover what needs a real page:
// the sidebar pick, the hover legs and ghost, the click that places it, the
// click on the model that flips it (App.partGesture through interaction.js),
// Run and the results panel, the LEDs' glow, and Accept on an AI preview.
// (Saving a `saved` toggle control through autosave / reload / .sparky is the
// generic path e2e/toggle-switch.spec.js already covers.)
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="slide_switch"].
// - A footprint part facing right by default: hovering c30 shows leg spheres
//   on c30 c31 c32, and a click puts a in c30, common in c31, b in c32, on a
//   (controls { toB: false }).
// - Its state is the record's controls.toB; a click on its model while
//   simulating flips it.
//
// Known answer by hand (switch c30 c31 c32): BAT1 on tp_63 / tn_63;
// tp_31 → a31 (+ into common); a: 470 Ω b26–b30, red LED anode d26, cathode
// d24, a24 → tn_24; b: 470 Ω b32–b36, green LED anode d36, cathode d38,
// a38 → tn_38.
// On a: (9 − 2.0) / 470.101 = 14.89 mA red ("LED ON  (14.9 mA)"), green dark.
// On b: (9 − 2.2) / 470.101 = 14.47 mA green ("LED ON  (14.5 mA)"), red dark.
const { test, expect } = require('@playwright/test');
const Parts = require('../circuit3d/js/parts');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const simText = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');
const editorReady = page => page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);

async function openEditor(page, reply = { reply: '', actions: [] }) {
  await page.route('**/api/ask', route => route.fulfill({ json: reply }));
  await page.goto('/circuit3d/index.html');
  await editorReady(page);
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

// The switch's definition in Node: its label is its prefix + 1.
function switchDef() {
  const def = Parts.get('slide_switch');
  expect(def, "Parts.get('slide_switch') in Node: parts/slide_switch.js must exist and be listed in parts/index.js").toBeTruthy();
  return def;
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

// The top centre of the switch's model on screen, where a person clicks it.
function switchPoint(page) {
  return page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'slide_switch');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
}

async function clickSwitch(page) {
  const at = await switchPoint(page);
  await page.mouse.click(at.x, at.y);
}

// The shown 'hover-leg' spheres, as the holes under them ("c30").
function hoverLegHoles(page) {
  return page.evaluate(() => {
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const out = [];
    App.scene.traverse(o => {
      if (!o.isMesh || o.name !== 'hover-leg' || !shown(o)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      const h = App.state.breadboard.getNearestHole(v.x, v.z, null);
      out.push(h ? App.formatHole({ col: h.col, row: h.row }) : null);
    });
    return out.sort();
  });
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

const switchOf = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.type === 'slide_switch');
  return c ? { label: c.label, controls: c.controls || null, legs: Parts.legsOf(c).map(l => [l.pin, l.hole]) } : null;
});
const toB = async page => { const s = await switchOf(page); return s && s.controls ? s.controls.toB : `no switch or no controls: ${JSON.stringify(s)}`; };

// An LED's glow: its dome's emissiveIntensity (about 3.5 lit, 0.45 dark).
const glow = (page, label) => page.evaluate(l => {
  const c = App.state.components.find(x => x.label === l);
  let v = null;
  if (c && c.group) c.group.traverse(o => { if (o.userData && o.userData.ledDome) v = o.material.emissiveIntensity; });
  return v;
}, label);
const lit = async page => ({ red: (await glow(page, 'LED1')) > 1, green: (await glow(page, 'LED2')) > 1 });

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

async function run(page) {
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
}

// ── By hand: pick, legs and ghost, place, wire the known answer, Run, click ──

test('by hand: place the slide switch from the sidebar (legs + ghost show), wire the known answer, Run: red lights; a click flips to green, another back to red', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);
  const label = switchDef().prefix + '1';

  const item = page.locator('#sidebar .comp-item[data-type="slide_switch"]');
  await expect(item, 'the slide switch has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'slide_switch']);

  const at = await holePoint(page, 'c30');
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  await expect.poll(() => hoverLegHoles(page), { message: 'leg spheres on c30 c31 c32' }).toEqual(['c30', 'c31', 'c32']);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost slide switch on the board' }).toBe(true);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(at.x, at.y);
  expect(await switchOf(page), 'a slide switch on the board, a / common / b on c30 / c31 / c32, on a')
    .toEqual({ label, controls: { toB: false }, legs: [['a', 'c30'], ['common', 'c31'], ['b', 'c32']] });
  await page.keyboard.press('Escape');

  // The known answer: + into common; a → 470 Ω → red LED; b → 470 Ω → green LED.
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('battery', App.batterySpot());
    App.placePart('resistor', [hole('b26'), hole('b30')], { resistance: 470 });
    App.placePart('led', [hole('d24'), hole('d26')], { color: 'red' });     // LED1: cathode d24, anode d26
    App.placePart('resistor', [hole('b32'), hole('b36')], { resistance: 470 });
    App.placePart('led', [hole('d38'), hole('d36')], { color: 'green' });   // LED2: cathode d38, anode d36
  });
  for (const [a, b] of [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_31', 'a31'], ['a24', 'tn_24'], ['a38', 'tn_38']]) await wire(page, a, b);
  expect(await page.evaluate(() => App.state.wires.length)).toBe(5);

  // On a: red lights at 14.9 mA, green is dark.
  await run(page);
  await expect.poll(() => simText(page), { message: 'on a, the red LED lights at 14.9 mA' }).toContain('LED ON  (14.9 mA)');
  expect(await simText(page)).not.toContain('14.5 mA');
  await expect.poll(() => lit(page)).toEqual({ red: true, green: false });

  // Click: on b, green lights at 14.5 mA, red is dark.
  await clickSwitch(page);
  await expect.poll(() => toB(page), { message: 'a click on the switch while simulating flips it to b' }).toBe(true);
  await expect.poll(() => simText(page), { message: 'on b, the green LED lights at 14.5 mA' }).toContain('LED ON  (14.5 mA)');
  expect(await simText(page)).not.toContain('14.9 mA');
  await expect.poll(() => lit(page)).toEqual({ red: false, green: true });

  // Click again: back to a, red.
  await clickSwitch(page);
  await expect.poll(() => toB(page)).toBe(false);
  await expect.poll(() => simText(page)).toContain('LED ON  (14.9 mA)');
  await expect.poll(() => lit(page)).toEqual({ red: true, green: false });
  expect(errors).toEqual([]);
});

// ── A stubbed AI build: the worked build, Accept, Run, click ─────────────────

test('a stubbed AI reply to "Use a slide switch to choose between a red and a green LED" (the worked build) applies on Accept; Run lights red, and a click switches to green', async ({ page }) => {
  test.setTimeout(90_000);
  const label = switchDef().prefix + '1';
  const w = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
  const build = {
    reply: `The middle leg of ${label} is common, fed from +. It starts on a, so the red LED is on; click ${label} while the simulation runs to switch to the green LED.`,
    actions: [
      { tool: 'delete_all' },
      { tool: 'place_battery' },
      { tool: 'place_slide_switch', hole: 'c8', direction: 'right' },              // a c8, common c9, b c10
      { tool: 'place_resistor', holeA: 'b4', holeB: 'b8', resistance: 470 },
      { tool: 'place_led', holeA: 'd2', holeB: 'd4', color: 'red' },               // cathode d2, anode d4
      { tool: 'place_resistor', holeA: 'b10', holeB: 'b14', resistance: 470 },
      { tool: 'place_led', holeA: 'd16', holeB: 'd14', color: 'green' },           // cathode d16, anode d14
      w('BAT1.0', 'tp_63', 'red'),
      w('BAT1.1', 'tn_63', 'black'),
      w('tp_9', 'a9', 'red'),
      w('a2', 'tn_2', 'black'),
      w('a16', 'tn_16', 'black'),
    ],
  };
  const errors = watchErrors(page);
  await openEditor(page, build);

  await page.locator('#sparky-input').fill('Use a slide switch to choose between a red and a green LED');
  await page.locator('#sparky-input').press('Enter');
  await expect(page.locator('#sparky-pending-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.chat-msg.system').last()).toHaveText(`✓ Applied ${build.actions.length} changes to your circuit.`);
  expect(await switchOf(page), 'the AI build placed the slide switch on c8 c9 c10, on a')
    .toEqual({ label, controls: { toB: false }, legs: [['a', 'c8'], ['common', 'c9'], ['b', 'c10']] });

  await run(page);
  await expect.poll(() => simText(page), { message: 'as built, the red LED lights at 14.9 mA' }).toContain('LED ON  (14.9 mA)');
  await expect.poll(() => lit(page)).toEqual({ red: true, green: false });
  await clickSwitch(page);
  await expect.poll(() => toB(page)).toBe(true);
  await expect.poll(() => simText(page), { message: 'flipped, the green LED lights at 14.5 mA' }).toContain('LED ON  (14.5 mA)');
  await expect.poll(() => lit(page)).toEqual({ red: false, green: true });
  expect(errors).toEqual([]);
});
