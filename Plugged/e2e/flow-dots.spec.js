// Current-flow dots, issue #100. While simulating, dots move along every wire
// and lead in the direction of conventional current, faster with more
// current. All dots are one THREE.InstancedMesh; a branch with no current has
// none; a toggle beside Stop turns them off; Stop hides them.
//
// The seam these tests read (tools/flow-dots.js sets window.FlowDots):
//   FlowDots.count()   how many dots are visible right now: 0 when the mesh is
//                      hidden, the toggle is off, or nothing flows.
//   the mesh           one THREE.InstancedMesh named 'flow-dots' in App.scene;
//                      its visible dot count (mesh.count, or 0 when it or a
//                      parent is hidden) equals FlowDots.count().
//   #flow-dots-toggle  a button shown while simulating; a click turns the dots
//                      off, another turns them back on.
// A dot keeps its instance index while the circuit is unchanged, so its
// position can be followed from one frame to the next. The page's dot
// directions come from FlowDots.flows (unit-tested in test/flow-dots.test.js);
// here the dots themselves are checked to move the right way along real wires.
//
// Checked on the "Try it out" demo (demo.sparky): W1 BAT1.0 → tp_4, W2 BAT1.1
// → tn_16, W3 tp_3 → a3, W4 a9 → a12, W5 a15 → tn_15; R1 b3–b7, LED1 c9/c7,
// SW1 b12–b15 on the return path. Released, nothing flows; pressed (a click on
// the cap, as button.spec.js), 14.9 mA flows + → R1 → LED1 → SW1 → −, so W3 and
// W5 run start → end and W2 end → start (into the battery's −).
// /api/ask is stubbed and never called. Guest only (sign-in can't be automated).
const { test, expect } = require('@playwright/test');

const simLines = async page => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | ');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
}

