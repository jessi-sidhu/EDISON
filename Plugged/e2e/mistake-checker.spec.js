// The mistake checker panel, issue #95. tools/mistakes.js listens for
// plugged:sim and lists readings.problems() in #mistakes-panel, under the
// results panel (#sim-results). Each problem is one .mistake-row (kind icon,
// labels, why); with none, the panel says "No problems found" and has no
// .mistake-row. Clicking a row outlines its parts: the part becomes the
// selection (App.state.selected = { item: <the part>, kind: 'component' },
// what App.selectItem records). Stop clears or hides the panel.
// Checked on the "Try it out" demo (demo.sparky: BAT1 → R1 470 Ω b3–b7 →
// LED1 cathode c9 / anode c7 → SW1 b12–b15 → tn), pressing its button by
// clicking the cap as a person does. /api/ask is stubbed; no AI is called.
// Guest only.
//
// Info rows (issue #126): readings.problems() marks some rows info: true (a
// TL072 comparator clipping at its rail). Shapes the last case assumes:
// - An info row is still a .mistake-row (clickable as any row) and also
//   carries the class .mistake-info; a real problem's row never does.
// - An info row's .mistake-icon is "i" (or "ℹ"), never "!", and is drawn in
//   a different colour from a real problem's icon.
// - The panel only counts real problems: with nothing but info rows it still
//   says "No problems found" (.mistake-none) above them; with a real problem
//   it doesn't.
const { test, expect } = require('@playwright/test');

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const panel = page => page.locator('#mistakes-panel');
const rows  = page => page.locator('#mistakes-panel .mistake-row');

async function openDemo(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/landing.html');
  await page.getByRole('button', { name: /Try it out/ }).click();
  await page.waitForURL('**/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.components.length === 4);
}

// Where the top of the button's cap is on screen (as in button.spec.js).
function capPoint(page) {
  return page.evaluate(() => {
    const c = App.state.components.find(x => x.type === 'button');
    const box = new THREE.Box3().setFromObject(c.group);
    const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
}

async function pressButton(page) {
  const at = await capPoint(page);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => App.state.components.find(x => x.type === 'button').controls.pressed),
    { message: 'the click on the cap presses SW1' }).toBe(true);
}

// Turn the demo's LED around: removed, then placed again on the same two
// holes swapped (cathode c7 on the resistor's side, anode c9 toward SW1),
// the record a flipped placement leaves (flip-led.spec.js). It is LED1 again.
async function reverseLed(page) {
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.deletePart(App.state.components.find(c => c.label === 'LED1'));
    App.placePart('led', [hole('c7'), hole('c9')]);
  });
  const led = await page.evaluate(() => {
    const c = App.state.components.find(p => p.type === 'led');
    return c && { label: c.label, holes: c.holeRefs.map(r => r.row + (r.col + 1)) };
  });
  expect(led, 'LED1 turned around: cathode c7, anode c9').toEqual({ label: 'LED1', holes: ['c7', 'c9'] });
}

// Stop leaves no problem on screen: the panel is hidden, or shows nothing.
const panelCleared = page => page.evaluate(() => {
  const el = document.getElementById('mistakes-panel');
  if (!el) return true;
  const hidden = getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden' || !el.offsetParent;
  return hidden || (!el.querySelector('.mistake-row') && !/No problems found/.test(el.textContent));
});

test('a reversed LED on the demo: the panel lists LED1 as backwards, and clicking the row selects (outlines) LED1; Stop clears it', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await reverseLed(page);

  await page.locator('#sim-run-btn').click();
  await pressButton(page);
  await expect.poll(async () => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | '),
    { message: 'the results panel already says the LED is backwards' }).toContain('LED is backwards');

  const row = rows(page).filter({ hasText: 'LED1' }).filter({ hasText: /backwards/i });
  await expect(row, 'a row names LED1 and says it is backwards').toHaveCount(1);
  await expect(panel(page)).not.toContainText('No problems found');

  expect(await page.evaluate(() => App.state.selected), 'nothing selected before the click').toBeNull();
  await row.click();
  await expect.poll(() => page.evaluate(() => {
    const s = App.state.selected;
    return s ? { kind: s.kind, label: s.item && s.item.label } : null;
  }), { message: 'clicking the row selects LED1, the part it names' }).toEqual({ kind: 'component', label: 'LED1' });

  await page.locator('#sim-stop-btn').click();
  await expect.poll(() => panelCleared(page), { message: 'Stop clears or hides the mistakes panel' }).toBe(true);
  expect(errors).toEqual([]);
});

test('the demo as loaded: "No problems found" under the results, released and pressed', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page);

  await page.locator('#sim-run-btn').click();
  // Released: the loop is open, but an open button is normal use.
  await expect(panel(page)).toContainText('No problems found');
  await expect(rows(page)).toHaveCount(0);

  await pressButton(page);
  await expect.poll(async () => (await page.locator('#sim-results .sim-line').allTextContents()).join(' | '))
    .toContain('LED ON  (14.9 mA)');
  await expect(panel(page)).toContainText('No problems found');
  await expect(rows(page)).toHaveCount(0);

  // The panel sits under the results panel.
  const results = await page.locator('#sim-results').boundingBox();
  const box = await panel(page).boundingBox();
  expect(results && box, 'both panels are on screen').toBeTruthy();
  expect(box.y, `the mistakes panel (top ${box.y}) starts below the results (bottom ${results.y + results.height})`)
    .toBeGreaterThanOrEqual(results.y + results.height - 1);
  expect(errors).toEqual([]);
});

