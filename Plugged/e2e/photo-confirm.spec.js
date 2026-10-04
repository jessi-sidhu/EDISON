// 📷 the confirm screen, part 1 (issue #141): after /api/photo answers, the
// flattened photo with a dot on every lead and wire end at its hole,
// labelled with its name (bug #178: the Reading's id); tap a dot then a hole to move
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
//                           `[data-id="<Reading id>"]`, its name (its `<b>`,
//                           bug #178: see below) and its holes (redrawn after
//                           every edit).
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
//                           the name drawn beside it (its row's name, #178;
//                           a battery's: result.labels['power:<i>']); plus (a boolean) true only on an LED's anode
//                           lead. (Power dots, #142, may be listed too, with
//                           id 'power:<i>'.)
//       .built              null until Build it, then the PhotoImport.build
//                           result handed to the build step: { actions, flags,
//                           labels, skipped }. Until #143 Build it then closes
//                           the overlay.
//   - While #photo-modal is open, keydown is swallowed in the capture phase
//     (as for the corner step).
//
// Part 2 (issue #142), in photo-confirm.js, added to the page above:
//   - Rows: #photo-parts also has one row per power entry,
//     `[data-id="power:<i>"]` (PhotoImport's key), showing its label (BAT1).
//     Every row's class follows `result` after every edit:
//       .photo-flagged      (amber) iff result.flags has an entry with that
//                           row's id; the row's text includes each such
//                           flag's `why`.
//       .photo-notbuilt     (greyed) iff result.skipped has that id; the row's
//                           text includes "not built" (e.g. an `other` IC).
//   - select.photo-value    on each resistor row. Option `value`s are ohms as
//                           plain numbers ("470", "1000"). The options include
//                           the Reading's `value`, the value its `bands`
//                           decode to, and E12 values around it, 1 kΩ
//                           included for a 470 Ω part (at least 390, 560 and
//                           1000). Selected on open: the Reading's value.
//                           A change sets the part's `value` (a number) and
//                           re-runs the build.
//   - select.photo-color    on each LED row (options exactly
//                           Object.keys(Parts.get('led').values.color.choices))
//                           and each wire row (exactly red, yellow, green,
//                           blue, black, white). Selected on open: the
//                           Reading's colour. A change sets its `color`.
//   - input.photo-volts     on each power row: min "1", max "24", showing the
//                           volts the build uses (9 when unread). A change
//                           (the `change` or `input` event) sets that entry's
//                           `volts` to the number typed, as typed: out of
//                           1–24 V, PhotoImport itself builds 9 V and flags
//                           `value` (so the row turns amber).
//   - Power dots: dots() also lists each power entry's two ends,
//                           { id: 'power:<i>', end: 0 (plus) | 1 (minus), hole, x, y }
//                           at grid.holeCentre(hole), drawn, and movable like
//                           any dot (tap it, tap a rail hole: its plus/minus
//                           `hole` follows).
//   - #photo-add            "+ Add a part": shows (in #photo-confirm) three
//                           buttons [data-add="resistor"], [data-add="led"],
//                           [data-add="wire"]. Pick one, then tap two points
//                           on the canvas: each snaps (grid.snap) to a hole,
//                           and a new part (leads in tap order) or wire (ends
//                           in tap order) with an unused id is appended to the
//                           Reading, with its own row. Her added part is not
//                           flagged (a resistor gets a real default value).
//
// Bug #178 (two rows named W1), in photo-confirm.js:
//   - Every part and wire row's name (`#photo-parts li[data-id] > b`) and its
//     label on the canvas is the Reading's own id, the one its why-text
//     (`.photo-why`) uses: never PhotoImport's build label (`labels` counts
//     only the wires it builds, so Reading W3 builds as W1 when W1 and W2
//     have an `off` end). A missing or repeated id takes PhotoImport's key
//     instead (`part<n>` / `wire<n>`, `<id>#2`), so every name is unique.
//     A battery row keeps its app label (BAT1), as in #142.
//   - The canvas labels are read from the confirm canvas's fillText calls in
//     its last draw (a spy that still draws; draw() starts with drawImage),
//     leaving out the one-character + / − / ? sign glyphs.
//
// Bug #158 (a long parts list), CSS only:
//   - However many rows #photo-parts has, the card stays inside the window:
//     #photo-confirm-canvas (at the size photo-confirm.js gives it: its box is
//     its style.width × style.height), #photo-add, the rails buttons and
//     #photo-build are fully on screen, and only #photo-parts scrolls.
const fs   = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

