// 📷 the confirm screen, part 1 (issue #141): after /api/photo answers, the
// flattened photo with a dot on every lead and wire end at its hole,
// labelled with the label PhotoImport gives it; tap a dot then a hole to move
// it; ⇄ swaps an LED's legs (the + mark follows); × deletes a part or wire;
// a swap + / − toggle per rail side; Build it runs PhotoImport.build on the
// confirmed Reading. /api/photo and /api/ask are stubbed in the browser; no
// AI is called. Guest only; Google sign-in stays a manual QA case.
//
// Every test uses Use sample photo (no corner taps), so the grid is the
// sample's: PhotoCapture.grid = PhotoGrid.homography(PhotoSamples['demo-board']
// .taps, 63). That grid has j on top, so the contract mock's `pt`s (drawn in
// the a-on-top frame) are NOT where its holes are: dots must sit at
// grid.holeCentre(hole), and a lead with a real hole is never re-snapped.
//
// The page the builder matches (chosen here; #142 and #143 build on it):
//   - #photo-confirm        inside #photo-modal. Shown when /api/photo answers
//                           200 with a Reading (the overlay stays open; the
//                           corner step stays hidden). Hidden otherwise.
//       #photo-confirm-canvas  the flattened photo (the image sent to
//                           /api/photo), a faint grid, the dots, the lines and
//                           their labels, all on this one canvas. The
//                           flattened image fills the canvas's whole box (no
//                           border, padding or letterbox): a click at
//                           box.x + fx · box.width / grid.width (same for y)
//                           is a tap on flattened pixel (fx, fy), grid =
//                           PhotoCapture.grid. The whole canvas fits in the
//                           1280 × 720 viewport.
//                           Tap within 0.45 pitch of a dot → it is selected
//                           (highlighted). Then tap anywhere → the dot moves
//                           to grid.snap(point).hole. Escape with a dot
//                           selected cancels the move only (the overlay stays
//                           open).
//       #photo-parts        the parts list: one row per Reading part and wire,
//                           `[data-id="<Reading id>"]`, its text including the
//                           app label it will get (PhotoImport's `labels`) and
//                           its holes (redrawn after every edit).
//                           Each row has a `.photo-del` button (×); an LED row
//                           also has a `.photo-swap` button (⇄). (The battery
//                           row, dropdowns and + Add a part are #142.)
//       #photo-rails-a, #photo-rails-j
//                           "swap + / −" for one side: swaps the printed signs
//                           of that side's two strips in the Reading
//                           (aOuter ↔ aInner, jInner ↔ jOuter).
//       #photo-build        "Build it". Disabled while any LED lacks exactly one
//                           'anode' and one 'cathode' lead (she picks the + with
//                           ⇄, which always ends with one of each).
//   - window.PhotoConfirm (a test hook, read fresh each time)
//       .reading            the Reading on screen, with every edit applied.
//                           On open, any endpoint whose hole is '?' is snapped
//                           from its pt (grid.snap); real holes are kept.
//       .result             PhotoImport.build(reading, { components: [] }),
//                           re-run after every edit.
//       .selected           { id, end } of the highlighted dot, or null.
//       .dots()             what is drawn: [{ id, end, hole, x, y, label, plus }]
//                           one per part lead and wire end (end: the index in
//                           `leads` / `ends`); x, y in flattened pixels; label
//                           result.labels[id]; plus (a boolean) true only on an LED's anode
//                           lead. (Power dots, #142, may be listed too, with
//                           id 'power:<i>'.)
//       .built              null until Build it, then the PhotoImport.build
//                           result handed to the build step: { actions, flags,
//                           labels, skipped }. Until #143 Build it then closes
//                           the overlay.
//   - While #photo-modal is open, keydown is swallowed in the capture phase
//     (as for the corner step).
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

// The contract's mock Reading (docs/API-CONTRACT.md → "Mock Reading"): R1 from
// the + rail to a14, LED1 backwards (cathode c14, anode c17), W1 b17 → − rail.
const MOCK_READING = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;

const BB830 = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };
const lead = (hole, role = 'none') => ({ hole, pt: [0, 0], role });
const end  = hole => ({ hole, pt: [0, 0] });

