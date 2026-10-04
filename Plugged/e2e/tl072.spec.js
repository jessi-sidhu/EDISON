// The TL072 dual op-amp in the page, issue #117: picked from the generated
// sidebar, its ghost shown across the centre gap and placed with a click;
// wired by hand as an inverting −5 amplifier on the bench supply's ±12 V
// with 1 V in, Run, and the hover card on OUT1 shows −5.0 V. /api/ask is
// stubbed; no AI is called. Guest only; Google sign-in stays a manual QA
// case.
//
// The logic (the pinout, every hand-computed circuit, clipping, the current
// limit, no supply, problems(), kcl, the flow dots, the hover card's text)
// is in test/tl072.test.js, its AI side in test/tl072-ai.test.js. This
// covers what needs a real page:
// the sidebar pick, the hover ghost and its 8 leg spheres across the gap,
// the click that places it, Run on a real board, and hovering the chip.
//
// Shapes this spec assumes (stated so the builder matches them):
// - The sidebar item is #sidebar .comp-item[data-type="tl072"].
// - Hovering the anchor hole shows the part's own model as a see-through
//   ghost and one 'hover-leg' sphere per leg, not red, on the holes
//   Parts.footprintLegs gives (as seven-segment.spec.js).
// - pins in datasheet order (1 OUT1, 2 IN1−, 3 IN1+, 4 V−, 5 IN2+, 6 IN2−,
//   7 OUT2, 8 V+); the pin names are the builder's.
// - While simulating, the hover card (#hover-card) over OUT1 (its pin, and
//   the chip itself) shows OUT1's voltage, signed: "−5.0 V" (or "-5.0 V").
//
// Layout, chip at f30 (OUT1 f30, IN1− f31, IN1+ f32, V− f33, IN2+ e33,
// IN2− e32, OUT2 e31, V+ e30):
//   PS1 ±12 V: + → tp_63, COM → tn_63, − → bn_63; tn_1 → bp_1 (bp is COM).
//   V+ tp_30 → a30; V− bn_33 → j33; IN1+ j32 → bp_32.
//   BAT1 at 1 V (the bench has one supply, #197): + → g35, − → tn_62.
//   Rin 20 kΩ i35–i31 (IN1−).
//   Rf 100 kΩ j30 (OUT1)–j34, h34 → h31 (IN1−). Half 2 left unused.
//   Nothing crosses OUT1's column in rows g–i, and the one part in it (Rf,
//   in row j) sits below the default camera's line of sight to f30, so
//   hovering OUT1's pin reaches the chip, not a resistor in front of it.
//   Vout1 = −(100k / 20k) · 1 V ≈ −5.00 V (the −10 version, 0.5 V through
//   10 kΩ, is hand-computed in test/tl072.test.js: −5.00038 V).
//
// The pin-out in the inspector, issue #132 (the second test). Selecting the
// TL072 shows a top-view DIP-8 diagram under its rows; a resistor shows none.
// Shapes it assumes (stated so the builder matches them):
// - #inspector .inspector-pinout: the diagram, present only while the shown
//   part's definition has a pinout (not rendered, or removed, otherwise).
// - Inside it, one [data-pin="k"] per pin k = 1..8, holding the number k and
//   the pin's name (pinout.labels[k − 1]): 1 OUT1, 4 V−, 8 V+ (U+2212).
// - Layout, standard DIP numbering seen from the top: pins 1–4 down the left
//   column, 8–5 down the right (8 top-right, opposite 1; 5 opposite 4).
// - .pinout-notch: the notch / pin-1 marker, at the top of the body, above
//   pin 1 and between the two columns.
// - Every pin sits inside the inspector panel (readable at its width).
const { test, expect } = require('@playwright/test');

const MINUS_FIVE = /[−-]5\.0\d? ?V/;

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
  await page.evaluate(() => { window.__sceneBefore = new Set(App.scene.children.map(o => o.uuid)); });
}

// Where a hole, or the top centre of a part's model (by label), is on screen.
function toScreen(page, kind, arg) {
  return page.evaluate(([kind, arg]) => {
    let p;
    if (kind === 'hole') {
      const { col, row } = App.parseHole(arg);
      p = App.state.breadboard.getHole(col, row).world.clone();
    } else {
      // The top centre of the part's biggest mesh (its body, not a lead).
      const c = App.state.components.find(x => x.label === arg);
      let box = null, most = -1;
      c.group.traverse(o => {
        if (!o.isMesh) return;
        const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
        if (sz.x * sz.y * sz.z > most) { most = sz.x * sz.y * sz.z; box = b; }
      });
      p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    }
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }, [kind, arg]);
}