// The contract's mock Reading (docs/API-CONTRACT.md → "Mock Reading"): R1 from
// the + rail to a14, LED1 backwards (cathode c14, anode c17), W1 b17 → − rail.
const MOCK_READING = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;

const BB830 = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };
const lead = (hole, role = 'none') => ({ hole, pt: [0, 0], role });
const end  = hole => ({ hole, pt: [0, 0] });

// The stage board (the stage-board rule, #144): every part fully in the
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

// 📷 → Use sample photo → straight to demo-board, the one offered sample
// (#200: no picker), /api/photo answering `reading` → the confirm screen.
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

test('the mock Reading opens the confirm screen: a dot on every lead and wire end at its hole, named by its Reading id (#178), + on LED1\'s anode; ⇄ moves the +, × removes W1 and R1; keys never reach the board', async ({ page }) => {
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

  // A dot per lead / end, at its hole's centre, labelled with its Reading id (#178).
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
    expect(d.label, `${e.id}'s dots are labelled ${e.id}, its Reading id, not its build label ${want.labels[e.id]} (#178)`).toBe(e.id);
  }
  expect(dotOf(s, 'LED1', 1).hole, 'the + sits on c17, the anode').toBe('c17');

  // The list: a row per part and wire named by its Reading id (#178); ⇄ only on the LED.
  const row = id => page.locator(`#photo-parts [data-id="${id}"]`);
  for (const id of ids) {
    await expect(row(id), `a row for ${id}`).toHaveCount(1);
    await expect(row(id).locator('.photo-del'), `${id} has ×`).toHaveCount(1);
    await expect(row(id).locator('.photo-swap'), `⇄ only on the LED row (${id})`).toHaveCount(id === 'LED1' ? 1 : 0);
    await expect(row(id).locator('b'), `${id}'s row is named ${id}, not its build label ${want.labels[id]} (#178)`).toHaveText(id);
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

// ── Part 2 (#142): amber flags, not built, values and colours, battery, + Add ──

const rowOf = (page, id) => page.locator(`#photo-parts [data-id="${id}"]`);

// Every part, wire and power row is amber exactly when PhotoImport flags its
// id, and then shows each flag's why.
async function expectAmber(page, s) {
  const ids = [...s.reading.parts.map(p => p.id), ...s.reading.wires.map(w => w.id), ...s.reading.power.map((_, i) => 'power:' + i)];
  for (const id of ids) {
    const why = s.result.flags.filter(f => f.id === id).map(f => f.why);
    if (why.length) {
      await expect(rowOf(page, id), `${id} is flagged: amber`).toHaveClass(/\bphoto-flagged\b/);
      for (const w of why) await expect(rowOf(page, id), `${id}'s row says why`).toContainText(w);
    } else {
      await expect(rowOf(page, id), `${id} has no flag: not amber`).not.toHaveClass(/\bphoto-flagged\b/);
    }
  }
}

const optionValues = loc => loc.locator('option').evaluateAll(os => os.map(o => o.value));

// The Done-when Reading: one unsure LED (its + unknown) and one IC.
function unsureReading() {
  const r = stageReading();
  for (const l of ledOf(r).leads) l.role = 'unknown';
  r.parts.push({ id: 'U1', type: 'other', what: '555 timer IC', value: 0, bands: [], color: '',
                 leads: [lead('e40'), lead('f40')], box: [0, 0, 0, 0], confidence: 0.6, unsure: [] });
  return r;
}

test('#142 amber and not built: the unsure LED\'s row is amber with its reason until ⇄ settles it; the IC is listed greyed as not built', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await openConfirm(page, unsureReading());

  let s = await confirmState(page);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.flags.map(f => [f.kind, f.id]), 'the importer flags LED1\'s polarity and the IC').toEqual(expect.arrayContaining([['polarity', 'LED1'], ['type', 'U1']]));
  await expect(rowOf(page, 'LED1'), 'the unsure LED is amber').toHaveClass(/\bphoto-flagged\b/);
  await expect(rowOf(page, 'LED1'), 'with its reason').toContainText(s.result.flags.find(f => f.id === 'LED1').why);

  // The IC: listed, greyed, "not built"; built parts aren't.
  await expect(rowOf(page, 'U1'), 'the IC has a row').toHaveCount(1);
  await expect(rowOf(page, 'U1'), 'the IC is greyed').toHaveClass(/\bphoto-notbuilt\b/);
  await expect(rowOf(page, 'U1')).toContainText('not built');
  for (const id of ['R1', 'LED1', 'W1', 'W2']) await expect(rowOf(page, id), `${id} is built`).not.toHaveClass(/\bphoto-notbuilt\b/);
  await expect(rowOf(page, 'power:0'), 'a battery row').toContainText(s.result.labels['power:0']);
  await expectAmber(page, s);

  // ⇄ picks the +: the polarity flag goes, and so does the amber.
  await rowOf(page, 'LED1').locator('.photo-swap').click();
  s = await confirmState(page);
  expect(s.result.flags.filter(f => f.id === 'LED1'), 'no flag on LED1 once she picked').toEqual([]);
  await expectAmber(page, s);
  expect(errors).toEqual([]);
});

