// Lab HUD 3/4 (issue #191): results and mistakes as callouts pinned to their
// parts in Edison. The pure halves, pinned here with the real simulator: the
// structured result lines a solve gives, which of them show (faults first, at
// most about 4), and where the label blocks go. What the page does with them
// (the dot on U1, following the camera, #sim-results and the mistakes panel
// kept, nothing in classic) is e2e/edison-hud-callouts.spec.js.
//
// Run with:  npm test
//
// API these tests are written against (proposed here; the builder adds it):
//
//   readings.lines()     on the object Readings.from(result, board) returns
//                        (circuit3d/js/readings.js; additive to
//                        docs/API-CONTRACT.md → "Readings"). One entry per part
//                        with something to say, faults first, then warn, then ok:
//                        [{ label, title, sub: [string…], level }]
//                        label  the part's label ("U1"), one entry per label
//                        title  the callout's caps line, e.g. "NO SUPPLY" or
//                               "BENCH SUPPLY" (case is free: CSS caps it)
//                        sub    the grey sublines: the why, or the reading
//                        level  'fault' (named by a problem that isn't info),
//                               'warn' (only by an info problem, e.g. clipped),
//                               'ok' (otherwise)
//
//   edison/result-callouts.js   UMD: window.ResultCallouts in the page,
//                               module.exports in Node (no DOM at load).
//     ResultCallouts.MAX        the clutter cap (the issue: "at most about 4")
//     ResultCallouts.pick(lines)
//                        the ones to show: at most MAX, faults first, then
//                        warn, then ok, in their given order within a level
//     ResultCallouts.layoutCallouts(items, viewport)
//                        items [{ label, x, y, w, h }]: the dot on the part
//                        (px in the viewport) and the label block's size;
//                        viewport { width, height }. Returns one entry per
//                        item, in order: { label, left, top, width, height },
//                        the label block's box (more keys, e.g. the leader's
//                        points, are fine). Boxes stay inside the viewport and
//                        never overlap.
//
// The circuit: Lab 2's starter (circuit3d/labs/lab2.sparky: U1, PS1, FG1,
// unwired) with the student's finish from test/fixtures/lab2-finish.js, but
// without the V− jumper bn_33 → j33. V+ is wired and V− isn't, so the TL072's
// own warning says it has no supply; PS1 reads series ±12 V at 0.0 mA and FG1
// a 1.00 Vp sine at 1.0 Hz (the mockup's three callouts). Loaded the way the
// editor rebuilds a saved file (load(), copied from test/textbook-figures.test.js)
// and time-stepped as the page's time run does. No mocks.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');
const { lab2FinishAll } = require('./fixtures/lab2-finish.js');

const ROOT   = path.join(__dirname, '..');
const FILE   = path.join(ROOT, 'edison', 'result-callouts.js');
const LAB2   = path.join(ROOT, 'circuit3d', 'labs', 'lab2.sparky');
const LEVELS = ['ok', 'warn', 'fault'];
const RANK   = { fault: 0, warn: 1, ok: 2 };
const V_NEG  = ['bn_33', 'j33'];   // U1's V− jumper in lab2-finish.js (V− is f33)

