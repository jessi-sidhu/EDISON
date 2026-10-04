// Footprint placement by hand, issue #28: a part with 3 or more legs is
// placed from the hovered hole (its anchor, pin 0), R cycles its allowed
// rotations, the ghost shows one hover sphere per leg (red, with
// checkPlacement's reason as the hint, when it would be refused), and a
// click places it through App.placePart. A saved circuit reopens with the
// same legs. /api/ask is stubbed; no AI is called. Guest only; Google sign-in
// stays a manual QA case.
//
// The test hook (issue #28, decision 6): the app never loads test parts, and
// there is no sidebar entry for them (the generated sidebar is #29). After
// the page loads, this spec defines the fixture parts from
// test/fixtures/parts/ with Parts.define, giving them a simple view.build
// (small boxes and pin spheres), and picks one by setting the place mode
// through App:  App.state.pickedType = 'test_three'; App.setMode('place').
//
// Shapes this spec assumes (stated so the builder matches them):
// - Parts.footprintLegs(type, anchor, rotation) → [{ pin, col, row }] is on
//   window.Parts in the page (parts/registry.js), anchor a hole name ('a10').
// - Each leg's hover sphere in place mode is a THREE.Mesh in App.scene named
//   'hover-leg'. The shown ones (visible, with every parent visible) are the
//   current legs, one per leg on the board, each at its hole's x/z. Red
//   (color r > 0.6, g and b < 0.4) when checkPlacement refuses the placement;
//   not red when it allows it.
// - A refused hover puts checkPlacement's reason in #hint-text.
// - R cycles the picked part's place.rotations, starting at the first (0) when
//   a footprint part is picked, and the hint names the rotation in degrees
//   (e.g. "Rotation: 90° · R to rotate"; the spec checks it contains "90").
const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures', 'parts');
const SOURCES  = ['test_three.js', 'test_chip.js'].map(f => fs.readFileSync(path.join(FIXTURES, f), 'utf8'));

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Loads the editor, then defines the fixture parts in the page with a simple
// test view: one pin sphere and one small box per leg.
async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  await page.evaluate(sources => {
    const view = {
      build(ctx, values, controls, legs) {
        const T = ctx.THREE;
        const G = ctx.boardGeometry;
        const group = new T.Group();
        const pinPositions = legs.map((l, i) => {
          const onBoard = l && l.col != null && Number.isFinite(G.ROW_Z[l.row]);
          const p = onBoard ? ctx.holeWorld(l.col, l.row) : new T.Vector3(i * G.HS, 0, 0);
          const pin = new T.Mesh(new T.SphereGeometry(0.05, 8, 8), ctx.mat.metal());
          pin.position.set(p.x, 0.08, p.z);
          const box = new T.Mesh(new T.BoxGeometry(0.18, 0.12, 0.18), ctx.mat.body(0x333333));
          box.position.set(p.x, 0.2, p.z);
          group.add(pin, box);
          return new T.Vector3(p.x, 0.08, p.z);
        });
        return { group, pinPositions };
      },
    };
    for (const code of sources) {
      const module = { exports: {} };
      new Function('module', 'exports', code)(module, module.exports);
      const def = module.exports();
      def.view = view;
      if (!Parts.get(def.type)) Parts.define(def);
    }
  }, SOURCES);
}

async function pick(page, type) {
  await page.evaluate(t => { App.state.pickedType = t; App.setMode('place'); }, type);
}