// The stage board (photo spec, stage-board rule): every part fully in the
// main holes, so it builds with no bridge and no flags (bridge-independent).
function stageReading() {
  return {
    board: { visible: true, cols: 63, rails: Object.assign({}, BB830), split: false },
    parts: [
      { id: 'R1', type: 'resistor', what: '470 Ω resistor', value: 470, bands: [], color: '',
        leads: [lead('a10'), lead('a14')], box: [0, 0, 0, 0], confidence: 0.8, unsure: [] },
      { id: 'LED1', type: 'led', what: 'red 5 mm LED', value: 0, bands: [], color: 'red',
        leads: [lead('c14', 'cathode'), lead('c17', 'anode')], box: [0, 0, 0, 0], confidence: 0.7, unsure: [] },
    ],
    wires: [
      { id: 'W1', color: 'red',   ends: [end('rail:aOuter:10'), end('b10')], confidence: 0.9, unsure: [] },
      { id: 'W2', color: 'black', ends: [end('b17'), end('rail:aInner:19')], confidence: 0.9, unsure: [] },
    ],
    power: [{ kind: 'battery_9v', volts: 9, plus: end('rail:aOuter:3'), minus: end('rail:aInner:3'), unsure: [] }],
  };
}

// Hand-computed from the contract's PhotoImport rules: battery, parts, then
// wires (battery leads first, W3/W4 the Reading's W1/W2), a-side + → tp.
const STAGE_ACTIONS = [
  { tool: 'place_battery', voltage: 9 },
  { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
  { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },     // cathode c14: backwards, as photographed
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3',  color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3',  color: 'black' },
  { tool: 'add_wire', from: 'tp_10',  to: 'b10',   color: 'red' },
  { tool: 'add_wire', from: 'b17',    to: 'tn_19', color: 'black' },
];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${(m.location() && m.location().url) || ''}`);
  });
  return errors;
}

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// 📷 → Use sample photo, /api/photo answering `reading` → the confirm screen.
async function openConfirm(page, reading) {
  await page.route('**/api/photo', route => route.fulfill({ json: { reading, provider: 'fixture', model: 'deepseek-flash', ms: 12 } }));
  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  await expect(page.locator('#photo-confirm'), 'the Reading opens the confirm screen').toBeVisible();
}

// The sample's grid, before it is sent: hole → flattened-image centre.
const sampleCentres = (page, holes) => page.evaluate(holes => {
  const s = window.PhotoSamples['demo-board'];
  const g = window.PhotoGrid.homography(s.taps, s.cols);
  return Object.fromEntries(holes.map(h => [h, g.holeCentre(h)]));
}, holes);

const centre = (page, hole) => page.evaluate(h => window.PhotoCapture.grid.holeCentre(h), hole);

const confirmState = page => page.evaluate(() => {
  const c = window.PhotoConfirm;
  return { reading: c.reading, result: c.result, selected: c.selected, dots: c.dots(), built: c.built };
});

const expectedBuild = (page, reading) => page.evaluate(r => window.PhotoImport.build(r, { components: [] }), reading);

// A tap on flattened pixel (fx, fy) of the confirm canvas.
async function tapFlat(page, [fx, fy]) {
  const box  = await page.locator('#photo-confirm-canvas').boundingBox();
  const size = await page.evaluate(() => ({ w: window.PhotoCapture.grid.width, h: window.PhotoCapture.grid.height }));
  await page.mouse.click(box.x + fx * box.width / size.w, box.y + fy * box.height / size.h);
}

// The canvas pixels in a 1-pitch square around a flattened point, for "the
// drawing changed there".
const patch = (page, [fx, fy]) => page.evaluate(([fx, fy]) => {
  const c = document.getElementById('photo-confirm-canvas');
  const g = window.PhotoCapture.grid;
  const k = c.width / g.width, r = Math.max(2, Math.round(g.pitch * k / 2));
  return Array.from(c.getContext('2d').getImageData(Math.round(fx * k) - r, Math.round(fy * k) - r, 2 * r, 2 * r).data);
}, [fx, fy]);
const patchDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

const dotOf  = (s, id, i) => s.dots.find(d => d.id === id && d.end === i);
const ledOf  = (r, id = 'LED1') => r.parts.find(p => p.id === id);
const holeOf = (r, id, role) => ledOf(r, id).leads.find(l => l.role === role).hole;

// Zero refusals (docs/API-CONTRACT.md → PhotoImport invariants): every
// place_* passes Parts.checkPlacement in order against the running hole map,
// wire ends included, and no hole is taken twice. → the refusals, [] when none.
const refusals = (page, actions) => page.evaluate(actions => {
  const HOLE = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/;
  const ref  = h => { const m = HOLE.exec(String(h)); if (!m) return null; return m[1] ? { col: +m[2] - 1, row: m[1] } : { col: +m[4] - 1, row: m[3] }; };
  const G = window.App.BOARD_GEOMETRY, board = { cols: G.COLS, bodyRows: G.BODY_ROWS };
  const map = new Map(), out = [];
  for (const a of actions) {
    if (a.tool === 'add_wire') {
      for (const h of [a.from, a.to]) {
        if (!ref(h)) continue;
        if (map.has(h)) out.push(`add_wire ${a.from}→${a.to}: ${h} taken twice`);
        map.set(h, { wire: true });
      }
      continue;
    }
    const def = window.Parts.all().find(d => ((d.ai && d.ai.tool) || 'place_' + d.type) === a.tool);
    if (!def) { out.push('unknown tool ' + a.tool); continue; }
    if (def.place.kind !== 'span') continue;
    const legs  = [a.holeA, a.holeB].map((h, k) => Object.assign({ pin: def.pins[k], hole: h }, ref(h)));
    const check = window.Parts.checkPlacement(def.type, legs, map, board);
    if (!check.ok) out.push(`${a.tool} ${a.holeA}/${a.holeB}: ${check.reason}`);
    for (const l of legs) map.set(l.hole, { label: def.type, pin: l.pin });
  }
  return out;
}, actions);

// ── Dots, labels, ⇄ and × ─────────────────────────────────────────────────

test('the mock Reading opens the confirm screen: a dot on every lead and wire end at its hole with PhotoImport\'s label, + on LED1\'s anode; ⇄ moves the +, × removes W1 and R1; keys never reach the board', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await page.evaluate(() => {
    const hole = s => { const { col, row } = App.parseHole(s); return App.state.breadboard.getHole(col, row); };
    App.placePart('resistor', [hole('c40'), hole('c44')]);
  });
  await openConfirm(page, MOCK_READING);

  await expect(page.locator('#photo-modal')).toBeVisible();
  await expect(page.locator('#photo-corners'), 'the sample never shows the corner step').toBeHidden();
  await expect(page.locator('#photo-build')).toBeEnabled();

  // The flattened image fills the canvas box, inside the viewport.
  const box  = await page.locator('#photo-confirm-canvas').boundingBox();
  const grid = await page.evaluate(() => ({ w: window.PhotoCapture.grid.width, h: window.PhotoCapture.grid.height }));
  expect(Math.abs(box.width / box.height - grid.w / grid.h), `canvas ${box.width}×${box.height} keeps the ${grid.w}×${grid.h} image's shape`).toBeLessThan(0.03);
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 720, `canvas ${JSON.stringify(box)} inside 1280×720`).toBe(true);

  // Real holes are kept (the mock's pts are in another frame), and the result is PhotoImport's.
  let s = await confirmState(page);
  expect(s.reading, 'nothing edited yet, no hole re-snapped').toEqual(MOCK_READING);
  const want = await expectedBuild(page, MOCK_READING);
  expect(s.result).toEqual(want);

  // A dot per lead / end, at its hole's centre, labelled as PhotoImport labels it.
  const ends = [
    ...MOCK_READING.parts.flatMap(p => p.leads.map((l, i) => ({ id: p.id, end: i, hole: l.hole, plus: p.type === 'led' && l.role === 'anode' }))),
    ...MOCK_READING.wires.flatMap(w => w.ends.map((e, i) => ({ id: w.id, end: i, hole: e.hole, plus: false }))),
  ];
  const ids = new Set(ends.map(e => e.id));
  expect(s.dots.filter(d => ids.has(d.id)).length, 'one dot per part lead and wire end').toBe(ends.length);
  const centres = await page.evaluate(holes => Object.fromEntries(holes.map(h => [h, window.PhotoCapture.grid.holeCentre(h)])), ends.map(e => e.hole));
  for (const e of ends) {
    const d = dotOf(s, e.id, e.end);
    expect(d, `a dot for ${e.id} end ${e.end}`).toBeTruthy();
    expect(d.hole).toBe(e.hole);
    expect(Math.hypot(d.x - centres[e.hole][0], d.y - centres[e.hole][1]), `${e.id} end ${e.end} drawn at ${e.hole}'s centre ${centres[e.hole]}, got ${[d.x, d.y]}`).toBeLessThan(1);
    expect(d.plus, `${e.id} end ${e.end} ${e.plus ? 'is' : 'is not'} marked +`).toBe(e.plus);
    expect(want.labels[e.id], `PhotoImport labels ${e.id} (the bridge builds R1)`).toBeTruthy();
    expect(d.label, `${e.id}'s dots are labelled ${want.labels[e.id]}`).toBe(want.labels[e.id]);
  }
  expect(dotOf(s, 'LED1', 1).hole, 'the + sits on c17, the anode').toBe('c17');

  // The list: a row per part and wire with its app label; ⇄ only on the LED.
  const row = id => page.locator(`#photo-parts [data-id="${id}"]`);
  for (const id of ids) {
    await expect(row(id), `a row for ${id}`).toHaveCount(1);
    await expect(row(id).locator('.photo-del'), `${id} has ×`).toHaveCount(1);
    await expect(row(id).locator('.photo-swap'), `⇄ only on the LED row (${id})`).toHaveCount(id === 'LED1' ? 1 : 0);
    await expect(row(id), `${id}'s row shows its label ${want.labels[id]}`).toContainText(want.labels[id]);
  }

  // Keys stay in the overlay (pin): Ctrl+Z and Backspace leave the board's R1 alone.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => App.state.components.map(c => c.label)), 'keys did not reach the board').toEqual(['R1']);
  await expect(page.locator('#photo-confirm')).toBeVisible();

  // ⇄ swaps LED1's legs: the anode is now c14, the + moves there, the action follows.
  const c14 = await centre(page, 'c14');
  const before14 = await patch(page, c14);
  await row('LED1').locator('.photo-swap').click();
  s = await confirmState(page);
  expect([holeOf(s.reading, 'LED1', 'cathode'), holeOf(s.reading, 'LED1', 'anode')], '⇄: cathode c17, anode c14').toEqual(['c17', 'c14']);
  expect(s.dots.filter(d => d.plus).map(d => d.hole), 'the + mark moved to c14').toEqual(['c14']);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.tool === 'place_led'), 'LED1 now built forwards').toMatchObject({ holeA: 'c17', holeB: 'c14' });
  await expect(row('LED1'), 'the list is redrawn after ⇄').toContainText('c14');
  expect(patchDiff(before14, await patch(page, c14)), 'the canvas redrew the + at c14').toBeGreaterThan(1);

  // × on W1: its row, dots and wire go.
  const b17 = await centre(page, 'b17');
  const before17 = await patch(page, b17);
  await row('W1').locator('.photo-del').click();
  await expect(row('W1')).toHaveCount(0);
  s = await confirmState(page);
  expect(s.reading.wires.map(w => w.id)).toEqual([]);
  expect(s.dots.filter(d => d.id === 'W1'), 'W1\'s dots are gone').toEqual([]);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.filter(a => a.tool === 'add_wire' && (a.from === 'b17' || a.to === 'b17')), 'no wire from b17').toEqual([]);
  expect(patchDiff(before17, await patch(page, b17)), 'the canvas no longer draws W1\'s dot at b17').toBeGreaterThan(1);

  // × on R1: a part goes the same way.
  await row('R1').locator('.photo-del').click();
  await expect(row('R1')).toHaveCount(0);
  s = await confirmState(page);
  expect(s.reading.parts.map(p => p.id)).toEqual(['LED1']);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.labels.R1, 'R1 is no longer built').toBeUndefined();
  expect([...s.result.flags, ...s.result.skipped].filter(f => f.id === 'R1'), 'nor flagged or skipped').toEqual([]);

  expect(errors).toEqual([]);
});

