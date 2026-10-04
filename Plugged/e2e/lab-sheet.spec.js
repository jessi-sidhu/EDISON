// The lab sheet in the editor (issue #151).
// ?lab=lab1 loads Lab 1's starter and opens a
// procedure card whose steps turn Passed or Check failed live from the
// simulator. The checks' logic and the Lab 1 numbers (I(R1) 4.31 mA,
// V(R2) 5.69 V, I(R3) 1.72 mA, half-built boards) are test/lab-sheets.test.js;
// this spec is what needs a real page: the ?lab= load, the panel, Run → the
// plugged:sim event → the pills, a real inspector edit, and ?lab=lab9.
// /api/ask is stubbed and never called. Guest only; sign-in is a manual QA case.
//
// The page the builder matches (chosen here, stated so it can be built to):
// - #lab-sheet: the panel (an <aside>), shown while a lab is open; absent
//   (or hidden) otherwise. Its header shows the sheet's code ("LAB-01").
// - #lab-sheet ol > li: one per step, in step order (li k is step n = k + 1).
//   - .lab-step-status in each li: the pill, reading "Not yet", "Passed" or
//     "Check failed".
//   - .lab-step-hint in each li: the step's hint, shown only when the step
//     failed (a failed step expands it).
//   - A manual step toggles Not yet ⇄ Passed when its li is clicked.
// - The sheet never shows a step's expected value, so a failed step gives the
//   hint, never the answer.
// - ?lab=<unknown> loads nothing, opens no sheet, and puts
//   "There's no <id>" in #hint-text.
// The steps are read from the page's own LabSheets.get('lab1'), not
// restated here.
//
// Lab 2 (issue #152), the last case: ?lab=lab2&ui=edison loads
// the starter circuit3d/labs/lab2.sparky (U1, PS1 and FG1, unwired) and the
// LAB-02 sheet; the student's wires and Rin / Rf come from
// test/fixtures/lab2-finish.js, added through App.placePart and
// App.finishWire (the calls the mouse handlers make); Run, and the peak step
// turns Passed. The waits are on the sim clock (#sim-results "t = … s") and
// on what the frames have shown, never on wall time: the sheet sees one
// plugged:sim per frame, and CI draws ~3 frames a second. The 2 s run at the
// simulator's own dt, the hand-computed 9.950 V peak and the half-built
// boards are test/lab-sheets.test.js.
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { lab2FinishAll } = require('../test/fixtures/lab2-finish.js');

const LAB2_FILE = path.join(__dirname, '..', 'circuit3d', 'labs', 'lab2.sparky');
const CLOCK = /t = (\d+(?:\.\d+)?) s/;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

const labels = page => page.evaluate(() => App.state.components.map(c => c.label).sort());

async function openLab(page, query) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto(`/circuit3d/index.html?${query}`);
  await page.waitForFunction(() => window.App && App.renderer && App.state && App.state.breadboard);
}

// Lab 1's steps as the page holds them: { n, kind, label, quantity, hint }.
const lab1Steps = page => page.evaluate(() => {
  if (!window.LabSheets) return null;
  const s = LabSheets.get('lab1');
  return s && s.steps.map(st => ({ n: st.n, kind: st.check.kind, label: st.check.label || null,
                                    quantity: st.check.quantity || null, hint: st.hint }));
});

const stepItems = page => page.locator('#lab-sheet ol > li');
const stepItem  = (page, n) => stepItems(page).nth(n - 1);
const pill      = (page, n) => stepItem(page, n).locator('.lab-step-status');
const pills     = page => page.locator('#lab-sheet ol > li .lab-step-status').allTextContents();
const tidy      = list => list.map(t => t.trim());

// Render on demand (#109): world matrices are current only once a frame has
// drawn, so aim at a 3D part only after one (see e2e/bench-supply-two-channel.spec.js).
async function drawn(page) {
  const before = await page.evaluate(() => { App.requestRender(); return App.renderer.info.render.frame; });
  await page.waitForFunction(f => App.renderer.info.render.frame > f, before);
}

// Click the middle of a part's model, the way a person selects it; first
// check the point is on the canvas (not under the lab sheet) and the part is
// what the click hits.
async function clickPart(page, label) {
  await drawn(page);
  const at = await page.evaluate(l => {
    const c = App.state.components.find(x => x.label === l);
    const box = new THREE.Box3().setFromObject(c.group);
    const p = box.getCenter(new THREE.Vector3());
    App.camera.updateMatrixWorld();
    p.project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    const top = document.elementFromPoint(x, y);
    return { x, y, onCanvas: top === App.renderer.domElement, top: top ? (top.id || top.tagName) : null };
  }, label);
  expect(at.onCanvas, `${label} is on the canvas where a click reaches it (the top element there is ${at.top})`).toBe(true);
  await page.mouse.click(at.x, at.y);
}