test('#142 values and colours: R1\'s dropdown offers the reading, the bands and E12 values, and 1 kΩ builds 1000 Ω; LED and wire colour dropdowns follow into the actions and Build it', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const r = stageReading();
  r.parts[0].bands = ['yellow', 'orange', 'brown', 'gold'];     // 430 Ω: the bands disagree with the 470 Ω value
  await openConfirm(page, r);

  // R1: the value dropdown.
  const value = rowOf(page, 'R1').locator('select.photo-value');
  await expect(value, 'R1 has a value dropdown').toHaveCount(1);
  expect(await optionValues(value), 'the reading\'s 470, the bands\' 430, E12 neighbours 390 / 560, and 1 kΩ').toEqual(expect.arrayContaining(['470', '430', '390', '560', '1000']));
  await expect(value, 'R1 opens on the reading\'s value').toHaveValue('470');
  await value.selectOption('1000');
  let s = await confirmState(page);
  expect(s.reading.parts[0].value).toBe(1000);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.tool === 'place_resistor'), 'R1 builds at 1 kΩ').toMatchObject({ holeA: 'a10', holeB: 'a14', resistance: 1000 });

  // LED1: the LED's own colours.
  const ledColors = await page.evaluate(() => Object.keys(window.Parts.get('led').values.color.choices));
  const led = rowOf(page, 'LED1').locator('select.photo-color');
  expect(await optionValues(led), 'LED colours are the LED part\'s').toEqual(ledColors);
  await expect(led).toHaveValue('red');
  await led.selectOption('green');

  // W2: the wire colours.
  const wire = rowOf(page, 'W2').locator('select.photo-color');
  expect(await optionValues(wire), 'wire colours').toEqual(['red', 'yellow', 'green', 'blue', 'black', 'white']);
  await expect(wire).toHaveValue('black');
  await wire.selectOption('blue');

  s = await confirmState(page);
  expect([ledOf(s.reading).color, s.reading.wires[1].color]).toEqual(['green', 'blue']);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  await expectAmber(page, s);

  await page.locator('#photo-build').click();
  s = await confirmState(page);
  const want = STAGE_ACTIONS.map(a => (a.tool === 'place_resistor' ? Object.assign({}, a, { resistance: 1000 })
    : a.tool === 'place_led' ? Object.assign({}, a, { color: 'green' })
    : a.from === 'b17' ? Object.assign({}, a, { color: 'blue' }) : a));
  expect(s.built.actions, 'Build it hands on the edited values').toEqual(want);
  expect(await refusals(page, s.built.actions)).toEqual([]);
  expect(errors).toEqual([]);
});