// ── Move a dot ──────────────────────────────────────────────────────────────

test('tap LED1\'s anode dot then hole c16: the Reading, the dot and the action follow; Escape cancels a move; a wire end moves along a rail; swap + / − flips a side\'s printed signs', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await openConfirm(page, MOCK_READING);
  const [c16, c17] = [await centre(page, 'c16'), await centre(page, 'c17')];

  // Tap the dot → it is selected; Escape cancels; a tap on c16 then moves nothing.
  await tapFlat(page, c17);
  expect((await confirmState(page)).selected, 'tapping the c17 dot selects LED1\'s anode').toEqual({ id: 'LED1', end: 1 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-confirm'), 'Escape with a dot selected keeps the screen open').toBeVisible();
  expect((await confirmState(page)).selected, 'Escape cancels the move').toBe(null);
  await tapFlat(page, c16);
  expect(ledOf((await confirmState(page)).reading).leads[1].hole, 'nothing selected: nothing moves').toBe('c17');

  // Tap the dot, tap c16 → it snaps there.
  await tapFlat(page, c17);
  await tapFlat(page, c16);
  let s = await confirmState(page);
  expect(s.selected, 'the move ends the selection').toBe(null);
  expect(ledOf(s.reading).leads[1], 'LED1\'s anode moved to c16').toMatchObject({ hole: 'c16', role: 'anode' });
  const d = dotOf(s, 'LED1', 1);
  expect(d.hole).toBe('c16');
  expect(Math.hypot(d.x - c16[0], d.y - c16[1]), 'the dot is redrawn at c16').toBeLessThan(1);
  expect(d.plus).toBe(true);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.tool === 'place_led')).toEqual({ tool: 'place_led', holeA: 'c14', holeB: 'c16', color: 'red' });
  await expect(page.locator('#photo-parts [data-id="LED1"]'), 'the list is redrawn after the move').toContainText('c16');

  // A wire end tapped onto another point of the − rail snaps to the rail's vocabulary.
  const [rail19, rail25] = [await centre(page, 'rail:aInner:19'), await centre(page, 'rail:aInner:25')];
  await tapFlat(page, rail19);
  expect((await confirmState(page)).selected).toEqual({ id: 'W1', end: 1 });
  await tapFlat(page, rail25);
  s = await confirmState(page);
  expect(s.reading.wires[0].ends[1].hole).toBe('rail:aInner:25');
  expect(s.result.actions.find(a => a.tool === 'add_wire' && a.from === 'b17'), 'W1 now runs to tn_25').toMatchObject({ to: 'tn_25' });

  // swap + / − on the a-side: its two strips trade printed signs.
  await page.locator('#photo-rails-a').click();
  s = await confirmState(page);
  expect(s.reading.board.rails, 'a-side swapped, j-side untouched').toEqual({ aOuter: '-', aInner: '+', jInner: '+', jOuter: '-' });
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.from === 'BAT1.0'), 'the battery\'s + lead (on aOuter) now lands on the − strip').toMatchObject({ to: 'tn_3' });

  expect(errors).toEqual([]);
});

