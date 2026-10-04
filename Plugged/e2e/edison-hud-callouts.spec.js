// Lab HUD 3/4 (issue #191): results and mistakes as callouts pinned to their
// parts in Edison (?ui=edison). The structured lines, which show (faults
// first, at most ResultCallouts.MAX) and the label layout are
// test/result-callouts.test.js; this spec is what needs a real page: a fault
// callout drawn on U1 when its V− is unwired in Lab 2, its dot on U1's
// projected position, the dot following the camera, #sim-results and the
// mistakes panel kept as mistake-checker.spec expects, and nothing in classic.
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
// Doesn't depend on #189/#190 (the HUD chrome): only on Lab 2 and the callouts.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - #result-callouts: the callouts' overlay over the canvas (one SVG for the
//   leaders, and the label blocks). Only in Edison; classic has none.
// - .result-callout[data-label="U1"][data-level="fault"]: one label block per
//   shown callout, data-label the part, data-level 'ok' | 'warn' | 'fault';
//   its text is the title and the grey sublines.
// - .result-callout-dot[data-label="U1"]: the dot on the part (an SVG circle
//   or any element); the centre of its bounding box is the part's anchor, its
//   group's top centre projected through the camera.
// - The callouts update when the scene renders, so after the camera moves the
//   dot is on the part's new position.
//
// The board: Lab 2's starter (?lab=lab2) with the student's finish from
// test/fixtures/lab2-finish.js added through App.placePart and App.finishWire
// (as e2e/lab-sheet.spec.js), then U1's V− jumper (bn_33 → j33) deleted with
// App.deleteWire. Run: a time run (FG1), U1 has no supply.
const { test, expect } = require('@playwright/test');
const { lab2FinishAll } = require('../test/fixtures/lab2-finish.js');

test.use({ viewport: { width: 1440, height: 900 } });   // the mockup's size

const NEAR = 15;   // px, the dot to U1's projected anchor

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openLab(page, query) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?${query}`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
  await expect.poll(() => page.evaluate(() => App.state.components.map(c => c.label).sort()),
    { message: '?lab=lab2 loads U1, PS1 and FG1' }).toEqual(expect.arrayContaining(['FG1', 'PS1', 'U1']));
}

// Lab 2 finished as the inverting amplifier, then U1's V− jumper deleted:
// parts and wires through App.placePart / App.finishWire (as lab-sheet.spec),
// the jumper through App.deleteWire.
async function buildWithoutVneg(page) {
  const holes = await page.evaluate(() => {
    const u1 = App.state.components.find(c => c.label === 'U1');
    return Object.fromEntries(Parts.legsOf(u1).map(l => [l.pin, l.hole]));
  });
  const vneg = ['bn_' + holes.vneg.slice(1), 'j' + holes.vneg.slice(1)];
  const finish = lab2FinishAll(holes);
  expect(finish.wires, `the finish wires U1's V− (${holes.vneg}) with ${vneg.join(' → ')}`).toContainEqual(vneg);
  const left = await page.evaluate(({ parts, wires, vneg }) => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    const endAt = s => {
      const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
      if (m) {
        const pm = App.state.components.find(c => c.label === m[1]).pinMeshes[Number(m[2])];
        return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      }
      const h = hole(s);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    for (const p of parts) App.placePart(p.type, p.holes.map(hole), p.values);
    for (const [a, b] of wires) { App.state.wireStart = endAt(a); App.finishWire(endAt(b)); }
    const ends = w => [w.startHole, w.endHole].map(h => (h ? App.formatHole(h) : null));
    const w = App.state.wires.find(x => { const e = ends(x); return e.includes(vneg[0]) && e.includes(vneg[1]); });
    if (!w) return null;
    App.deleteWire(w);
    return App.state.wires.length;
  }, { parts: finish.parts, wires: finish.wires, vneg });
  expect(left, 'the V− jumper was drawn, then deleted: every other wire is left').toBe(finish.wires.length - 1);
}