// Where a board hole ("c30") is on screen, in page pixels.
function screenPoint(page, where) {
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

async function hover(page, where) {
  const at = await screenPoint(page, where);
  await page.mouse.move(at.x - 3, at.y);
  await page.mouse.move(at.x, at.y);
  return at;
}

async function clickHole(page, where) {
  const at = await hover(page, where);
  await page.mouse.click(at.x, at.y);
}

// The shown 'hover-leg' spheres: world x/z and whether each is red.
function hoverLegs(page) {
  return page.evaluate(() => {
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const out = [];
    App.scene.traverse(o => {
      if (!o.isMesh || o.name !== 'hover-leg' || !shown(o)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      const c = o.material.color;
      out.push({ x: v.x, z: v.z, red: c.r > 0.6 && c.g < 0.4 && c.b < 0.4 });
    });
    return out;
  });
}

// footprintLegs in the page, each with its hole's world x/z (null off the board).
function legsAt(page, type, anchor, rotation) {
  return page.evaluate(([type, anchor, rotation]) => {
    if (typeof Parts.footprintLegs !== 'function') return { missing: true };
    const legs = Parts.footprintLegs(type, anchor, rotation);
    return {
      legs: legs.map(l => {
        const h = App.state.breadboard.getHole(l.col, l.row);
        return { pin: l.pin, col: l.col, row: l.row, x: h ? h.x : null, z: h ? h.z : null };
      }),
    };
  }, [type, anchor, rotation]);
}

async function expectedLegs(page, type, anchor, rotation) {
  const r = await legsAt(page, type, anchor, rotation);
  expect(r.missing, 'window.Parts.footprintLegs(type, anchor, rotation) exists in the page').toBeUndefined();
  return r.legs;
}

// One shown hover sphere on each leg's hole, and no others.
function expectSpheresOn(spheres, legs, what) {
  expect(spheres.length, `${what}: one hover sphere per leg, got ${JSON.stringify(spheres)}`).toBe(legs.length);
  for (const l of legs) {
    const hit = spheres.find(s => Math.abs(s.x - l.x) < 0.02 && Math.abs(s.z - l.z) < 0.02);
    expect(hit, `${what}: a hover sphere on ${l.row}${l.col + 1} (${l.pin})`).toBeTruthy();
  }
}

// The last placed part's legs as { pin, col, row }.
const lastLegs = page => page.evaluate(() => {
  const c = App.state.components[App.state.components.length - 1];
  return c ? { type: c.type, legs: Parts.legsOf(c).map(l => ({ pin: l.pin, col: l.col, row: l.row })) } : null;
});
const bare = legs => legs.map(l => ({ pin: l.pin, col: l.col, row: l.row }));
const count = page => page.evaluate(() => App.state.components.length);

test('test_three: hover shows 3 leg spheres, R cycles rotations, a click places it, and a saved circuit reopens with the same legs', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL): ~0.45 s per action
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'test_three');

  // Rotation 0 (right) at a10: spheres on a10 a11 a12, none red; click places those legs.
  await hover(page, 'a10');
  const right = await expectedLegs(page, 'test_three', 'a10', 0);
  const s0 = await hoverLegs(page);
  expectSpheresOn(s0, right, 'a10 facing right');
  expect(s0.some(s => s.red), 'a free placement is not red').toBe(false);
  await clickHole(page, 'a10');
  expect(await lastLegs(page)).toEqual({ type: 'test_three', legs: bare(right) });

  // R: rotation 90 (down). At a40: a40 b40 c40.
  await page.keyboard.press('r');
  await expect(page.locator('#hint-text')).toContainText('90');
  await hover(page, 'a40');
  const down = await expectedLegs(page, 'test_three', 'a40', 90);
  expectSpheresOn(await hoverLegs(page), down, 'a40 facing down');
  await clickHole(page, 'a40');
  expect(await lastLegs(page)).toEqual({ type: 'test_three', legs: bare(down) });
  expect(bare(down).map(l => l.row + (l.col + 1))).toEqual(['a40', 'b40', 'c40']);

  // R again: 180.
  await page.keyboard.press('r');
  await expect(page.locator('#hint-text')).toContainText('180');
  expect(await count(page)).toBe(2);

  // Save (guest autosave) → reopen: the same legs, with a pin name on every holeRef.
  await page.waitForTimeout(1200);   // auto-save runs 800 ms after the last change
  const entry = await page.evaluate(() => {
    const key = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));
    return JSON.parse(localStorage.getItem(key) || '[]').find(p => p.id === App.state.circuitId);
  });
  expect(entry, 'the circuit was autosaved').toBeTruthy();
  const saved = entry.components.filter(c => c.type === 'test_three').map(c => c.holeRefs);
  expect(saved).toEqual([bare(right), bare(down)]);
  expect(entry.components.every(c => c.rotation === undefined), 'no rotation field is saved').toBe(true);

  await page.evaluate(e => App.loadCircuitData(e), entry);
  const reopened = await page.evaluate(() => App.state.components.filter(c => c.type === 'test_three')
    .map(c => Parts.legsOf(c).map(l => ({ pin: l.pin, col: l.col, row: l.row }))));
  expect(reopened).toEqual([bare(right), bare(down)]);
  const map = await page.evaluate(() => [...App.holeMap().entries()].filter(([, o]) => o.pin && ['in', 'gnd', 'out'].includes(o.pin)).length);
  expect(map, 'all 6 legs are in the hole map after reopening').toBe(6);
  expect(errors).toEqual([]);
});