// ── Build it ───────────────────────────────────────────────────────────────

test('Build it on the stage board: zero refusals, the expected actions and no flags are handed on, and the overlay closes', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await openConfirm(page, stageReading());
  expect((await confirmState(page)).built, 'nothing built before Build it').toBe(null);

  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay (until #143)').toBeHidden();
  const s = await confirmState(page);
  expect(s.built, 'Build it hands its result on').toBeTruthy();
  expect(s.built.actions).toEqual(STAGE_ACTIONS);
  expect(s.built.flags).toEqual([]);
  expect(await refusals(page, s.built.actions), 'zero refusals').toEqual([]);
  expect(errors).toEqual([]);
});

// ── A live Reading: '?' holes and unknown polarity ─────────────────────────

test('a live Reading: \'?\' leads and ends snap from their pt on open; Build it waits until ⇄ picks LED1\'s +, then builds with zero refusals', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const live = stageReading();
  const at = await sampleCentres(page, ['a10', 'a14', 'c14', 'c17', 'rail:aOuter:10', 'b10', 'b17', 'rail:aInner:19']);
  const nudge = h => [at[h][0] + 4, at[h][1] - 3];          // a little off-centre, as a reader marks it
  for (const p of live.parts) for (const l of p.leads) Object.assign(l, { pt: nudge(l.hole), hole: '?' });
  for (const w of live.wires) for (const e of w.ends) Object.assign(e, { pt: nudge(e.hole), hole: '?' });
  for (const l of ledOf(live).leads) l.role = 'unknown';
  await openConfirm(page, live);

  let s = await confirmState(page);
  expect(s.reading.parts.map(p => p.leads.map(l => l.hole)), 'every ? lead snapped to its hole').toEqual([['a10', 'a14'], ['c14', 'c17']]);
  expect(s.reading.wires.map(w => w.ends.map(e => e.hole)), 'every ? end snapped').toEqual([['rail:aOuter:10', 'b10'], ['b17', 'rail:aInner:19']]);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  const d = dotOf(s, 'LED1', 1);
  expect(Math.hypot(d.x - at.c17[0], d.y - at.c17[1]), 'the dot sits on c17\'s centre, not the raw pt').toBeLessThan(1);
  await expect(page.locator('#photo-build'), 'polarity unknown: Build waits for ⇄').toBeDisabled();

  await page.locator('#photo-parts [data-id="LED1"] .photo-swap').click();
  await expect(page.locator('#photo-build'), '⇄ picked the +').toBeEnabled();
  s = await confirmState(page);
  expect(ledOf(s.reading).leads.map(l => l.role).sort(), 'LED1 has one anode and one cathode').toEqual(['anode', 'cathode']);
  const anode = holeOf(s.reading, 'LED1', 'anode'), cathode = holeOf(s.reading, 'LED1', 'cathode');
  expect(s.dots.filter(x => x.plus).map(x => x.hole), 'the + is on the anode lead').toEqual([anode]);

  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal')).toBeHidden();
  s = await confirmState(page);
  const led = { tool: 'place_led', holeA: cathode, holeB: anode, color: 'red' };
  expect(s.built.actions, 'the stage actions, LED1 as confirmed').toEqual(STAGE_ACTIONS.map(a => (a.tool === 'place_led' ? led : a)));
  expect(s.built.flags, 'no polarity flag once she picked').toEqual([]);
  expect(await refusals(page, s.built.actions), 'zero refusals').toEqual([]);
  expect(errors).toEqual([]);
});

