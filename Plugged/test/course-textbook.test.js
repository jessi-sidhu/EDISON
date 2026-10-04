// The course hub's textbook (issue #153): three short chapters in
// edison/course-data.js (CourseData.chapters), each with live figures, the
// .sparky files under edison/figures/ that viewer.html?circuit= draws and the
// editor's ?open= loads. What the page shows (STIX body, the openers, the
// figure frames, the editor hand-off) is e2e/edison-textbook.spec.js; this is
// the data and the circuits.
//
// Run with:  npm test
//
// Shape (docs/API-CONTRACT.md → "Edison and the course hub" → Course data):
//   chapters[{ n, title, sections[{ n, title, body, figure? }] }]
// - body is a string; paragraphs are separated by a blank line ("\n\n").
//   Any inline tags in it are not words, so they are stripped before counting.
// - figure is a path relative to Plugged/, e.g. "edison/figures/ohm.sparky":
//   what viewer.html?circuit= and the editor's ?open= both take, so it must
//   pass UiFlag.allowedCircuit.
//
// The rules (from the issue; edison/DESIGN.md §3 copy, §4 lines of 75
// characters, §4a every chapter opener has a square inset live figure):
// - 3 chapters, in order: "Ohm's law and power", "Kirchhoff's laws and
//   dividers", "The op-amp"; sections numbered 1.1, 1.2 … within each.
// - Every chapter has at least one figure, each under edison/figures/, on
//   disk, and allowed by UiFlag.allowedCircuit.
// - Every figure loads the way the editor rebuilds a saved file (load(),
//   copied from test/lab1-circuit.test.js), with every part known and placed
//   where the placement rules allow, and solves in the real simulator: status
//   ok, no error, not shorted, no part warnings, Readings.problems() empty.
//   A textbook figure is a circuit that works.
// - Each chapter's figures show its subject: a resistor in chapter 1, two or
//   more resistors (a divider or a loop) in chapter 2, a TL072 in chapter 3.
// - Each chapter body is 120–400 words; each paragraph at most 120 words.
// - Copy: no "A · B · C" meta strings; no all-caps words over 3 letters
//   except codes (TL072, KCL, KVL, LED, ENSC).
//
// The module is loaded inside each test, so a broken file fails each test by
// name rather than the whole file at import.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');
const UiFlag   = require('../edison/ui-flag.js');

const ROOT = path.join(__dirname, '..');

const TITLES = ["Ohm's law and power", "Kirchhoff's laws and dividers", 'The op-amp'];

function chapters() {
  const file = path.join(ROOT, 'edison', 'course-data.js');
  let D;
  try {
    D = require(file);
  } catch (e) {
    throw new Error(`edison/course-data.js must load in Node and export CourseData (${e.message})`);
  }
  assert.ok(Array.isArray(D.chapters), 'CourseData.chapters is a list');
  return D.chapters;
}

const figuresOf = ch => [...new Set(ch.sections.map(s => s.figure).filter(f => f !== undefined))];

// Every figure, in chapter order, with the chapter it belongs to.
function allFigures() {
  const list = chapters().flatMap(ch => figuresOf(ch).map(figure => ({ chapter: ch.n, figure })));
  assert.ok(list.length > 0, 'CourseData.chapters names no figures: each chapter needs a live figure (sections[].figure)');
  return list;
}