test('test_three at column 62–63 facing right: red spheres, the edge reason as the hint, and a click places nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'test_three');

  await hover(page, 'a62');
  await expect(page.locator('#hint-text')).toContainText('at column 62 would run past column 63');
  const s = await hoverLegs(page);
  expect(s.length, `hover spheres on the legs still on the board: ${JSON.stringify(s)}`).toBeGreaterThanOrEqual(1);
  expect(s.every(x => x.red), `every hover sphere is red: ${JSON.stringify(s)}`).toBe(true);
  await clickHole(page, 'a62');
  expect(await count(page), 'nothing placed at a62').toBe(0);

  await hover(page, 'a63');
  await expect(page.locator('#hint-text')).toContainText('at column 63 would run past column 63');
  await clickHole(page, 'a63');
  expect(await count(page), 'nothing placed at a63').toBe(0);

  // A free spot is not red again.
  await hover(page, 'a20');
  const ok = await hoverLegs(page);
  expect(ok.length).toBe(3);
  expect(ok.some(x => x.red), 'a20 facing right is allowed, so not red').toBe(false);
  expect(errors).toEqual([]);
});

test('test_chip at e20 places 8 legs across the gap; hovering a30 shows the straddle reason and places nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await pick(page, 'test_chip');

  await hover(page, 'e20');
  const legs = await expectedLegs(page, 'test_chip', 'e20', 0);
  expect(bare(legs).map(l => l.row + (l.col + 1))).toEqual(['e20', 'e21', 'e22', 'e23', 'f23', 'f22', 'f21', 'f20']);
  const s = await hoverLegs(page);
  expectSpheresOn(s, legs, 'chip at e20');
  expect(s.some(x => x.red), 'a chip across the gap is not red').toBe(false);
  await clickHole(page, 'e20');
  expect(await lastLegs(page)).toEqual({ type: 'test_chip', legs: bare(legs) });

  await hover(page, 'a30');
  await expect(page.locator('#hint-text')).toContainText('a chip must sit across the centre gap (rows e and f).');
  const red = await hoverLegs(page);
  expect(red.length).toBe(8);
  expect(red.every(x => x.red), 'every leg is red off the gap').toBe(true);
  await clickHole(page, 'a30');
  expect(await count(page), 'nothing placed at a30').toBe(1);
  expect(errors).toEqual([]);
});

// Review fix: the AI's board state (App.exportMarkdown) lists every leg of a
// footprint part with its pin name. Rows for 2-pin parts stay exactly as
// today: a resistor's pin_A / pin_B are bare holes, an LED's carry its pin
// names, "c8 (cathode)" / "c6 (anode)".
test('exportMarkdown lists all 3 holes of test_three with pin names; the resistor and LED rows are unchanged', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const rows = () => page.evaluate(() => App.exportMarkdown().split('\n').filter(l => /^\| (?!id \||-)/.test(l)));

  // The one-LED layout: R1 b2–b6, LED1 cathode c8 / anode c6.
  await page.evaluate(() => {
    const at = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [at('b2'), at('b6')]);
    App.placePart('led', [at('c8'), at('c6')]);
  });
  const before = await rows();
  const r1  = before.find(l => l.startsWith('| R1 |'));
  const led = before.find(l => l.startsWith('| LED1 |'));
  expect(r1, `an R1 row in ${JSON.stringify(before)}`).toMatch(/^\| R1 \| resistor \| [^|]+ \| b2 \| b6 \|$/);
  expect(led, `an LED1 row in ${JSON.stringify(before)}`).toMatch(/^\| LED1 \| led \| [^|]+ \| c8 \(cathode\) \| c6 \(anode\) \|$/);

  await page.evaluate(() => {
    const at = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('test_three', [at('a10'), at('a11'), at('a12')]);   // rotation 0 at a10
  });
  const after = await rows();
  const three = after.find(l => l.includes('| test_three |'));
  expect(three, `a test_three row in ${JSON.stringify(after)}`).toBeTruthy();
  for (const s of ['a10', 'a11', 'a12', 'in', 'gnd', 'out']) {
    expect(three, `the test_three row names ${s}`).toContain(s);
  }
  expect(after.find(l => l.startsWith('| R1 |')), 'the R1 row is byte-identical').toBe(r1);
  expect(after.find(l => l.startsWith('| LED1 |')), 'the LED1 row is byte-identical').toBe(led);
  expect(errors).toEqual([]);
});