// A TL072 comparator on ±12 V (the comparator() board of test/tl072.test.js):
// chip at f30 (OUT1 f30, IN1− f31, IN1+ f32, V− f33, IN2+ e33, IN2− e32,
// OUT2 e31, V+ e30). PS1: + → tp_1, COM → tn_1, − → bn_1; tp_30 → a30 (V+),
// bn_33 → j33 (V−). IN1+ from 1k/1k (a40–a45 / b40–b35) = 6 V, IN1− from
// 7k/5k (a50–a57 / b50–b53) = 5 V, OUT1 open: high, clipped at +10.5 V.
// Half 2 parked as a follower with IN2+ on COM. Returns the chip's label and
// the V+ pin's hole (row a), for the wire the second half of the case removes.
async function buildComparator(page) {
  return page.evaluate(() => {
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
    const wire = (a, b) => { App.state.wireStart = endAt(a); App.finishWire(endAt(b)); };
    const legs = ['f30', 'e30'].map(a => Parts.footprintLegs('tl072', a, 0))
      .find(ls => ls && ls.every(l => l.row === 'e' || l.row === 'f'));
    // The i-th hole away from the gap in pin k's column (1-based column numbers).
    const away = (k, i) => (legs[k].row === 'f' ? 'fghij' : 'edcba')[i] + legs[k].hole.slice(1);
    const col = k => legs[k].hole.slice(1);
    const [, IN1N, IN1P, VNEG, IN2P, IN2N, OUT2, VPOS] = [0, 1, 2, 3, 4, 5, 6, 7];

    App.placePart('bench_supply', App.batterySpot(), { voltage: 12 });
    const chip = App.placePart('tl072', legs.map(l => hole(l.hole)));
    const res = (a, b, ohms) => App.placePart('resistor', [hole(a), hole(b)], { resistance: ohms });
    res('a40', 'a45', 1000); res('b40', 'b35', 1000);
    res('a50', 'a57', 7000); res('b50', 'b53', 5000);
    for (const [a, b] of [['PS1.0', 'tp_1'], ['PS1.1', 'tn_1'], ['PS1.2', 'bn_1'],
                          ['tp_' + col(VPOS), away(VPOS, 4)], ['bn_' + col(VNEG), away(VNEG, 4)],
                          ['tp_45', 'c45'], ['c35', 'tn_35'], ['tp_57', 'c57'], ['c53', 'tn_53'],
                          ['d40', away(IN1P, 4)], ['d50', away(IN1N, 4)],
                          [away(IN2P, 1), 'tn_' + col(IN2P)], [away(IN2N, 1), away(OUT2, 1)]]) {
      wire(a, b);
    }
    return { chip: chip.label, vpos: away(VPOS, 4) };
  });
}

// Each row's icon, its colour, whether it is an info row, and its text.
const rowsSeen = page => page.evaluate(() => [...document.querySelectorAll('#mistakes-panel .mistake-row')].map(r => {
  const icon = r.querySelector('.mistake-icon');
  return { info: r.classList.contains('mistake-info'), icon: icon && icon.textContent.trim(),
           colour: icon && getComputedStyle(icon).color, text: r.textContent };
}));

test('a TL072 comparator clipping at +10.5 V: its row is info ("i", .mistake-info, not the error colour) and the panel still says "No problems found"; with V+ unwired, no-supply is an error row', async ({ page }) => {
  test.setTimeout(90_000);   // slow runner (software WebGL)
  const errors = watchErrors(page);
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
  const { chip, vpos } = await buildComparator(page);
  expect(await page.evaluate(() => App.state.components.length), 'PS1, the chip and 4 resistors').toBe(6);

  await page.locator('#sim-run-btn').click();
  await expect.poll(() => page.locator('#sim-results').textContent(), { message: 'the results say OUT1 is clipped at +10.5 V' })
    .toMatch(/clipped at \+10\.5 V/);

  const clipRow = rows(page).filter({ hasText: chip }).filter({ hasText: /clip/i });
  await expect(clipRow, `a row names ${chip} and says it clipped`).toHaveCount(1);
  const seen = await rowsSeen(page);
  const clip = seen.find(r => /clip/i.test(r.text));
  expect(clip.info, `the clipped row carries .mistake-info: ${JSON.stringify(seen)}`).toBe(true);
  expect(clip.icon, 'the clipped row\'s icon is an info "i", not "!"').toMatch(/^(i|ℹ️?)$/);
  expect(seen.filter(r => !r.info), `a comparator clipping is not a problem, so no error rows: ${JSON.stringify(seen)}`).toEqual([]);
  await expect(panel(page).locator('.mistake-none'), 'with only info rows the panel still says "No problems found"')
    .toHaveText('No problems found');

  // Unwire V+: the chip has no supply, a real problem.
  await page.evaluate(v => {
    const w = App.state.wires.find(x => [x.startHole, x.endHole].some(h => h && App.formatHole(h) === v));
    App.deleteWire(w);
  }, vpos);
  await expect.poll(async () => (await rowsSeen(page)).some(r => /no supply/i.test(r.text)),
    { message: `a no-supply row for ${chip} once V+ is unwired` }).toBe(true);
  const after = await rowsSeen(page);
  const noSupply = after.find(r => /no supply/i.test(r.text));
  expect(noSupply.info, `no-supply is an error row, not .mistake-info: ${JSON.stringify(after)}`).toBe(false);
  expect(noSupply.icon, 'an error row keeps an error icon, not the info "i"').not.toMatch(/^(i|ℹ️?)$/);
  expect(noSupply.colour, 'an error row\'s icon stays the error red (pin)').toBe('rgb(220, 38, 38)');
  expect(clip.colour, 'the info icon is not drawn in the error red').not.toBe(noSupply.colour);
  await expect(panel(page), 'with a real problem the panel doesn\'t say "No problems found"').not.toContainText('No problems found');
  expect(errors).toEqual([]);
});