const plain      = s => String(s).replace(/<[^>]+>/g, ' ');
const words      = s => plain(s).split(/\s+/).filter(Boolean).length;
const paragraphs = body => String(body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

// The saved file as the simulator's { components, wires }, the way app.js's
// rebuildBoard places each record and redraws each wire (test/lab1-circuit.test.js).
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

function readFigure(figure) {
  const file = path.join(ROOT, figure);
  assert.ok(fs.existsSync(file), `${figure} should exist under Plugged/`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Pin: #150 set this outline; #153 rewrites the chapters around it.
test('pin: three chapters in order, numbered 1–3, with sections numbered 1.1, 1.2 … in each', () => {
  const C = chapters();
  expect(C.map(ch => ch.title)).toEqual(TITLES);
  C.forEach((ch, i) => {
    expect(ch.n, `chapter ${i + 1} number`).toBe(i + 1);
    expect(ch.sections.length, `${ch.title} has sections`).toBeGreaterThan(0);
    expect(ch.sections.map(s => s.n), `${ch.title} section numbers`).toEqual(ch.sections.map((_, k) => `${ch.n}.${k + 1}`));
    for (const s of ch.sections) {
      expect(typeof s.title, `${s.n} title`).toBe('string');
      expect(s.title.trim().length, `${s.n} title`).toBeGreaterThan(0);
      expect(typeof s.body, `${s.n} body is a string (paragraphs split by a blank line)`).toBe('string');
    }
  });
});

test('every chapter has a live figure: a .sparky under edison/figures/ that UiFlag.allowedCircuit allows and that exists on disk', () => {
  for (const ch of chapters()) {
    const figs = figuresOf(ch);
    expect(figs.length, `"${ch.title}" has at least one figure (its opener's square inset)`).toBeGreaterThan(0);
    for (const f of figs) {
      expect(f, `${ch.title}: figure path`).toMatch(/^edison\/figures\/[\w-]+\.sparky$/);
      expect(UiFlag.allowedCircuit(f), `${f} passes UiFlag.allowedCircuit (viewer ?circuit= and editor ?open=)`).toBe(true);
      expect(fs.existsSync(path.join(ROOT, f)), `${f} exists under Plugged/`).toBe(true);
    }
  }
});

test('every figure loads with known parts in legal holes and solves clean: status ok, no error, no short, no warnings, no mistakes', () => {
  for (const { figure } of allFigures()) {
    const file = readFigure(figure);
    expect(Array.isArray(file.components) && file.components.length, `${figure} has parts`).toBeGreaterThan(0);
    for (const rec of file.components) expect(Parts.get(rec.type), `${figure}: ${rec.label} is a known part (${rec.type})`).toBeTruthy();

    const board = load(file);
    expect(board.components.every(Boolean), `${figure}: every part rebuilds`).toBe(true);
    expect(IO.flagPlacements(board.components, board.wires), `${figure}: every part sits where the placement rules allow`).toEqual([]);

    const result = Sim.analyze(board.components, board.wires);
    const lines = (result.lines || []).map(l => l.text).join(' | ');
    expect(result.error, `${figure}: no error`).toBeUndefined();
    expect(result.status, `${figure} status; lines: ${lines}`).toBe('ok');
    expect(result.shorted, `${figure} is not a short`).toBe(false);
    for (const c of board.components) {
      expect(result.parts[c.label] && result.parts[c.label].warnings, `${figure}: ${c.label} warnings`).toEqual([]);
    }
    expect(Readings.from(result, board).problems(), `${figure}: the mistake checker finds nothing`).toEqual([]);
  }
});

test("each chapter's figures show its subject: a resistor in 1, two or more resistors in 2, a TL072 in 3", () => {
  const C = chapters();
  const types = ch => figuresOf(ch).map(f => readFigure(f).components.map(c => c.type));
  const count = (list, t) => list.filter(x => x === t).length;
  const [ohm, kirchhoff, opamp] = C.map(types);
  expect(ohm.some(t => count(t, 'resistor') >= 1), `"${C[0].title}" has a figure with a resistor`).toBe(true);
  expect(kirchhoff.some(t => count(t, 'resistor') >= 2), `"${C[1].title}" has a figure with two or more resistors`).toBe(true);
  expect(opamp.some(t => count(t, 'tl072') >= 1), `"${C[2].title}" has a figure with a TL072`).toBe(true);
});

test('each chapter body is 120–400 words, and no paragraph is over 120 words', () => {
  for (const ch of chapters()) {
    const total = ch.sections.reduce((n, s) => n + words(s.body), 0);
    expect(total >= 120 && total <= 400, `"${ch.title}" is ${total} words; expected 120–400`).toBe(true);
    for (const s of ch.sections) {
      for (const p of paragraphs(s.body)) {
        expect(words(p), `${s.n} paragraph "${plain(p).slice(0, 40)}…" words`).toBeLessThanOrEqual(120);
      }
    }
  }
});

// A guard on the new copy (the #150 outline already passes it).
test('copy rules: no meta dots, no all-caps words over 3 letters except codes', () => {
  const strings = chapters().flatMap(ch => [ch.title, ...ch.sections.flatMap(s => [s.title, plain(s.body)])]);
  for (const s of strings) {
    expect(s, 'no "A · B · C" meta string').not.toMatch(/\s·\s.*\s·\s/);
    expect(s.replace(/ENSC|TL072|KCL|KVL|LED\d?/g, ''), 'no all-caps word over 3 letters').not.toMatch(/\b[A-Z]{4,}\b/);
  }
});

// Review (#153): the numbers the chapters quote come from the real figures.
test('the figures solve to the numbers the text quotes: 10 mA; 4 mA and 6 V; −5 V', () => {
  const solve = f => { const b = load(readFigure(f)); return Readings.from(Sim.analyze(b.components, b.wires), b); };
  const ohm = solve('edison/figures/ohm.sparky');
  expect(ohm.part('R1').I, 'ohm.sparky: R1 current, mA').toBeCloseTo(10, 1);
  const div = solve('edison/figures/divider.sparky');
  expect(Math.abs(div.part('R1').I), 'divider.sparky: loop current, mA').toBeCloseTo(4, 1);
  const vs = ['R1', 'R2'].map(l => Math.abs(div.part(l).V)).sort((a, b) => a - b);
  expect(vs[0], 'divider.sparky: the smaller drop, V').toBeCloseTo(4, 1);
  expect(vs[1], 'divider.sparky: the drop to the middle node, V').toBeCloseTo(6, 1);
  const inv = solve('edison/figures/inverting.sparky');
  expect(inv.part('U1').V, 'inverting.sparky: U1 output, V').toBeCloseTo(-5, 2);
});