test('#142 battery: unread volts show 9 V in amber; 5 V builds a 5 V battery, out of 1–24 V falls back to 9 V flagged; its + / − dots sit on the rails and the + moves like any dot', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  const r = stageReading();
  r.power[0].volts = 0;                                         // unread
  await openConfirm(page, r);

  const bat = rowOf(page, 'power:0'), volts = bat.locator('input.photo-volts');
  await expect(bat, 'a battery row').toHaveCount(1);
  await expect(volts, 'unread → 9 V shown').toHaveValue('9');
  await expect(volts).toHaveAttribute('min', '1');
  await expect(volts).toHaveAttribute('max', '24');
  let s = await confirmState(page);
  expect(s.result.flags.filter(f => f.id === 'power:0').map(f => f.kind), 'unread volts are flagged').toContain('value');
  await expectAmber(page, s);

  // The + and − dots, at their rail holes.
  const at = await page.evaluate(() => ['rail:aOuter:3', 'rail:aInner:3', 'rail:aOuter:6'].map(h => window.PhotoCapture.grid.holeCentre(h)));
  for (const [end, hole, c] of [[0, 'rail:aOuter:3', at[0]], [1, 'rail:aInner:3', at[1]]]) {
    const d = dotOf(s, 'power:0', end);
    expect(d, `a dot for the battery's ${end ? '−' : '+'}`).toBeTruthy();
    expect(d.hole).toBe(hole);
    expect(Math.hypot(d.x - c[0], d.y - c[1]), `drawn at ${hole}`).toBeLessThan(1);
  }

  // 5 V.
  await volts.fill('5');
  await volts.dispatchEvent('change');
  s = await confirmState(page);
  expect(s.reading.power[0].volts).toBe(5);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions[0], 'the battery at 5 V').toEqual({ tool: 'place_battery', voltage: 5 });
  await expectAmber(page, s);

  // Out of range: PhotoImport uses 9 V and flags it.
  await volts.fill('30');
  await volts.dispatchEvent('change');
  s = await confirmState(page);
  expect(s.result.actions[0], '30 V is out of 1–24: 9 V is built').toEqual({ tool: 'place_battery', voltage: 9 });
  await expectAmber(page, s);
  await volts.fill('5');
  await volts.dispatchEvent('change');

  // Move the + dot along its rail: the battery's red lead follows.
  const before6 = await patch(page, at[2]);
  await tapFlat(page, at[0]);
  expect((await confirmState(page)).selected, 'tapping the + dot selects it').toEqual({ id: 'power:0', end: 0 });
  await tapFlat(page, at[2]);
  s = await confirmState(page);
  expect(s.reading.power[0].plus.hole).toBe('rail:aOuter:6');
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.from === 'BAT1.0'), 'the + lead now lands on tp_6').toMatchObject({ to: 'tp_6' });
  expect(s.result.actions[0]).toEqual({ tool: 'place_battery', voltage: 5 });
  expect(patchDiff(before6, await patch(page, at[2])), 'the + dot is redrawn at rail:aOuter:6').toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('#142 + Add a part: a resistor tapped onto a30 → a34 and a wire b30 → the − rail get rows and actions, unflagged; × removes the added resistor', async ({ page }) => {
  const errors = watchErrors(page);
  await openEditor(page);
  await openConfirm(page, stageReading());
  const at = await page.evaluate(() => Object.fromEntries(['a30', 'a34', 'b30', 'rail:aInner:30'].map(h => [h, window.PhotoCapture.grid.holeCentre(h)])));
  const ids = s => [...s.reading.parts.map(p => p.id), ...s.reading.wires.map(w => w.id)];
  let s = await confirmState(page);
  const before = ids(s);

  await expect(page.locator('#photo-add'), 'a + Add a part button').toBeVisible();
  await page.locator('#photo-add').click();
  for (const t of ['resistor', 'led', 'wire']) await expect(page.locator(`#photo-confirm [data-add="${t}"]`), `+ Add offers ${t}`).toBeVisible();

  // A resistor: two taps.
  await page.locator('#photo-confirm [data-add="resistor"]').click();
  await tapFlat(page, at.a30);
  await tapFlat(page, at.a34);
  s = await confirmState(page);
  const added = s.reading.parts.filter(p => !before.includes(p.id));
  expect(added.map(p => [p.type, p.leads.map(l => l.hole)]), 'one resistor added at a30 → a34').toEqual([['resistor', ['a30', 'a34']]]);
  const rid = added[0].id;
  await expect(rowOf(page, rid), 'the added resistor has a row').toHaveCount(1);
  await expect(rowOf(page, rid).locator('select.photo-value'), 'with a value dropdown').toHaveCount(1);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.tool === 'place_resistor' && a.holeA === 'a30'), 'a place_resistor at a30 → a34').toMatchObject({ holeB: 'a34', resistance: expect.any(Number) });
  expect(s.result.flags.filter(f => f.id === rid), 'her own part is not flagged').toEqual([]);
  expect(s.dots.filter(d => d.id === rid).map(d => d.hole), 'its dots are drawn').toEqual(['a30', 'a34']);

  // A wire: two taps.
  await page.locator('#photo-add').click();
  await page.locator('#photo-confirm [data-add="wire"]').click();
  await tapFlat(page, at.b30);
  await tapFlat(page, at['rail:aInner:30']);
  s = await confirmState(page);
  const wires = s.reading.wires.filter(w => !before.includes(w.id));
  expect(wires.map(w => w.ends.map(e => e.hole)), 'one wire added b30 → the a-side − rail').toEqual([['b30', 'rail:aInner:30']]);
  await expect(rowOf(page, wires[0].id), 'the added wire has a row').toHaveCount(1);
  expect(s.result).toEqual(await expectedBuild(page, s.reading));
  expect(s.result.actions.find(a => a.tool === 'add_wire' && a.from === 'b30'), 'an add_wire b30 → tn_30').toMatchObject({ to: 'tn_30' });
  expect(s.result.flags.filter(f => f.id === wires[0].id)).toEqual([]);

  // × on the added resistor.
  await rowOf(page, rid).locator('.photo-del').click();
  await expect(rowOf(page, rid)).toHaveCount(0);
  s = await confirmState(page);
  expect(s.reading.parts.map(p => p.id)).toEqual(['R1', 'LED1']);
  expect(s.result.actions.filter(a => a.tool === 'place_resistor' && a.holeA === 'a30'), 'its action is gone').toEqual([]);
  expect(await refusals(page, s.result.actions)).toEqual([]);
  expect(errors).toEqual([]);
});