// Loaded per test, so a module that can't load in Node fails each test by name.
function RC() {
  assert.ok(fs.existsSync(FILE), 'edison/result-callouts.js should exist');
  let mod;
  try { mod = require(FILE); } catch (e) {
    assert.fail(`edison/result-callouts.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  return mod;
}

// The saved file as the simulator's { components, wires }, the way app.js's
// rebuildBoard places each record and redraws each wire.
function load(file) {
  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    if (!def) return null;
    const offboard = def.place.kind === 'offboard';
    const holeRefs = offboard ? null : IO.loadHoleRefs(rec);
    const comp = { type: rec.type, label: rec.label, values: rec.values || {}, holeRefs,
                   pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole,   w.endCompIdx,   w.endPin,   w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx,
             endComp: b.comp, endPinIdx: b.idx };
  });
  return { components, wires };
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

// Example parts and [from, to] wires onto a page board (a pin end as
// LABEL.k), as test/lab-sheets.test.js adds them.
function add(board, { parts = [], wires = [] }) {
  for (const p of parts) {
    board.components.push({ type: p.type, label: p.label, values: Object.assign({}, p.values), holeRefs: p.holes.map(holeRef),
                            pins: Parts.get(p.type).pins.map(() => ({ x: 0, y: 0, z: 0 })) });
  }
  const end = s => {
    const h = holeRef(s);
    if (h) return { hole: h, comp: null, idx: -1 };
    const [label, k] = String(s).split('.');
    const comp = board.components.find(c => c.label === label);
    assert.ok(comp, `wire end ${s}: the board has no ${label}`);
    return { hole: null, comp, idx: Number(k) };
  };
  for (const [from, to] of wires) {
    const a = end(from), b = end(to);
    board.wires.push({ startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx, endComp: b.comp, endPinIdx: b.idx });
  }
  return board;
}

// Lab 2's starter plus the student's finish; withVneg false leaves out the V− jumper.
function lab2(withVneg) {
  assert.ok(fs.existsSync(LAB2), 'circuit3d/labs/lab2.sparky should exist');
  const board = load(JSON.parse(fs.readFileSync(LAB2, 'utf8')));
  const u1 = board.components.find(c => c.label === 'U1');
  assert.ok(u1 && u1.type === 'tl072', 'Lab 2\'s starter has the TL072 as U1');
  const holes = Object.fromEntries(Parts.get('tl072').pins.map((pin, k) => [pin, u1.holeRefs[k].row + (u1.holeRefs[k].col + 1)]));
  const finish = lab2FinishAll(holes);
  const isVneg = ([a, b]) => a === V_NEG[0] && b === V_NEG[1];
  assert.ok(finish.wires.some(isVneg), `the finish has U1's V− jumper ${V_NEG.join(' → ')}: ${JSON.stringify(finish.wires)}`);
  return add(board, { parts: finish.parts, wires: withVneg ? finish.wires : finish.wires.filter(w => !isVneg(w)) });
}

// The page's time run (simulate.js startTimeRun): FG1 makes it one. A few
// steps at the page's dt; the last step's readings, as a plugged:sim frame has.
function solved(board, steps = 10) {
  const dt = Sim.pickDt(undefined, Sim.estimateFreqMax(board.components));
  let state = {}, result = null;
  for (let k = 1; k <= steps; k++) {
    result = Sim.analyze(board.components, board.wires, { dt, state, t: k * dt });
    if (result.state) state = result.state;
  }
  assert.strictEqual(result.status, 'ok', `Lab 2 solves (status ${result.status})`);
  return Readings.from(result, board);
}

// readings.lines(), checked for its shape.
function linesOf(readings) {
  expect(typeof readings.lines, 'readings.lines is a function on Readings.from(...)').toBe('function');
  const lines = readings.lines();
  expect(Array.isArray(lines), 'readings.lines() returns an array').toBe(true);
  for (const l of lines) {
    expect(typeof l.label, `label of ${JSON.stringify(l)}`).toBe('string');
    expect(typeof l.title, `title of ${JSON.stringify(l)}`).toBe('string');
    expect(Array.isArray(l.sub) && l.sub.every(s => typeof s === 'string'), `sub is a list of strings in ${JSON.stringify(l)}`).toBe(true);
    expect(LEVELS, `level of ${JSON.stringify(l)}`).toContain(l.level);
  }
  const labels = lines.map(l => l.label);
  expect(new Set(labels).size, `one entry per part: ${JSON.stringify(labels)}`).toBe(labels.length);
  return lines;
}

const text = l => [l.title, ...l.sub].join(' ');

test('Lab 2 with U1\'s V− unwired: readings.lines() gives U1 a fault naming the missing supply, first, and PS1 and FG1 their readings', () => {
  const readings = solved(lab2(false));
  // The physics, from the solver itself: the no-supply problem is U1's.
  expect(readings.problems().map(p => [p.kind, p.labels]), 'the mistake checker names U1 as having no supply')
    .toContainEqual(['no-supply', ['U1']]);

  const lines = linesOf(readings);
  const by = Object.fromEntries(lines.map(l => [l.label, l]));
  const seen = JSON.stringify(lines);

  expect(by.U1, `an entry for U1: ${seen}`).toBeTruthy();
  expect(by.U1.level, 'U1\'s entry is a fault').toBe('fault');
  expect(text(by.U1), 'U1\'s callout says it has no supply').toMatch(/no supply/i);
  expect(text(by.U1), 'and tells the student to wire V− (pin 4)').toMatch(/pin 4/i);

  expect(by.PS1, `an entry for PS1: ${seen}`).toBeTruthy();
  expect(by.PS1.level, 'PS1 works: ok').toBe('ok');
  expect(by.PS1.title, 'PS1\'s title names the bench supply').toMatch(/bench supply/i);
  expect(by.PS1.sub.join(' '), 'PS1\'s sublines read its ±12 V and its current').toMatch(/12\s*V[\s\S]*mA/i);

  expect(by.FG1, `an entry for FG1: ${seen}`).toBeTruthy();
  expect(by.FG1.level, 'FG1 works: ok').toBe('ok');
  expect(by.FG1.title, 'FG1\'s title names the function generator').toMatch(/function generator/i);
  expect(by.FG1.sub.join(' '), 'FG1\'s sublines read its 1.00 Vp at 1.0 Hz').toMatch(/1\.00 Vp[\s\S]*1\.0 Hz/);

  // Faults first.
  const ranks = lines.map(l => RANK[l.level]);
  expect(ranks, `faults first, then warn, then ok: ${JSON.stringify(lines.map(l => [l.label, l.level]))}`)
    .toEqual([...ranks].sort((a, b) => a - b));
  expect(lines[0].label, 'U1, the only fault, comes first').toBe('U1');
});

test('Lab 2 finished (V− wired): no entry is a fault, so the level comes from the solve', () => {
  const readings = solved(lab2(true));
  const lines = linesOf(readings);
  expect(lines.filter(l => l.level === 'fault').map(l => l.label), 'no faults on the working amplifier').toEqual([]);
  const u1 = lines.find(l => l.label === 'U1');
  if (u1) expect(text(u1), 'U1 no longer says it has no supply').not.toMatch(/no supply/i);
});

test('ResultCallouts.pick: at most MAX (about 4), faults then warn then ok, in order within a level; on Lab 2 it keeps the mockup\'s U1, PS1 and FG1', () => {
  const R = RC();
  expect(typeof R.MAX, 'ResultCallouts.MAX is a number').toBe('number');
  expect(R.MAX, 'the clutter cap is at most 4').toBeLessThanOrEqual(4);
  expect(R.MAX, 'and fits the mockup\'s three callouts').toBeGreaterThanOrEqual(3);
  expect(typeof R.pick, 'ResultCallouts.pick is a function').toBe('function');

  // Six entries, mixed, more than the cap.
  const L = (label, level) => ({ label, title: label, sub: [], level });
  const many = [L('R1', 'ok'), L('U1', 'fault'), L('PS1', 'ok'), L('LED1', 'warn'), L('U2', 'fault'), L('FG1', 'ok')];
  const want = [...many].sort((a, b) => RANK[a.level] - RANK[b.level]).slice(0, R.MAX).map(l => l.label);
  expect(R.pick(many).map(l => l.label), 'the first MAX by level, stable within a level').toEqual(want);
  expect(R.pick(many.slice(0, 2)).map(l => l.label), 'under the cap: all of them, the fault first').toEqual(['U1', 'R1']);
  expect(R.pick([]), 'nothing to show').toEqual([]);

  const shown = R.pick(linesOf(solved(lab2(false))));
  expect(shown.length, 'Lab 2 shows at most MAX callouts').toBeLessThanOrEqual(R.MAX);
  expect(shown[0] && shown[0].label, 'U1\'s fault first').toBe('U1');
  expect(shown.map(l => l.label), 'PS1 and FG1 shown too, as in the mockup').toEqual(expect.arrayContaining(['U1', 'PS1', 'FG1']));
});

test('ResultCallouts.layoutCallouts: label boxes stay inside the viewport and never overlap (clustered, at the edges, all on one point)', () => {
  const R = RC();
  expect(typeof R.layoutCallouts, 'ResultCallouts.layoutCallouts is a function').toBe('function');
  const viewport = { width: 1440, height: 900 };
  const box = (label, x, y) => ({ label, x, y, w: 260, h: 72 });
  // [case, items]
  const cases = [
    ['the mockup: U1 on the board, PS1 and FG1 stacked off its right end',
      [box('U1', 700, 520), box('PS1', 1180, 500), box('FG1', 1170, 600)]],
    ['dots near the corners and edges',
      [box('A', 1435, 5), box('B', 4, 896), box('C', 1436, 895), box('D', 3, 4)]],
    ['four dots on one point',
      [box('A', 720, 450), box('B', 720, 450), box('C', 720, 450), box('D', 720, 450)]],
  ];
  const overlap = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  for (const [name, items] of cases) {
    const out = R.layoutCallouts(items, viewport);
    expect(Array.isArray(out) && out.map(o => o.label), `${name}: one box per item, in order`).toEqual(items.map(i => i.label));
    out.forEach((o, k) => {
      const at = `${name}, ${o.label} ${JSON.stringify(o)}`;
      expect(['left', 'top', 'width', 'height'].every(key => Number.isFinite(o[key])), `${at}: a numeric box`).toBe(true);
      expect(o.width, `${at}: the item's width`).toBe(items[k].w);
      expect(o.height, `${at}: the item's height`).toBe(items[k].h);
      expect(o.left >= 0 && o.top >= 0, `${at}: inside the viewport's top left`).toBe(true);
      expect(o.left + o.width <= viewport.width && o.top + o.height <= viewport.height, `${at}: inside its bottom right`).toBe(true);
    });
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(overlap(out[i], out[j]), `${name}: ${out[i].label} ${JSON.stringify(out[i])} and ${out[j].label} ${JSON.stringify(out[j])} don't overlap`).toBe(false);
      }
    }
  }
});