test('?lab=lab1 loads Lab 1 and its sheet (LAB-01, every step Not yet); Run passes the measure steps; R1 at 4.7 kΩ fails the I(R1) step with its hint, not the answer', async ({ page }) => {
  test.setTimeout(90_000);   // slow CI runner (software WebGL)
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab1');

  // The lab loads: Lab 1's four parts, and the sheet with every step Not yet.
  await expect.poll(() => labels(page), { message: '?lab=lab1 loads PS1, R1, R2 and R3' }).toEqual(['PS1', 'R1', 'R2', 'R3']);
  await expect(page.locator('#lab-sheet'), 'the lab sheet opens').toBeVisible();
  await expect(page.locator('#lab-sheet')).toContainText('LAB-01');
  const steps = await lab1Steps(page);
  expect(steps, 'the page has LabSheets.get("lab1")').toBeTruthy();
  await expect(stepItems(page), 'one item per step').toHaveCount(steps.length);
  expect(tidy(await pills(page)), 'before Run, every step is Not yet').toEqual(steps.map(() => 'Not yet'));

  const r1 = steps.find(s => s.kind === 'measure' && s.label === 'R1' && s.quantity === 'I');
  expect(r1, 'a step measures I(R1)').toBeTruthy();
  await expect(stepItem(page, r1.n).locator('.lab-step-hint'), 'a step that has not failed keeps its hint folded').toBeHidden();

  // Select R1 now (Run keeps the selection), for the inspector edit below.
  await page.keyboard.press('Escape');   // select mode
  await clickPart(page, 'R1');
  await expect(page.locator('#inspector-label'), 'the click selected R1').toHaveText('R1');

  // Steps pass: Run solves Lab 1 and every checked step turns Passed; a
  // manual step waits for the student.
  await page.locator('#sim-run-btn').click();
  const checked = steps.filter(s => s.kind !== 'manual');
  await expect.poll(async () => tidy(await pills(page)).filter((_, i) => steps[i].kind !== 'manual'),
    { message: 'after Run, every measure (and part) step reads Passed' }).toEqual(checked.map(() => 'Passed'));
  for (const s of steps.filter(x => x.kind === 'manual')) await expect(pill(page, s.n)).toHaveText(/^\s*Not yet\s*$/);

  // A manual step toggles on a click.
  const manual = steps.find(s => s.kind === 'manual');
  if (manual) {
    await stepItem(page, manual.n).click();
    await expect(pill(page, manual.n), 'a click ticks the manual step').toHaveText(/^\s*Passed\s*$/);
    await stepItem(page, manual.n).click();
    await expect(pill(page, manual.n), 'a second click unticks it').toHaveText(/^\s*Not yet\s*$/);
  }

  // A wrong value fails, with a hint but not the answer: R1 at 4.7 kΩ in the
  // inspector re-solves (the simulation runs) to I(R1) = 10 / 6020 = 1.66 mA.
  const input = page.locator('#inspector .inspector-row[data-key="resistance"] input:not([type="checkbox"]):not([type="range"])');
  await input.fill('4700');
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => App.state.components.find(c => c.label === 'R1').values.resistance)).toBe(4700);
  await expect(pill(page, r1.n), 'R1 at 4.7 kΩ: the I(R1) step reads Check failed').toHaveText(/^\s*Check failed\s*$/);
  const hint = stepItem(page, r1.n).locator('.lab-step-hint');
  await expect(hint, 'the failed step shows its hint').toBeVisible();
  await expect(hint).toContainText(r1.hint);
  expect(await stepItem(page, r1.n).innerText(), 'the failed step never shows the answer').not.toContain('4.31');
  expect(errors).toEqual([]);
});