// ── A long parts list (bug #158) ─────────────────────────────────────────────

// A real lab board's worth: the stage board plus a chain of ten resistors on
// the j side (f5–f8, f10–f13, … f50–f53) joined by six jumpers on row i
// (i8 → i10, i13 → i15, …): 12 parts and 8 wires, 21 rows with the battery.
// Every other resistor's value is unread, as in a live reading, so five rows
// are amber with a why line under them.
function longReading() {
  const r = stageReading();
  for (let k = 0; k < 10; k++) {
    const c = 5 + 5 * k;
    r.parts.push({ id: `R${k + 2}`, type: 'resistor', what: 'resistor', value: k % 2 ? 0 : 1000, bands: [], color: '',
                   leads: [lead(`f${c}`), lead(`f${c + 3}`)], box: [0, 0, 0, 0], confidence: 0.8, unsure: [] });
  }
  for (let k = 0; k < 6; k++) {
    const c = 5 + 5 * k;
    r.wires.push({ id: `W${k + 3}`, color: 'yellow', ends: [end(`i${c + 3}`), end(`i${c + 5}`)], confidence: 0.9, unsure: [] });
  }
  return r;
}

// A box fully inside a vw × vh window (half a pixel for rounding).
const inWindow = (b, vw, vh) => !!b && b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= vw + 0.5 && b.y + b.height <= vh + 0.5;