// #201: a callout never draws outside the canvas. A block wider or taller
// than the viewport can't fit anywhere in it, so it comes back hidden: true
// (no box to clamp, no leader) and takes no room from the others.
test('ResultCallouts.layoutCallouts: a block that can\'t fit in the viewport comes back hidden, and the others lay out as if it weren\'t there', () => {
  const R = RC();
  const viewport = { width: 400, height: 300 };
  const fits = { label: 'A', x: 200, y: 150, w: 120, h: 48 };
  const wide = { label: 'B', x: 100, y: 100, w: 420, h: 48 };
  const tall = { label: 'C', x: 300, y: 200, w: 100, h: 320 };
  const out = R.layoutCallouts([wide, fits, tall], viewport);
  expect(Array.isArray(out) && out.map(o => o.label), 'one entry per item, in order').toEqual(['B', 'A', 'C']);
  expect(out[0].hidden, `B is wider than the viewport: hidden (${JSON.stringify(out[0])})`).toBe(true);
  expect(out[2].hidden, `C is taller than the viewport: hidden (${JSON.stringify(out[2])})`).toBe(true);
  const a = out[1];
  expect(!a.hidden, `A fits: shown (${JSON.stringify(a)})`).toBe(true);
  expect(a.left >= 0 && a.top >= 0 && a.left + a.width <= viewport.width && a.top + a.height <= viewport.height,
    `A is inside the viewport: ${JSON.stringify(a)}`).toBe(true);
  const alone = R.layoutCallouts([fits], viewport)[0];
  expect({ left: a.left, top: a.top }, 'A lands where it would alone: the hidden blocks take no room')
    .toEqual({ left: alone.left, top: alone.top });
});