async function hoverAt(page, at) {
  await page.mouse.move(at.x - 20, at.y - 20);
  await page.mouse.move(at.x, at.y, { steps: 3 });
}

// The ghost: a visible object added after load that isn't a placed part's
// group, drawn entirely in see-through materials (as capacitor.spec.js).
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

// The shown 'hover-leg' spheres, each matched to the hole under it (or null), and whether it is red.
function hoverLegs(page) {
  return page.evaluate(() => {
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const holes = App.state.breadboard.holeData;
    const out = [];
    App.scene.traverse(o => {
      if (!o.isMesh || o.name !== 'hover-leg' || !shown(o)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      const h = holes.find(q => Math.abs(q.x - v.x) < 0.02 && Math.abs(q.z - v.z) < 0.02);
      const c = o.material.color;
      out.push({ hole: h ? App.holeName(h) : null, red: c.r > 0.6 && c.g < 0.4 && c.b < 0.4 });
    });
    return out;
  });
}

// The card's text, or null when it is hidden.
const cardText = page => page.evaluate(() => {
  const card = document.getElementById('hover-card');
  return card && !card.hidden ? card.textContent : null;
});

test('by hand: pick the TL072, its ghost straddles the gap and a click places it; wired as an inverting −5 on ±12 V with 1 V in, Run, and the hover card on OUT1 shows −5.0 V', async ({ page }) => {
  test.setTimeout(90_000);   // slow runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  const item = page.locator('#sidebar .comp-item[data-type="tl072"]');
  await expect(item, 'the TL072 has a sidebar item').toHaveCount(1);
  await item.click();
  expect(await page.evaluate(() => [App.state.mode, App.state.pickedType])).toEqual(['place', 'tl072']);

  // Pin 1's hole, and the 8 holes the legs take from it: across the gap at column 30.
  const legs = await page.evaluate(() => {
    for (const anchor of ['f30', 'e30']) {
      const ls = Parts.footprintLegs('tl072', anchor, 0);
      if (ls && ls.every(l => l.row === 'e' || l.row === 'f')) return ls.map(l => l.hole);
    }
    return null;
  });
  expect(legs, "Parts.footprintLegs('tl072', 'f30', 0) puts all 8 legs in rows e and f").not.toBeNull();
  expect(legs).toHaveLength(8);

  const anchor = await toScreen(page, 'hole', legs[0]);
  await hoverAt(page, anchor);
  await expect.poll(() => hasGhost(page), { message: 'a see-through ghost TL072 on the board' }).toBe(true);
  const spheres = await hoverLegs(page);
  expect(spheres.map(s => s.hole).sort(), `one sphere per leg, on the footprint's holes: ${JSON.stringify(spheres)}`).toEqual([...legs].sort());
  expect(spheres.some(s => s.red), 'across the gap is allowed, so no red sphere').toBe(false);
  expect(await page.evaluate(() => App.state.components.length), 'nothing placed yet').toBe(0);

  await page.mouse.click(anchor.x, anchor.y);
  await page.keyboard.press('Escape');
  const placed = await page.evaluate(() => App.state.components.map(c => ({ type: c.type, label: c.label, holes: Parts.legsOf(c).map(l => l.hole) })));
  expect(placed.map(p => [p.type, p.holes])).toEqual([['tl072', legs]]);
  const chip = placed[0].label;

  // The inverting amplifier (layout in the header), through App calls as the other part specs.
  const col = k => Number(legs[k].slice(1));   // a leg's column, 1-based
  await page.evaluate(({ col }) => {
    const hole = s => { const { col: c, row } = App.parseHole(s); return App.state.breadboard.getHole(c, row); };
    const endAt = s => {
      const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
      if (m) {
        const comp = App.state.components.find(c => c.label === m[1]);
        const pm = comp.pinMeshes[Number(m[2])];
        return { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm };
      }
      const h = hole(s);
      return { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null };
    };
    const wire = (a, b) => { App.state.wireStart = endAt(a); App.finishWire(endAt(b)); };
    const spot = App.batterySpot();
    App.placePart('bench_supply', spot, { voltage: 12 });
    App.placePart('battery', { x: spot.x, z: spot.z + 3 }, { voltage: 1 });
    App.placePart('resistor', [hole('i' + (col.in1n + 4)), hole('i' + col.in1n)], { resistance: 20000 });
    App.placePart('resistor', [hole('j' + col.out1), hole('j' + (col.out1 + 4))], { resistance: 100000 });
    for (const [a, b] of [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'], ['tn_1', 'bp_1'],
                          ['tp_' + col.vpos, 'a' + col.vpos], ['bn_' + col.vneg, 'j' + col.vneg],
                          ['j' + col.in1p, 'bp_' + col.in1p],
                          ['BAT1.0', 'g' + (col.in1n + 4)], ['BAT1.1', 'tn_62'], ['h' + (col.out1 + 4), 'h' + col.in1n]]) {
      wire(a, b);
    }
  }, { col: { out1: col(0), in1n: col(1), in1p: col(2), vneg: col(3), vpos: col(7) } });
  expect(await page.evaluate(() => App.state.components.map(c => c.label).sort())).toEqual([chip, 'BAT1', 'PS1', 'R1', 'R2'].sort());
  expect(await page.evaluate(() => App.state.wires.length)).toBe(10);

  await page.locator('#sim-run-btn').click();
  await expect(page.locator('#sim-results')).toBeVisible();
  await expect.poll(() => page.locator('#sim-results').textContent(), { message: 'a results line gives Vout1 −5.00 V' })
    .toMatch(MINUS_FIVE);

  // Hover OUT1's pin (pin 1's hole, where its leg stands), then the chip itself.
  const card = page.locator('#hover-card');
  const onCanvas = at => page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === App.renderer.domElement, at);
  const out1 = await toScreen(page, 'hole', legs[0]);
  expect(await onCanvas(out1), 'OUT1 is on screen and not under a panel').toBe(true);
  await hoverAt(page, out1);
  await expect(card, 'hovering OUT1 while simulating shows the card').toBeVisible();
  await expect.poll(() => cardText(page), { message: 'the card on OUT1 shows −5.0 V' }).toMatch(MINUS_FIVE);

  const body = await toScreen(page, 'part', chip);
  expect(await onCanvas(body), 'the chip is on screen and not under a panel').toBe(true);
  await hoverAt(page, body);
  await expect(card, 'hovering the chip while simulating shows its card').toBeVisible();
  await expect.poll(() => cardText(page), { message: "the chip's card gives op-amp 1's Vout, −5.0 V (signed)" }).toMatch(MINUS_FIVE);

  expect(errors).toEqual([]);
});