test('#158 a 20-item Reading at 1440×900 and 1280×720: the photo and its dots, + Add, the rails buttons and Build it stay on screen, only the parts list scrolls, and Build it builds', async ({ page }) => {
  const errors = watchErrors(page);
  const reading = longReading();
  expect(reading.parts.length + reading.wires.length, 'a Reading with at least 20 parts and wires').toBeGreaterThanOrEqual(20);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);

  let first = true;
  for (const [vw, vh] of [[1440, 900], [1280, 720]]) {
    const at = `${vw}×${vh}`;
    if (!first) {
      await page.unroute('**/api/photo');
      await page.keyboard.press('Escape');
      await expect(page.locator('#photo-modal')).toBeHidden();
      await page.setViewportSize({ width: vw, height: vh });
    }
    first = false;
    await openConfirm(page, reading);
    await expect(rowOf(page, 'W8'), `${at}: every part and wire has a row`).toHaveCount(1);

    // The photo: its top on screen, all of it inside the window, at the size photo-confirm.js gave it.
    const photo = await page.locator('#photo-confirm-canvas').boundingBox();
    expect.soft(photo.y, `${at}: the top of the photo is on screen, got y = ${photo.y}`).toBeGreaterThanOrEqual(0);
    expect.soft(inWindow(photo, vw, vh), `${at}: the photo and its dots fit in the window, got ${JSON.stringify(photo)}`).toBe(true);
    const asked = await page.locator('#photo-confirm-canvas').evaluate(c => [parseFloat(c.style.width), parseFloat(c.style.height)]);
    expect.soft([photo.width, photo.height].map(Math.round), `${at}: the photo is not scaled down`).toEqual(asked.map(Math.round));

    // The controls beside the list stay put.
    for (const id of ['#photo-build', '#photo-add', '#photo-rails-a', '#photo-rails-j']) {
      const b = await page.locator(id).boundingBox();
      expect.soft(inWindow(b, vw, vh), `${at}: ${id} is fully on screen, got ${JSON.stringify(b)}`).toBe(true);
    }

    // The list scrolls; scrolled to its end, the last row shows and the photo hasn't moved.
    const list = await page.locator('#photo-parts').evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect.soft(list.scroll, `${at}: the parts list scrolls (scrollHeight ${list.scroll} > clientHeight ${list.client})`).toBeGreaterThan(list.client);
    await page.locator('#photo-parts').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const [last, box] = [await page.locator('#photo-parts li').last().boundingBox(), await page.locator('#photo-parts').boundingBox()];
    const shown = inWindow(last, vw, vh) && last.y >= box.y - 1.5 && last.y + last.height <= box.y + box.height + 1.5;   // scrollHeight is rounded
    expect.soft(shown, `${at}: scrolled to the end, the last row ${JSON.stringify(last)} is inside the list ${JSON.stringify(box)} and the window`).toBe(true);
    expect.soft(await page.locator('#photo-confirm-canvas').boundingBox(), `${at}: scrolling the list leaves the photo where it was`).toEqual(photo);
  }

  // Build it, at 1280×720 (only once it is reachable: an off-screen button would just time out).
  if (test.info().errors.length) return;
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal'), 'Build it closes the overlay').toBeHidden();
  expect((await confirmState(page)).built, 'Build it hands on PhotoImport\'s result').toEqual(await expectedBuild(page, reading));
  expect(errors).toEqual([]);
});

// ── One name per row (bug #178) ─────────────────────────────────────────────

// The confirm canvas's text as last drawn: every fillText on
// #photo-confirm-canvas since its last drawImage (draw() starts with the
// photo). The spy still draws. Installed before the page loads.
const spyCanvasText = page => page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype, fill = P.fillText, img = P.drawImage;
  const ours = ctx => ctx.canvas && ctx.canvas.id === 'photo-confirm-canvas';
  window.__confirmText = [];
  P.drawImage = function (...a) { if (ours(this)) window.__confirmText = []; return img.apply(this, a); };
  P.fillText  = function (s, ...a) { if (ours(this)) window.__confirmText.push(String(s)); return fill.call(this, s, ...a); };
});
// Its part and wire labels: the text drawn, less the one-character signs (+, −, ?).
const canvasLabels = page => page.evaluate(() => window.__confirmText.filter(s => !/^[+\-−?]$/.test(s)));

// Every part and wire row, in list order: its name and its why-text.
const confirmRows = page => page.locator('#photo-parts li[data-id]').evaluateAll(lis => lis.map(li => ({
  name: li.querySelector(':scope > b').textContent, why: li.querySelector('.photo-why').textContent,
})));

// e02_rectifier's trap: no battery read, R1 (a10 → a14) and four wires, the
// first two with an `off` end. PhotoImport builds only W3 and W4 and numbers
// them W1 and W2 (no battery leads before them); W3's end in R1's hole a14
// moves to b14, flagged "W3: an end moved…".
function offEndsReading() {
  const off  = pt => ({ hole: 'off', pt });
  const wire = (id, ends) => ({ id, color: 'yellow', ends, confidence: 0.6, unsure: [] });
  return {
    board: { visible: true, cols: 63, rails: Object.assign({}, BB830), split: false },
    parts: [stageReading().parts[0]],
    wires: [wire('W1', [end('c5'), off([6, 40])]), wire('W2', [end('c8'), off([6, 80])]),
            wire('W3', [end('a14'), end('b20')]), wire('W4', [end('c22'), end('c26')])],
    power: [],
  };
}