// Render on demand (#109): world matrices are current only once a frame has
// drawn, so project a part only after one (see e2e/lab-sheet.spec.js).
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// U1's anchor (its group's top centre) on screen, the dot's centre, and the canvas.
const anchorAndDot = page => page.evaluate(() => {
  const c = App.state.components.find(x => x.label === 'U1');
  const box = new THREE.Box3().setFromObject(c.group);
  const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  App.camera.updateMatrixWorld();
  p.project(App.camera);
  const r = App.renderer.domElement.getBoundingClientRect();
  const anchor = { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  const el = document.querySelector('.result-callout-dot[data-label="U1"]');
  const d = el ? el.getBoundingClientRect() : null;
  const dot = d ? { x: d.left + d.width / 2, y: d.top + d.height / 2 } : null;
  return { anchor, dot, gap: dot ? Math.hypot(dot.x - anchor.x, dot.y - anchor.y) : null,
           canvas: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
});

const fmt = p => (p ? `(${Math.round(p.x)}, ${Math.round(p.y)})` : 'none');

test('Edison, Lab 2 with U1\'s V− unwired: a fault callout on U1 says it has no supply, its dot on U1, following the camera; #sim-results and the mistakes panel stay, mistakes below', async ({ page }) => {
  test.setTimeout(90_000);   // a time run on a slow runner (software WebGL)
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab2&ui=edison');
  await buildWithoutVneg(page);
  await page.locator('#sim-run-btn').click();

  // The fault callout on U1, naming the missing supply; PS1 and FG1 too (the mockup's three).
  const u1 = page.locator('.result-callout[data-label="U1"]');
  await expect(u1, 'a callout for U1 appears').toBeVisible();
  await expect(u1, 'U1\'s callout is a fault').toHaveAttribute('data-level', 'fault');
  await expect(u1, 'and says U1 has no supply').toContainText(/no supply/i);
  for (const label of ['PS1', 'FG1']) {
    await expect(page.locator(`.result-callout[data-label="${label}"]`), `a callout for ${label}`).toBeVisible();
  }
  const cap = await page.evaluate(() => window.ResultCallouts && ResultCallouts.MAX);
  expect(typeof cap, 'the page has window.ResultCallouts.MAX').toBe('number');
  expect(await page.locator('.result-callout').count(), `at most ResultCallouts.MAX (${cap}) callouts`).toBeLessThanOrEqual(cap);

  // Its dot sits on U1's projected anchor.
  await drawn(page);
  let at = null;
  await expect.poll(async () => { at = await anchorAndDot(page); return at.gap; },
    { message: 'U1\'s dot is within 15 px of U1\'s projected top centre' }).toBeLessThanOrEqual(NEAR);
  const before = at.anchor;
  expect(before.x > at.canvas.left && before.x < at.canvas.right && before.y > at.canvas.top && before.y < at.canvas.bottom,
    `U1's anchor ${fmt(before)} is on the canvas`).toBe(true);

  // Orbit: 30° around the vertical, aimed off U1 so it slides across the view; the dot follows.
  await page.evaluate(() => {
    const c = App.state.components.find(p => p.label === 'U1');
    const centre = new THREE.Box3().setFromObject(c.group).getCenter(new THREE.Vector3());
    const offset = App.camera.position.clone().sub(App.controls.target)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 30 * Math.PI / 180);
    const target = centre.clone().add(new THREE.Vector3(2, 0, 0));
    App.controls.target.copy(target);
    App.camera.position.copy(target).add(offset);
    App.controls.update();
    App.requestRender();
  });
  await drawn(page);
  await expect.poll(async () => { at = await anchorAndDot(page); return at.gap; },
    { message: 'after the orbit, U1\'s dot is within 15 px of U1\'s new projected position', timeout: 2000, intervals: [100] })
    .toBeLessThanOrEqual(NEAR);
  const moved = Math.hypot(at.anchor.x - before.x, at.anchor.y - before.y);
  expect(moved, `U1 moved on screen (${fmt(before)} → ${fmt(at.anchor)}), so the dot followed it`).toBeGreaterThan(40);

  // The text panels stay: #sim-results visible with the run's lines, the
  // mistakes panel visible with the no-supply row, below the results.
  const results = page.locator('#sim-results');
  const panel = page.locator('#mistakes-panel');
  await expect(results, '#sim-results stays visible in Edison').toBeVisible();
  await expect(results).toContainText(/no supply/i);
  await expect(panel, 'the mistakes panel stays visible in Edison').toBeVisible();
  await expect(panel.locator('.mistake-row').filter({ hasText: /no supply/i }), 'the mistakes panel lists U1 with no supply').toHaveCount(1);
  const rb = await results.boundingBox(), pb = await panel.boundingBox();
  expect(rb && pb, 'both panels are on screen').toBeTruthy();
  expect(pb.y, `the mistakes panel (top ${pb.y}) starts below the results (bottom ${rb.y + rb.height})`)
    .toBeGreaterThanOrEqual(rb.y + rb.height - 1);
  expect(errors).toEqual([]);
});

// Pin (passes today; guards the html[data-ui="edison"] scoping): classic draws no callouts.
test('pin: classic, the same Lab 2 board run: no callouts, the mistakes panel as before', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab2&ui=classic');
  await buildWithoutVneg(page);
  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#mistakes-panel .mistake-row').filter({ hasText: /no supply/i }),
    'the run finished: the mistakes panel lists U1 with no supply').toHaveCount(1);
  await drawn(page);
  await expect(page.locator('.result-callout, .result-callout-dot'), 'classic draws no callouts').toHaveCount(0);
  await expect(page.locator('#result-callouts'), 'and no callout overlay is shown').toBeHidden();
  expect(errors).toEqual([]);
});