// ── The pin-out in the inspector (#132) ───────────────────────

// Render on demand (#109): a part's world matrices update only when a frame
// draws it, so aim only after one has (as bench-supply-two-channel.spec.js).
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// The top centre of a part's body on screen, and whether a click there hits
// that part first (the first visible mesh under it is in its group).
function aimPart(page, label) {
  return page.evaluate(label => {
    const c = App.state.components.find(x => x.label === label);
    let box = null, most = -1;
    c.group.traverse(o => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3());
      if (sz.x * sz.y * sz.z > most) { most = sz.x * sz.y * sz.z; box = b; }
    });
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    const ndc = p.clone().project(App.camera);
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: ndc.x, y: ndc.y }, App.camera);
    const hit = ray.intersectObjects(App.scene.children, true).find(h => h.object.visible && h.object.isMesh);
    let ours = false;
    for (let x = hit && hit.object; x; x = x.parent) if (x === c.group) ours = true;
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (ndc.x + 1) / 2 * r.width, y: r.top + (1 - ndc.y) / 2 * r.height, ours };
  }, label);
}

async function clickPart(page, label) {
  await page.mouse.move(2, 2);
  await drawn(page);
  const at = await aimPart(page, label);
  expect(at.ours, `a click on ${label}'s body lands on ${label} first (nothing in front)`).toBe(true);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => (App.state.selected ? App.state.selected.item.label : null)),
    { message: `clicking ${label} selects it` }).toBe(label);
}

const PIN_NAMES = ['OUT1', 'IN1−', 'IN1+', 'V−', 'IN2+', 'IN2−', 'OUT2', 'V+'];