test('?lab=lab9 (no such lab): the hint "There\'s no lab9", no sheet, nothing loaded, and the editor works', async ({ page }) => {
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab9');
  await expect(page.locator('#hint-text')).toHaveText(/There['’]s no lab9/);
  await expect(page.locator('#lab-sheet'), 'an unknown lab opens no sheet').toBeHidden();
  expect(await labels(page), 'an unknown lab loads nothing').toEqual([]);
  // The editor loaded normally: a part can still be placed.
  await page.evaluate(() => App.placePart('bench_supply', App.batterySpot(), {}));
  expect(await labels(page)).toEqual(['PS1']);
  expect(errors).toEqual([]);
});

// Edison styling: the Lab HUD's black sheet (issue #194; it was the pad,
// rgb(233, 239, 226), before). The rest of the HUD look (DM Mono, the caps
// code row, the grey Not yet outline, the square close button) and the wider
// lab view are e2e/edison-hud-lab.spec.js. This case owns the failed tag:
// Lab 1 is the lab whose steps can fail. R1 goes to 4.7 kΩ through
// App.setValues, the inspector's own call (the inspector edit itself is the
// first case above).
const HUD_BLUE = 'rgb(61, 123, 255)';   // #3D7BFF: Passed
const HUD_PINK = 'rgb(255, 61, 127)';   // #FF3D7F: Check failed

test('Edison styling: ?lab=lab1&ui=edison gives the sheet the Lab HUD black rgb(16, 16, 16); after Run a Passed tag is square HUD blue, and R1 at 4.7 kΩ turns the I(R1) step\'s tag and dot HUD pink', async ({ page }) => {
  test.setTimeout(60_000);   // a Run on a slow CI runner (software WebGL)
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await openLab(page, 'lab=lab1&ui=edison');
  await expect(page.locator('#lab-sheet'), 'the lab sheet opens in Edison too').toBeVisible();
  const got = await page.evaluate(() => ({
    ui: document.documentElement.dataset.ui || null,
    background: getComputedStyle(document.getElementById('lab-sheet')).backgroundColor,
  }));
  expect.soft(got, 'Edison is on, and the sheet is the HUD black (was the pad, rgb(233, 239, 226))').toEqual({ ui: 'edison', background: 'rgb(16, 16, 16)' });

  // Run: the measure steps pass, and a Passed tag is a square blue tag.
  await expect.poll(() => labels(page), { message: '?lab=lab1 loads PS1, R1, R2 and R3' }).toEqual(['PS1', 'R1', 'R2', 'R3']);
  const steps = await lab1Steps(page);
  const r1 = steps.find(s => s.kind === 'measure' && s.label === 'R1' && s.quantity === 'I');
  expect(r1, 'a step measures I(R1)').toBeTruthy();
  await page.locator('#sim-run-btn').click();
  await expect(pill(page, r1.n), 'after Run the I(R1) step reads Passed').toHaveText(/^\s*Passed\s*$/);
  await expect.soft(pill(page, r1.n), 'a Passed tag is HUD blue').toHaveCSS('background-color', HUD_BLUE, { timeout: 2000 });
  await expect.soft(pill(page, r1.n), 'a Passed tag is square').toHaveCSS('border-radius', '0px', { timeout: 2000 });

  // Check failed: R1 at 4.7 kΩ re-solves to I(R1) = 10 / 6020 = 1.66 mA.
  await page.evaluate(() => App.setValues(App.state.components.find(c => c.label === 'R1'), { resistance: 4700 }));
  await expect(pill(page, r1.n), 'R1 at 4.7 kΩ: the I(R1) step reads Check failed').toHaveText(/^\s*Check failed\s*$/);
  await expect.soft(pill(page, r1.n), 'a Check failed tag is HUD pink').toHaveCSS('background-color', HUD_PINK, { timeout: 2000 });
  await expect.soft(pill(page, r1.n), 'a Check failed tag is square').toHaveCSS('border-radius', '0px', { timeout: 2000 });
  await expect.soft(page.locator('#lab-sheet .lab-stepper-dot').nth(r1.n - 1), 'its stepper dot is HUD pink')
    .toHaveCSS('background-color', HUD_PINK, { timeout: 2000 });
  expect(errors).toEqual([]);
});

// ── Lab 2 (issue #152) ────────────────────────────────────────

// The starter's labels as saved, read from the file the page loads.
function starterLabels() {
  expect(fs.existsSync(LAB2_FILE), `Lab 2's starter circuit is at ${path.relative(path.join(__dirname, '..'), LAB2_FILE)}`).toBe(true);
  return JSON.parse(fs.readFileSync(LAB2_FILE, 'utf8')).components.map(c => c.label).sort();
}

// Lab 2's steps as the page holds them: { n, kind, label, pin, expect, tol }.
const lab2Steps = page => page.evaluate(() => {
  if (!window.LabSheets) return null;
  const s = LabSheets.get('lab2');
  return s && s.steps.map(st => ({ n: st.n, kind: st.check.kind, label: st.check.label || null, pin: st.check.pin || null,
                                    expect: st.check.expect, tol: st.check.tol }));
});

// Adds Example parts and [from, to] wires (a hole, or LABEL.k for a pin by
// index) through App.placePart and App.finishWire, as e2e/tl072.spec.js.
function addToBoard(page, finish) {
  return page.evaluate(({ parts, wires }) => {
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
  }, finish);
}

test('?lab=lab2&ui=edison loads the Lab 2 starter (unwired) and LAB-02 with every step Not yet; finished as the inverting amplifier, Run passes the peak step once the sim clock reaches 2 s', async ({ page }) => {
  test.setTimeout(120_000);   // 2 s of sim clock and a crest frame on a slow CI runner (software WebGL)
  const errors = watchErrors(page);
  const want = starterLabels();
  expect(want, 'the starter holds the TL072 U1, the bench supply PS1 and the function generator FG1').toEqual(expect.arrayContaining(['FG1', 'PS1', 'U1']));
  await openLab(page, 'lab=lab2&ui=edison');

  // The lab loads: the starter's parts, no wires, and the sheet, every step Not yet.
  await expect.poll(() => labels(page), { message: '?lab=lab2 loads the starter\'s parts' }).toEqual(want);
  expect(await page.evaluate(() => App.state.wires.length), 'the starter is unwired').toBe(0);
  await expect(page.locator('#lab-sheet'), 'the lab sheet opens').toBeVisible();
  await expect(page.locator('#lab-sheet')).toContainText('LAB-02');
  const steps = await lab2Steps(page);
  expect(steps, 'the page has LabSheets.get("lab2")').toBeTruthy();
  await expect(stepItems(page), 'one item per step').toHaveCount(steps.length);
  expect(tidy(await pills(page)), 'before Run, every step is Not yet').toEqual(steps.map(() => 'Not yet'));
  const peak = steps.find(s => s.kind === 'peak');
  expect(peak, 'Lab 2 has a peak step').toBeTruthy();

  // The student's work: Rin, Rf and the wires (test/fixtures/lab2-finish.js),
  // laid out by the chip's own holes on the page.
  const holes = await page.evaluate(() => {
    const u1 = App.state.components.find(c => c.label === 'U1');
    return Object.fromEntries(Parts.legsOf(u1).map(l => [l.pin, l.hole]));
  });
  const finish = lab2FinishAll(holes);
  await addToBoard(page, finish);
  expect(await labels(page), 'R1 (Rin) and R2 (Rf) are placed').toEqual([...want, 'R1', 'R2'].sort());
  expect(await page.evaluate(() => App.state.wires.length), 'every wire is drawn').toBe(finish.wires.length);

  // What each frame shows: the sim clock and |V(OUT1)| from the frame's readings.
  await page.evaluate(([clock, pin]) => {
    const re = new RegExp(clock);
    window.__lab2 = [];
    document.addEventListener('plugged:sim', e => {
      const box = document.getElementById('sim-results');
      const m = box ? box.textContent.match(re) : null;
      const p = e.detail && e.detail.readings ? e.detail.readings.part('U1') : null;
      const op = p && p.opamps ? p.opamps.find(o => o.pin === pin) : null;
      window.__lab2.push({ clock: m ? Number(m[1]) : null, v: op && typeof op.vout === 'number' ? Math.abs(op.vout) : null });
    });
  }, [CLOCK.source, peak.pin]);

  await page.locator('#sim-run-btn').click();
  // The run started: its clock in #sim-results (in Edison the box folds into
  // the Details drawer, #193, so its text, not its visibility).
  await expect(page.locator('#sim-results')).toContainText(CLOCK);

  // Wait on sim time, never wall time: 2 s on the clock, and a frame that has
  // shown OUT1 at its crest (within the step's tolerance of its expected
  // peak; OUT1 peaks at 9.950 V), since the sheet sees only what the frames show.
  const crest = peak.expect * (1 - peak.tol);
  const seen = () => page.evaluate(() => {
    const fr = window.__lab2.filter(f => f.clock !== null);
    return { clock: Math.max(0, ...fr.map(f => f.clock)), top: Math.max(0, ...fr.map(f => f.v || 0)), frames: fr.length };
  });
  await expect.poll(async () => {
    const s = await seen();
    return s.clock >= 2 && s.top >= crest;
  }, { message: `the sim clock reaches 2 s and a frame shows |V(OUT1)| ≥ ${crest.toFixed(2)} V`, timeout: 90_000 }).toBe(true);
  const s = await seen();
  expect(s.top, `OUT1's largest |V| over ${s.frames} frames (an inverting −10 on 1 Vp: 9.950 V, unclipped)`).toBeLessThan(10.2);

  // The peak step reads Passed, and so does every checked step; the manual
  // ones wait for the student.
  await expect(pill(page, peak.n), `after ${s.clock} s of sim time the peak step reads Passed`).toHaveText(/^\s*Passed\s*$/);
  const checked = steps.filter(x => x.kind !== 'manual');
  expect(tidy(await pills(page)).filter((_, i) => steps[i].kind !== 'manual'), 'every checked step reads Passed').toEqual(checked.map(() => 'Passed'));
  for (const m of steps.filter(x => x.kind === 'manual')) await expect(pill(page, m.n)).toHaveText(/^\s*Not yet\s*$/);
  expect(errors).toEqual([]);
});