test('LED roles none/none or anode/anode: Build waits; one ⇄ gives exactly one anode and one cathode and enables Build', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  let first = true;
  for (const roles of [['none', 'none'], ['anode', 'anode']]) {
    const r = stageReading();
    ledOf(r).leads.forEach((l, i) => { l.role = roles[i]; });
    if (first) await openConfirm(page, r);
    else {
      await page.unroute('**/api/photo');
      await page.keyboard.press('Escape');
      await expect(page.locator('#photo-modal')).toBeHidden();
      await openConfirm(page, r);
    }
    first = false;
    await expect(page.locator('#photo-build'), `roles ${roles}: Build waits for ⇄`).toBeDisabled();
    await page.locator('#photo-parts [data-id="LED1"] .photo-swap').click();
    const s = await confirmState(page);
    expect(ledOf(s.reading).leads.map(l => l.role).sort(), `roles ${roles}: one ⇄ gives one anode and one cathode`).toEqual(['anode', 'cathode']);
    expect(s.dots.filter(x => x.plus).map(x => x.hole), 'the + is on the anode lead').toEqual([holeOf(s.reading, 'LED1', 'anode')]);
    await expect(page.locator('#photo-build'), `roles ${roles}: ⇄ enables Build`).toBeEnabled();
  }
  expect(errors).toEqual([]);
});