test('#178 W1 and W2 with an off end, no battery: the rows and canvas labels read W1, W2, W3, W4 (not W1, W2, W1, W2), each why-text names its own row, and Build it still hands on PhotoImport\'s result', async ({ page }) => {
  const errors = watchErrors(page);
  await spyCanvasText(page);
  await openEditor(page);
  const reading = offEndsReading();
  await openConfirm(page, reading);

  // The trap, as PhotoImport builds it (unchanged by #178).
  const s = await confirmState(page);
  const want = await expectedBuild(page, reading);
  expect(s.result, 'the confirm screen\'s result is PhotoImport\'s, labels included').toEqual(want);
  expect(want.skipped.map(x => x.id), 'W1 and W2 are not built').toEqual(['W1', 'W2']);
  expect(want.labels.W3, 'PhotoImport numbers the built wires from W1, so Reading W3 builds under another name').not.toBe('W3');
  const flagged = reading.wires.map(w => w.id).filter(id => want.flags.some(f => f.id === id));
  expect(flagged, 'W1, W2 (off) and W3 (moved) have why-texts').toEqual(['W1', 'W2', 'W3']);

  // Every row named by its Reading id, in Reading order, no two alike.
  const ids  = [...reading.parts, ...reading.wires].map(x => x.id);
  const rows = await confirmRows(page);
  expect.soft(rows.map(r => r.name), 'the rows are named R1, W1, W2, W3, W4: the Reading\'s ids').toEqual(ids);

  // Each why-text names its own row, and no other.
  const named = why => ids.filter(id => new RegExp(`\\b${id}\\b`).test(why));
  expect.soft(rows.filter(r => r.why).map(r => [r.name, named(r.why)]), 'each flagged row\'s why-text names that row').toEqual(flagged.map(id => [id, [id]]));

  // The canvas: one label per part and wire, its Reading id.
  expect.soft((await canvasLabels(page)).sort(), 'the canvas labels are the Reading\'s ids, no two alike').toEqual(ids.slice().sort());

  // Build it: the built board keeps PhotoImport's labels (#178 renames nothing there).
  if (test.info().errors.length) return;
  await page.locator('#photo-build').click();
  await expect(page.locator('#photo-modal')).toBeHidden();
  expect((await confirmState(page)).built, 'Build it hands on PhotoImport\'s result').toEqual(want);
  expect(errors).toEqual([]);
});

test('#178 a repeated or missing wire id: the rows and canvas labels take PhotoImport\'s keys (W1, W1#2, wire3), so no two read the same', async ({ page }) => {
  const errors = watchErrors(page);
  await spyCanvasText(page);
  await openEditor(page);
  const reading = offEndsReading();
  const wire = (id, ends) => Object.assign(id == null ? {} : { id }, { color: 'yellow', ends, confidence: 0.6, unsure: [] });
  reading.wires = [wire('W1', [end('b14'), end('b20')]), wire('W1', [end('c22'), end('c26')]), wire(null, [end('d26'), end('d30')])];
  await openConfirm(page, reading);

  // PhotoImport's keys (docs/API-CONTRACT.md → PhotoImport → Keys): the
  // second W1 → W1#2, the third wire, with no id → wire3. All three built.
  const keys = ['R1', 'W1', 'W1#2', 'wire3'];
  const s = await confirmState(page);
  expect(s.result).toEqual(await expectedBuild(page, reading));
  expect(Object.keys(s.result.labels), 'PhotoImport keys the entries R1, W1, W1#2, wire3').toEqual(keys);

  const rows = await confirmRows(page);
  expect.soft(rows.map(r => r.name), 'the rows read R1, W1, W1#2, wire3: a repeated or missing id takes PhotoImport\'s key').toEqual(keys);
  expect.soft((await canvasLabels(page)).sort(), 'one canvas label per part and wire, by the same names').toEqual(keys.slice().sort());
  expect(errors).toEqual([]);
});