test('pin-out: selecting the TL072 shows a top-view DIP-8 diagram in the inspector (OUT1 at 1 top-left, V− at 4, V+ at 8 top-right, notch on top); a resistor shows none', async ({ page }) => {
  test.setTimeout(60_000);   // slow runner (software WebGL)
  const errors = watchErrors(page);
  await openEditor(page);

  // The chip across the gap at column 30, and a resistor well away from it.
  const { chip, res } = await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    let legs = null;
    for (const anchor of ['f30', 'e30']) {
      const ls = Parts.footprintLegs('tl072', anchor, 0);
      if (ls && ls.every(l => l.row === 'e' || l.row === 'f')) { legs = ls; break; }
    }
    const c = App.placePart('tl072', legs.map(l => hole(l.hole)));
    const r = App.placePart('resistor', [hole('b10'), hole('b14')], { resistance: 1000 });
    return { chip: c && c.label, res: r && r.label };
  });
  expect(chip, 'the TL072 is placed').toBeTruthy();
  expect(res, 'the resistor is placed').toBeTruthy();

  await clickPart(page, chip);
  const panel = page.locator('#inspector');
  await expect(panel).toBeVisible();
  const diagram = panel.locator('.inspector-pinout');
  await expect(diagram, 'the TL072 shows a pin-out diagram').toHaveCount(1);
  await expect(diagram).toBeVisible();
  await expect(diagram.locator('[data-pin]'), 'one [data-pin] per pin').toHaveCount(8);

  // Each pin holds its number and its name.
  for (let k = 1; k <= 8; k++) {
    const text = ((await diagram.locator(`[data-pin="${k}"]`).textContent()) || '').replace(/\s+/g, ' ');
    const name = PIN_NAMES[k - 1];
    expect(text, `pin ${k} names ${name}`).toContain(name);
    expect(text.replace(name, ''), `pin ${k} shows its number ${k}`).toMatch(new RegExp(`(^|\\D)${k}(\\D|$)`));
  }

  // Top view: 1–4 down the left, 8–5 down the right, the notch on top.
  const box = async sel => {
    const b = await diagram.locator(sel).first().boundingBox();
    expect(b, `${sel} is laid out on the page`).not.toBeNull();
    return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  };
  const pin = [null];
  for (let k = 1; k <= 8; k++) pin.push(await box(`[data-pin="${k}"]`));
  const level = (a, b, what) => expect(Math.abs(a.cy - b.cy), `${what} at the same height (${a.cy} vs ${b.cy})`).toBeLessThanOrEqual(3);
  expect(pin[1].cx, 'pin 1 is left of pin 8').toBeLessThan(pin[8].x);
  level(pin[1], pin[8], 'pins 1 and 8');
  expect(pin[5].cx, 'pin 5 is right of pin 4').toBeGreaterThan(pin[4].x + pin[4].width);
  level(pin[4], pin[5], 'pins 4 and 5');
  for (let k = 1; k < 4; k++) {
    expect(pin[k + 1].cy, `pin ${k + 1} is below pin ${k} (left column, top to bottom)`).toBeGreaterThan(pin[k].cy);
    expect(pin[8 - k].cy, `pin ${8 - k} is below pin ${9 - k} (right column, top to bottom)`).toBeGreaterThan(pin[9 - k].cy);
    level(pin[k + 1], pin[8 - k], `pins ${k + 1} and ${8 - k}`);
  }
  const notch = await box('.pinout-notch');
  expect(notch.cy, 'the notch is above pin 1 (top of the chip)').toBeLessThan(pin[1].cy);
  expect(notch.cx > pin[1].cx && notch.cx < pin[8].cx, `the notch is between the columns (${pin[1].cx} < ${notch.cx} < ${pin[8].cx})`).toBe(true);

  // Readable at the panel's width: every pin inside the inspector.
  const pb = await panel.boundingBox();
  for (let k = 1; k <= 8; k++) {
    expect(pin[k].x >= pb.x - 1 && pin[k].x + pin[k].width <= pb.x + pb.width + 1,
      `pin ${k} [${pin[k].x}, ${pin[k].x + pin[k].width}] sits inside the panel [${pb.x}, ${pb.x + pb.width}]`).toBe(true);
  }

  // Another part has no pin-out.
  await clickPart(page, res);
  await expect(page.locator('#inspector-label')).toHaveText(res);
  await expect(page.locator('#inspector .inspector-pinout'), 'a resistor shows no pin-out').toHaveCount(0);

  expect(errors).toEqual([]);
});