// Click the top of the button's cap on the canvas, as button.spec.js does.
async function clickCap(page) {
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

// { api, meshes, visible, count }: whether window.FlowDots exists, how many
// 'flow-dots' InstancedMeshes are in the scene, the mesh's visible dot count
// (0 if absent), and FlowDots.count() (null without the module), so a missing
// module fails on an assertion, not a TypeError.
const dots = page => page.evaluate(() => {
  const found = [];
  App.scene.traverse(o => { if (o.isInstancedMesh && o.name === 'flow-dots') found.push(o); });
  const m = found[0];
  let shown = !!m;
  for (let o = m; o; o = o.parent) if (!o.visible) shown = false;
  return {
    api: typeof window.FlowDots === 'object' && !!window.FlowDots,
    meshes: found.length,
    visible: shown ? m.count : 0,
    count: window.FlowDots ? window.FlowDots.count() : null,
  };
});

// For each wire id, every dot lying on it now and a few animation frames
// later: [{ i, s0, s1 }], s the dot's place along the wire's own arc (the
// tube's path, 0 at its start end, 1 at its end end). A dot is on a wire when
// it is within 0.1 of the arc; the demo's two battery wires are 0.64 apart
// where they leave the battery.
const dotsOnWires = (page, ids) => page.evaluate(async ids => {
  let m = null;
  App.scene.traverse(o => { if (o.isInstancedMesh && o.name === 'flow-dots') m = m || o; });
  const N = 400;
  const arcs = ids.map(id => {
    const w = App.state.wires.find(x => x.id === id);
    let path = null;
    if (w) w.group.traverse(o => { if (!path && o.geometry && o.geometry.parameters && o.geometry.parameters.path) path = o.geometry.parameters.path; });
    return path ? Array.from({ length: N + 1 }, (_, k) => path.getPointAt(k / N)) : null;
  });
  const sample = () => {
    m.updateMatrixWorld(true);
    const out = [], mat = new THREE.Matrix4();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      out.push(new THREE.Vector3().setFromMatrixPosition(mat.premultiply(m.matrixWorld)));
    }
    return out;
  };
  // The dot's place along the arc, refined between the nearest samples; null when off it.
  const along = (pts, p) => {
    let k = 0, best = Infinity;
    pts.forEach((q, j) => { const d = q.distanceToSquared(p); if (d < best) { best = d; k = j; } });
    if (Math.sqrt(best) > 0.1) return null;
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(N, k + 1)];
    const ab = b.clone().sub(a), t = ab.lengthSq() ? Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
    return (Math.max(0, k - 1) + t * (Math.min(N, k + 1) - Math.max(0, k - 1))) / N;
  };
  const before = sample();
  await new Promise(r => { let n = 4; const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
  const after = sample();
  const res = {};
  arcs.forEach((pts, k) => {
    res[ids[k]] = [];
    if (!pts) return;
    before.forEach((p, i) => {
      const s0 = along(pts, p), s1 = i < after.length ? along(pts, after[i]) : null;
      if (s0 !== null && s1 !== null) res[ids[k]].push({ i, s0, s1 });
    });
  });
  return res;
}, ids);

// +1 when most of the wire's dots moved start → end, −1 end → start, 0 when
// they didn't move. A dot wrapping round from one end to the other is
// outvoted by the rest.
const heading = list => {
  const fwd = list.filter(d => d.s1 - d.s0 > 1e-4).length;
  const back = list.filter(d => d.s0 - d.s1 > 1e-4).length;
  return fwd > back ? 1 : back > fwd ? -1 : 0;
};

test('Run + press: one InstancedMesh of dots on every wire, moving + → −; released, toggled or stopped, none', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);

  let d = await dots(page);
  expect(d.api, 'tools/flow-dots.js sets window.FlowDots').toBe(true);
  expect(d.count, 'no dots before Run').toBe(0);
  expect(d.visible, 'no visible dots before Run').toBe(0);

  // Running, button released: the loop is open, nothing flows, so no dots.
  await page.locator('#sim-run-btn').click();
  await expect.poll(() => simLines(page)).toContain('Circuit open');
  d = await dots(page);
  expect(d.count, 'released: no current anywhere, so no dots').toBe(0);
  expect(d.visible).toBe(0);

  // Pressed: 14.9 mA round the loop, dots appear.
  await clickCap(page);
  await expect.poll(() => simLines(page), { message: 'the LED lights once the button is pressed' }).toContain('LED ON  (14.9 mA)');
  await expect.poll(async () => (await dots(page)).count, { message: 'dots flow once the button is pressed' }).toBeGreaterThan(0);
  d = await dots(page);
  expect(d.meshes, 'all dots are one InstancedMesh named flow-dots in the scene').toBe(1);
  expect(d.visible, 'FlowDots.count() is the mesh\'s visible dot count').toBe(d.count);

  // Every wire of the loop carries current, so every one has dots on it.
  const ids = await page.evaluate(() => App.state.wires.map(w => w.id));
  expect(ids).toEqual(['W1', 'W2', 'W3', 'W4', 'W5']);
  const on = await dotsOnWires(page, ids);
  for (const id of ids) expect(on[id].length, `${id} carries 14.9 mA, so has dots on it`).toBeGreaterThan(0);

  // Conventional current: + rail → R1 on W3, button → − rail on W5 (both
  // drawn start → end), and − rail back into the battery's − on W2 (drawn
  // BAT1.1 → tn_16, so end → start). Sampled a few times so one wrap can't decide it.
  for (const [id, want] of [['W3', 1], ['W5', 1], ['W2', -1]]) {
    await expect.poll(async () => heading((await dotsOnWires(page, [id]))[id]),
      { message: `dots on ${id} move ${want > 0 ? 'start → end' : 'end → start'} with the current` }).toBe(want);
  }

  // The toggle beside Stop turns them off while still simulating, and back on.
  const toggle = page.locator('#flow-dots-toggle');
  await expect(toggle, 'the dots toggle shows while simulating').toBeVisible();
  await toggle.click();
  await expect.poll(async () => (await dots(page)).count, { message: 'toggle off: no dots' }).toBe(0);
  expect((await dots(page)).visible).toBe(0);
  expect(await simLines(page), 'still simulating with the LED on').toContain('LED ON  (14.9 mA)');
  await toggle.click();
  await expect.poll(async () => (await dots(page)).count, { message: 'toggle on again: dots back' }).toBeGreaterThan(0);

  // Released: the loop opens and the dots stop.
  await clickCap(page);
  await expect.poll(() => simLines(page)).toContain('Circuit open');
  await expect.poll(async () => (await dots(page)).count, { message: 'released: dots stop' }).toBe(0);
  expect((await dots(page)).visible).toBe(0);

  // Pressed again, then Stop: every dot hidden.
  await clickCap(page);
  await expect.poll(async () => (await dots(page)).count).toBeGreaterThan(0);
  await page.locator('#sim-stop-btn').click();
  await expect.poll(async () => (await dots(page)).count, { message: 'Stop hides every dot' }).toBe(0);
  expect((await dots(page)).visible, 'the mesh shows nothing once stopped').toBe(0);

  expect(errors).toEqual([]);
});
