// The 7-segment display, parts/seven_segment.js (issue #43): the first part
// made of many elements that straddles the centre gap. 10 pins, 8 diodes
// (a–g and the dot) into one internal common node, two common pins tied to
// it by closed switches. Its lit segments show a digit and the app reads the
// digit back ("shows 7"). Its definition half loads in Node through
// require('circuit3d/js/parts'); its model (lit segment bars) is checked in
// the browser by e2e/seven-segment.spec.js.
//
// Shapes these tests assume (the issue, plus choices made here and stated so
// the builder matches them):
// - Identity: type 'seven_segment'. name / sub / category / prefix / icon are
//   the builder's pick (the registry checks them). Its label is prefix + 1.
// - pins (datasheet 1–10) ['e','d','com1','c','dp','b','a','com2','f','g'].
// - place { kind: 'footprint', straddle: true, rotations [0, 180],
//   legs [[0,0],[1,0],[2,0],[3,0],[4,0],[4,-1],[3,-1],[2,-1],[1,-1],[0,-1]] }:
//   pins 1–5 in the anchor's row (f), pins 6–10 in the row above it (e),
//   columns 4..0. At f30, rotation 0: e d com1 c dp on f30..f34 and
//   b a com2 f g on e34..e30.
// - elements: 8 × D(<segment>, '#com', vf 2.0) with id = the segment name
//   ('a'…'g', 'dp'), so r.current.b is segment b's mA; SW(com1, '#com',
//   closed) and SW(com2, '#com', closed).
// - measure(r) → { segments, digit, dp } (extra fields allowed):
//     segments  the lit letters of a–g in 'abcdefg' order ('bc' for a 1),
//               never the dot;
//     dp        true when the dot is lit, else false;
//     digit     '0'–'9' from the standard table, dot ignored, or '?' when
//               nothing is lit or the pattern is no digit.
//   A segment is lit when its D is 'on' and carries at least 1 mA.
//   Table: 0 abcdef, 1 bc, 2 abdeg, 3 abcdg, 4 bcfg, 5 acdfg, 6 acdefg (or
//   cdefg), 7 abc (or abcf), 8 abcdefg, 9 abcdfg (or abcfg).
// - warnings(r, m): one line per segment over 20 mA, naming it ("segment b")
//   and its mA (e.g. "69.9 mA").
// - report(r, m) says "shows 1" for a lit 1, and a results-panel line
//   (headline or line) says it too.
// - ai: tool place_seven_segment (the default) taking { hole, direction };
//   keywords include 7 segment, seven segment, digit display, number
//   display; the guide says each segment needs its own resistor and the
//   common pins go to ground. selectTools must pick the part for the QA
//   prompt "Show the number 7 on a seven-segment display" (note the hyphen:
//   "seven segment" alone does not match "seven-segment" as a whole word).
// - examples: at least the known answer, b and c each through 470 Ω from
//   9 V, commons to ground → expect { <label>: { digit: '1' } }.
//
// Layout used below (display at f30 facing right; 470 Ω unless said):
//   top half (rows a–e):    g e30 · f e31 · com2 e32 · a e33 · b e34
//   bottom half (rows f–j): e f30 · d f31 · com1 f32 · c f33 · dp f34
//   Each segment has its own resistor to a free column fed from +:
//     g c30–c35 tp_35→a35   f b31–b36 tp_36→a36   a b33–b37 tp_37→a37
//     b c34–c39 tp_39→a39   e h30–h35 bp_35→j35   d i31–i36 bp_36→j36
//     c h33–h37 bp_37→j37   dp i34–i39 bp_39→j39
//   Commons: a32→tn_32 (com2), j32→bn_32 (com1). Rails: BAT1 on tp_63/tn_63,
//   tp_1→bp_1 and tn_1→bn_1 join the bottom rails.
//   Each lit segment: (9 − 2) / (470 + ron) ≈ 14.89 mA.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out

const Parts   = require('../circuit3d/js/parts');
const Server  = require('../backend/server.js');
const Chat    = require('../circuit3d/js/chat.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Ids     = require('../circuit3d/js/ids.js');
const Recipes = require('./fixtures/recipes.js');

const N          = Recipes.HIGHEST_COL;   // 63
const PARTS_DIR  = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const ROWS       = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const BOARD      = { cols: N, bodyRows: ROWS };
const STRADDLE   = 'a chip must sit across the centre gap (rows e and f).';
const PINS       = ['e', 'd', 'com1', 'c', 'dp', 'b', 'a', 'com2', 'f', 'g'];
const SEGMENTS   = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
const ONE_SEG_MA = (9 - 2) / 470;   // 14.894 mA before the diode's ron

function seg() {
  const def = Parts.get('seven_segment');
  assert.ok(def, "Parts.get('seven_segment') is null: parts/seven_segment.js must exist and be listed in parts/index.js");
  return def;
}
const label = () => Ids.nextLabel([], 'seven_segment');

const plain = o => JSON.parse(JSON.stringify(o));
function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
const holeNames = legs => legs.map(l => (l.row && l.col >= 0 ? l.row + (l.col + 1) : `?${l.col},${l.row}`));
const place = (legs, holeMap = new Map()) => Parts.checkPlacement('seven_segment', legs, holeMap, BOARD);
const text = r => (r.lines || []).map(l => l.text).join(' | ');

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// Each segment: its resistor's holes and the wire that feeds the far end.
const FEED = {
  g:  { r: ['c30', 'c35'], w: ['tp_35', 'a35'] },
  f:  { r: ['b31', 'b36'], w: ['tp_36', 'a36'] },
  a:  { r: ['b33', 'b37'], w: ['tp_37', 'a37'] },
  b:  { r: ['c34', 'c39'], w: ['tp_39', 'a39'] },
  e:  { r: ['h30', 'h35'], w: ['bp_35', 'j35'] },
  d:  { r: ['i31', 'i36'], w: ['bp_36', 'j36'] },
  c:  { r: ['h33', 'h37'], w: ['bp_37', 'j37'] },
  dp: { r: ['i34', 'i39'], w: ['bp_39', 'j39'] },
};
const COM2 = wire('a32', 'tn_32', 'black');
const COM1 = wire('j32', 'bn_32', 'black');

// The battery, the rail jumpers and the display at f30 facing right.
const BASE = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
  wire('tp_1', 'bp_1', 'red'),
  wire('tn_1', 'bn_1', 'black'),
  { tool: 'place_seven_segment', hole: 'f30', direction: 'right' },
];

// segs: ['b', 'c'] or { b: 100 } (segment → ohms). commons: which to ground.
function digitBuild(segs, { commons = ['com1', 'com2'] } = {}) {
  const ohms = Array.isArray(segs) ? Object.fromEntries(segs.map(s => [s, 470])) : segs;
  const out = BASE.slice();
  for (const [s, r] of Object.entries(ohms)) {
    out.push({ tool: 'place_resistor', holeA: FEED[s].r[0], holeB: FEED[s].r[1], resistance: r });
    out.push(wire(FEED[s].w[0], FEED[s].w[1], 'red'));
  }
  if (commons.includes('com2')) out.push(COM2);
  if (commons.includes('com1')) out.push(COM1);
  return out;
}

// A board that keeps real records the way App leaves them (as in
// test/parts-potentiometer.test.js), so Sim.analyze can solve it.
function simBoard() {
  let parts = [], wires = [];
  const notes = [];
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
  const valuesFor = (type, given) => {
    const def = Parts.get(type);
    const v = {};
    for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
    Object.assign(v, given || {});
    for (const [key, spec] of Object.entries(def.values || {})) {
      if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
    }
    return v;
  };
  return {
    notes,
    note: t => notes.push(t),
    components: () => parts,
    batterySpot: () => ({ x: 15.8, z: -3.15 }),
    parseHole: s => holeRef(s),
    getHole: (col, row) => (ROWS.includes(row) || ['tp', 'tn', 'bp', 'bn'].includes(row)) && col >= 0 && col < N
      ? { col, row } : null,
    holeMap: () => BoardIO.buildHoleMap(parts, wires),
    placePart(type, where, values) {
      const def = Parts.get(type);
      const rec = {
        type, label: Ids.nextLabel(parts, type),
        pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })),
        holeRefs: Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : null,
        values: valuesFor(type, values),
      };
      if (def.controls) {
        rec.controls = {};
        for (const [k, c] of Object.entries(def.controls)) rec.controls[k] = c.default;
      }
      parts.push(rec);
      return rec;
    },
    clearAll() { parts = []; wires = []; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch: fn => fn(),
    solve: () => Sim.analyze(parts, wires),
  };
}

// Applies the actions (every one must apply) and solves.
function solveBuild(actions) {
  seg();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  return { board, r };
}

// The display's { r, m, warnings } in a solved circuit.
function display(r) {
  const p = r.parts && r.parts[label()];
  assert.ok(p, `analyze().parts has no ${label()}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists seven_segment.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('seven_segment.js'), `FILES should include 'seven_segment.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'seven_segment.js')), 'circuit3d/js/parts/seven_segment.js must exist');
});

test('both 3D pages load js/parts/seven_segment.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(order.includes('js/parts/seven_segment.js'), `${page} loads js/parts/seven_segment.js: ${order.join(', ')}`);
  }
});

test("pins (datasheet 1–10) ['e','d','com1','c','dp','b','a','com2','f','g'], no ref (not a source), labels prefix + 1, 2", () => {
  const def = seg();
  assert.deepStrictEqual([...def.pins], PINS);
  assert.equal(def.ref, undefined);
  assert.match(def.icon, /^<svg/);
  assert.equal(Ids.nextLabel([], 'seven_segment'), def.prefix + '1');
  assert.equal(Ids.nextLabel([{ type: 'seven_segment', label: def.prefix + '1' }], 'seven_segment'), def.prefix + '2');
});

test('place: a footprint that straddles the gap, rotations [0, 180], pins 1–5 along row f and 6–10 back along row e', () => {
  assert.deepStrictEqual(plain(seg().place), {
    kind: 'footprint',
    legs: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, -1], [3, -1], [2, -1], [1, -1], [0, -1]],
    straddle: true,
    rotations: [0, 180],
  });
});

test("elements: 8 D(<segment>, '#com', vf 2.0) with id = the segment, and SW(com1, '#com') and SW(com2, '#com') closed", () => {
  const els = seg().elements({}, {});
  const ds = els.filter(e => e.kind === 'D');
  assert.deepStrictEqual(ds.map(e => e.id).sort(), [...SEGMENTS].sort(), `one D per segment, id = its name: ${JSON.stringify(ds)}`);
  for (const d of ds) {
    assert.deepStrictEqual([...d.pins], [d.id, '#com'], `anode on the segment pin, cathode on #com: ${JSON.stringify(d)}`);
    assert.equal(d.vf, 2.0, JSON.stringify(d));
    assert.ok(d.ron > 0 && d.ron <= 1, `a small on resistance: ${JSON.stringify(d)}`);
  }
  const sws = els.filter(e => e.kind === 'SW');
  assert.deepStrictEqual(sws.map(e => [...e.pins]).sort(), [['com1', '#com'], ['com2', '#com']]);
  assert.ok(sws.every(e => e.closed === true), JSON.stringify(sws));
  assert.equal(els.length, 10, `nothing else: ${JSON.stringify(els)}`);
});

// ── measure(): the digit table, on a PartResult built by hand ─────────────
// Lit: D 'on' at 14.9 mA. Dark: 'off' at 0 mA.

function resultWith(lit) {
  const current = {}, modes = {}, pins = {};
  for (const s of SEGMENTS) { current[s] = lit.includes(s) ? 14.9 : 0; modes[s] = lit.includes(s) ? 'on' : 'off'; }
  for (const p of PINS) pins[p] = null;
  return { label: 'X1', values: {}, controls: {}, pins, current, modes, open: {} };
}
const measureOf = lit => seg().measure(resultWith(lit));

const TABLE = [
  // [lit segments, digit, segments string]
  [['a', 'b', 'c', 'd', 'e', 'f'],      '0', 'abcdef'],
  [['b', 'c'],                          '1', 'bc'],
  [['a', 'b', 'd', 'e', 'g'],           '2', 'abdeg'],
  [['a', 'b', 'c', 'd', 'g'],           '3', 'abcdg'],
  [['b', 'c', 'f', 'g'],                '4', 'bcfg'],
  [['a', 'c', 'd', 'f', 'g'],           '5', 'acdfg'],
  [['a', 'c', 'd', 'e', 'f', 'g'],      '6', 'acdefg'],
  [['c', 'd', 'e', 'f', 'g'],           '6', 'cdefg'],     // 6 without its top bar
  [['a', 'b', 'c'],                     '7', 'abc'],
  [['a', 'b', 'c', 'f'],                '7', 'abcf'],      // 7 with a hook
  [['a', 'b', 'c', 'd', 'e', 'f', 'g'], '8', 'abcdefg'],
  [['a', 'b', 'c', 'd', 'f', 'g'],      '9', 'abcdfg'],
  [['a', 'b', 'c', 'f', 'g'],           '9', 'abcfg'],     // 9 without its bottom bar
  [[],                                  '?', ''],          // nothing lit
  [['a', 'b'],                          '?', 'ab'],        // no digit
  [['g'],                               '?', 'g'],         // a lone dash is no digit
];

for (const [lit, digit, segments] of TABLE) {
  test(`measure: ${segments || 'nothing'} lit → digit '${digit}', segments '${segments}', dp false`, () => {
    const m = measureOf(lit);
    assert.equal(m.digit, digit, `digit for ${JSON.stringify(lit)}: ${JSON.stringify(m)}`);
    assert.equal(m.segments, segments, JSON.stringify(m));
    assert.equal(m.dp, false, JSON.stringify(m));
  });
}

test('measure: the dot is reported as dp and never changes the digit ("8." is 8, a lone dot is ?)', () => {
  const eight = measureOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']);
  assert.deepStrictEqual([eight.digit, eight.segments, eight.dp], ['8', 'abcdefg', true], JSON.stringify(eight));
  const dot = measureOf(['dp']);
  assert.deepStrictEqual([dot.digit, dot.segments, dot.dp], ['?', '', true], JSON.stringify(dot));
});

test("measure: a segment 'on' but under 1 mA is not lit (0.2 mA on b and c reads '?')", () => {
  const r = resultWith(['b', 'c']);
  r.current.b = 0.2;
  r.current.c = 0.2;
  const m = seg().measure(r);
  assert.deepStrictEqual([m.digit, m.segments], ['?', ''], JSON.stringify(m));
});

// ── Known answers through the simulator ───────────────────────────────────

test("known answer: b and c each through 470 Ω from 9 V, commons to ground → digit '1', 14.89 mA per segment, no warning", () => {
  const { r } = solveBuild(digitBuild(['b', 'c']));
  const { r: pr, m, warnings } = display(r);
  assert.equal(m.digit, '1', JSON.stringify(m));
  assert.equal(m.segments, 'bc');
  assert.equal(m.dp, false);
  near(pr.current.b, ONE_SEG_MA * 1000, 0.1, 'segment b mA = (9 − 2) / 470');
  near(pr.current.c, ONE_SEG_MA * 1000, 0.1, 'segment c mA');
  for (const s of ['a', 'd', 'e', 'f', 'g', 'dp']) near(pr.current[s], 0, 0.001, `segment ${s} mA (not fed)`);
  assert.deepStrictEqual(warnings, []);
  near(r.parts.BAT1.m.current, 2 * ONE_SEG_MA * 1000, 0.2, 'the battery supplies both segments');
});

test("report and the results panel say it shows 1", () => {
  const def = seg();
  const { r } = solveBuild(digitBuild(['b', 'c']));
  const { r: pr, m } = display(r);
  const line = def.report(pr, m);
  assert.match(line, /shows 1\b/, `report(): ${line}`);
  assert.ok(line.length <= 80, line);
  assert.match(text(r), /shows 1\b/, `a results-panel line: ${text(r)}`);
});

test("every digit 0–9 wired segment by segment, each through its own 470 Ω, reads back as that digit", () => {
  const WANT = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const got = {};
  for (const [digit, segs] of Object.entries(WANT)) {
    const { m, warnings } = display(solveBuild(digitBuild(segs.split(''))).r);
    got[digit] = [m.digit, m.segments, warnings.length];
  }
  const want = Object.fromEntries(Object.entries(WANT).map(([d, s]) => [d, [d, s, 0]]));
  assert.deepStrictEqual(got, want);
});

test("8 with the dot: all 8 segments fed → digit '8', dp true, battery 8 × 14.89 mA", () => {
  const { r } = solveBuild(digitBuild(SEGMENTS));
  const { m } = display(r);
  assert.deepStrictEqual([m.digit, m.segments, m.dp], ['8', 'abcdefg', true], JSON.stringify(m));
  near(r.parts.BAT1.m.current, 8 * ONE_SEG_MA * 1000, 0.8, 'battery mA');
});

// Digit 7 (a, b, c) plus the one-LED circuit at columns 2–8 on the same
// battery: 4 branches in parallel, each (9 − 2) / 470.
test('digit 7 beside an LED branch on the same battery: shows 7, the LED lights at 14.89 mA, the battery gives all four branches', () => {
  const actions = digitBuild(['a', 'b', 'c']).concat([
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    wire('tp_3', 'a2', 'red'),
    wire('a8', 'tn_8', 'black'),
  ]);
  const { r } = solveBuild(actions);
  const { r: pr, m, warnings } = display(r);
  assert.deepStrictEqual([m.digit, m.segments], ['7', 'abc'], JSON.stringify(m));
  for (const s of ['a', 'b', 'c']) near(pr.current[s], ONE_SEG_MA * 1000, 0.1, `segment ${s} mA`);
  assert.deepStrictEqual(warnings, []);
  assert.equal(r.parts.LED1.m.on, true);
  near(r.parts.LED1.m.current, 14.89, 0.05, 'LED mA');
  near(r.parts.BAT1.m.current, 4 * ONE_SEG_MA * 1000, 0.4, 'battery mA = 3 segments + the LED');
});

test("only one common grounded still works (the commons are tied inside): com2 alone → '1', com1 alone → '1'", () => {
  for (const common of ['com2', 'com1']) {
    const { r } = solveBuild(digitBuild(['b', 'c'], { commons: [common] }));
    const { r: pr, m } = display(r);
    assert.equal(m.digit, '1', `${common} alone: ${JSON.stringify(m)}`);
    near(pr.current.b, ONE_SEG_MA * 1000, 0.1, `${common} alone: segment b mA`);
  }
});

test("no common wired: b and c are fed but have no path to ground, so nothing lights ('?', '')", () => {
  const { r } = solveBuild(digitBuild(['b', 'c'], { commons: [] }));
  const { r: pr, m } = display(r);
  assert.deepStrictEqual([m.digit, m.segments, m.dp], ['?', '', false], JSON.stringify(m));
  near(pr.current.b, 0, 0.001, 'segment b mA');
  assert.doesNotMatch(text(r), /shows [0-9]/, text(r));
});

test('wrong polarity: commons on +, b and c through 470 Ω to −, nothing lights (common-cathode diodes are reversed)', () => {
  const actions = BASE.concat([
    { tool: 'place_resistor', holeA: 'c34', holeB: 'c39' },
    wire('a39', 'tn_39', 'black'),          // b's resistor to −
    { tool: 'place_resistor', holeA: 'h33', holeB: 'h37' },
    wire('j37', 'bn_37', 'black'),          // c's resistor to −
    wire('tp_32', 'a32', 'red'),            // com2 to +
    wire('bp_32', 'j32', 'red'),            // com1 to +
  ]);
  const { r } = solveBuild(actions);
  const { r: pr, m } = display(r);
  assert.deepStrictEqual([m.digit, m.segments], ['?', ''], JSON.stringify(m));
  for (const s of SEGMENTS) near(pr.current[s], 0, 0.001, `segment ${s} mA`);
});

test('b through 100 Ω draws about 70 mA: one warning naming segment b and its mA; c at 470 Ω is fine', () => {
  const { r } = solveBuild(digitBuild({ b: 100, c: 470 }));
  const { r: pr, m, warnings } = display(r);
  near(pr.current.b, 70, 1, 'segment b mA = (9 − 2) / 100');
  assert.equal(m.digit, '1', 'still shows 1');
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /\bsegment b\b/i, `names segment b: ${warnings[0]}`);
  assert.match(warnings[0], /\b(69|70)(\.\d+)? ?mA\b/, `gives its mA: ${warnings[0]}`);
  assert.doesNotMatch(warnings[0], /\bsegment c\b/i);
  assert.ok(warnings[0].length <= 120, warnings[0]);
  assert.ok(r.lines.some(l => /\bsegment b\b/i.test(l.text)), `the warning is a results line: ${text(r)}`);
});

// ── examples: the issue's known answer ────────────────────────────────────

test("examples: a known-answer example expects digit '1' and solves to it", () => {
  const def = seg();
  const ex = (def.examples || []).find(e => {
    const d = e.parts.find(p => p.type === 'seven_segment');
    return d && e.expect && e.expect[d.label] && e.expect[d.label].digit === '1';
  });
  assert.ok(ex, `an example expecting digit '1'; got ${JSON.stringify((def.examples || []).map(e => [e.name, e.expect]))}`);
  const rs = ex.parts.filter(p => p.type === 'resistor');
  assert.equal(rs.length, 2, `two resistors, one for b and one for c: ${ex.name}`);
  for (const p of rs) assert.equal((p.values && p.values.resistance) || 470, 470, `${p.label} is 470 Ω`);
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

test('footprintLegs at f30, rotation 0: e d com1 c dp on f30–f34, b a com2 f g on e34–e30; allowed', () => {
  seg();
  const legs = Parts.footprintLegs('seven_segment', 'f30', 0);
  assert.ok(Array.isArray(legs), `legs, got ${JSON.stringify(legs)}`);
  assert.deepStrictEqual(holeNames(legs), ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30']);
  assert.deepStrictEqual(legs.map(l => l.pin), PINS);
  assert.deepStrictEqual(place(legs), { ok: true });
});

test('footprintLegs at e34, rotation 180: pins 1–5 on e34–e30 and 6–10 on f30–f34; allowed', () => {
  seg();
  const legs = Parts.footprintLegs('seven_segment', 'e34', 180);
  assert.deepStrictEqual(holeNames(legs), ['e34', 'e33', 'e32', 'e31', 'e30', 'f30', 'f31', 'f32', 'f33', 'f34']);
  assert.deepStrictEqual(legs.map(l => l.pin), PINS);
  assert.deepStrictEqual(place(legs), { ok: true });
});

test('rotations 90 and 270 give no legs (a straddling part turns only 0 and 180)', () => {
  seg();
  assert.equal(Parts.footprintLegs('seven_segment', 'f30', 90), null);
  assert.equal(Parts.footprintLegs('seven_segment', 'f30', 270), null);
});

for (const [anchor, rot, why] of [
  ['b30', 0,   'rows a and b'],
  ['g30', 0,   'rows f and g'],
  ['j30', 0,   'rows i and j'],
  ['e30', 0,   'rows d and e (one row too high)'],
  ['a30', 0,   'the upper legs run past row a'],
  ['f34', 180, 'rows f and g, turned'],
  ['j34', 180, 'the lower legs run past row j'],
]) {
  test(`anchored at ${anchor}, rotation ${rot} (${why}): refused with the straddle message`, () => {
    seg();
    const legs = Parts.footprintLegs('seven_segment', anchor, rot);
    assert.ok(Array.isArray(legs), `legs, got ${JSON.stringify(legs)}`);
    const r = place(legs);
    assert.equal(r.ok, false, `${anchor} ${rot}: ${JSON.stringify(r)}`);
    assert.equal(r.reason, STRADDLE);
  });
}

test('a leg on a hole that is taken is refused (f32 holds a wire end)', () => {
  seg();
  const legs = Parts.footprintLegs('seven_segment', 'f30', 0);
  const r = place(legs, new Map([['f32', { wire: 0 }]]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^f32 already holds the end of a wire/);
});

test('hole map and round trip: a placed display saves one named holeRef per pin and loads back to the same legs', () => {
  const def = seg();
  const legs = Parts.footprintLegs('seven_segment', 'f30', 0);
  const comp = { type: 'seven_segment', label: def.prefix + '1', values: {}, holeRefs: legs.map(l => ({ col: l.col, row: l.row })), pins: pinsOf(10) };
  const saved = BoardIO.saveHoleRefs(comp);
  assert.deepStrictEqual(saved, legs.map(l => ({ pin: l.pin, col: l.col, row: l.row })));
  const loaded = { type: 'seven_segment', label: comp.label, holeRefs: BoardIO.loadHoleRefs({ type: 'seven_segment', label: comp.label, holeRefs: saved }) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), PINS.map((p, i) => [p, holeNames(legs)[i]]));
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('f32'), { label: comp.label, pin: 'com1' });
  assert.deepStrictEqual(map.get('e32'), { label: comp.label, pin: 'com2' });
  assert.deepStrictEqual(map.get('e33'), { label: comp.label, pin: 'a' });
  assert.equal(map.size, 10);
});

test('the AI places it through chat.js: place_seven_segment at a20 facing right is refused with the straddle message', () => {
  seg();
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_seven_segment', hole: 'a20', direction: 'right' }], board);
  assert.equal(board.components().length, 0, 'nothing placed');
  assert.ok(out.failed >= 1, JSON.stringify(out));
  assert.ok(board.notes.some(n => n.includes(STRADDLE)), `a note with the straddle message: ${JSON.stringify(board.notes)}`);
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_seven_segment tool takes { hole, direction }, both required', () => {
  const def = seg();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_seven_segment');
  const t = decl('place_seven_segment');
  assert.ok(t, `no place_seven_segment tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.hole && props.direction, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['direction', 'hole']);
});

test("ai: keywords include 7 segment, seven segment, digit display, number display; the guide says each segment needs its own resistor and the commons go to ground", () => {
  const { ai } = seg();
  for (const k of ['7 segment', 'seven segment', 'digit display', 'number display']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  assert.ok(ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.equal(typeof ai.guide, 'string');
  assert.ok(ai.guide.length <= 400, `at most 400 characters; got ${ai.guide.length}`);
  assert.match(ai.guide, /each segment needs its own resistor/i, ai.guide);
  assert.match(ai.guide, /common pins go to ground/i, ai.guide);
});

// #43 follow-up: from the compressed "e d com1 c dp on f30–f34" the model
// mis-mapped letters to columns. The guide names each pin's hole for the
// documented placement, pin then hole ("a e33", "a=e33" or "a: e33").
test('the guide has a pin→hole table for hole f30 facing right: all 10 pins, each with its hole, in ≤ 400 characters', () => {
  const { ai } = seg();
  assert.ok(ai.guide.length <= 400, `at most 400 characters; got ${ai.guide.length}`);
  assert.match(ai.guide, /\bf30\b/, ai.guide);
  assert.match(ai.guide, /\bright\b/, ai.guide);
  const legs = Parts.footprintLegs('seven_segment', 'f30', 0);
  const pairs = legs.map(l => [l.pin, l.row + (l.col + 1)]);
  assert.deepStrictEqual(pairs, [['e', 'f30'], ['d', 'f31'], ['com1', 'f32'], ['c', 'f33'], ['dp', 'f34'],
                                 ['b', 'e34'], ['a', 'e33'], ['com2', 'e32'], ['f', 'e31'], ['g', 'e30']]);
  const missing = pairs.filter(([pin, hole]) => !new RegExp(`(^|[^a-z0-9])${pin}\\s*[:=]?\\s*${hole}(?![0-9])`).test(ai.guide))
    .map(([pin, hole]) => `${pin} ${hole}`);
  assert.deepStrictEqual(missing, [], `the guide should name each pin's hole ("${missing.join('", "')}" missing): ${ai.guide}`);
});

for (const message of [
  'Show the number 7 on a seven-segment display',   // the QA prompt, hyphenated
  'Show 5 on a 7-segment display',
  'put a 7 segment display on the board',
  'make a digit display that shows 3',
]) {
  test(`selectTools("${message}") sends place_seven_segment and place_resistor`, () => {
    seg();
    const got = toolNames(message);
    for (const n of ['place_seven_segment', 'place_resistor']) assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
  });
}

test('selectTools for the demo prompt does not send place_seven_segment', () => {
  seg();
  assert.ok(!toolNames('Build a single LED circuit with a current-limiting resistor.').includes('place_seven_segment'));
});

const SEVEN = digitBuild(['a', 'b', 'c']);

test('a correct digit-7 build has no circuit problems and passes finishAIReply untouched', () => {
  seg();
  assert.deepStrictEqual(Server.findCircuitProblems(SEVEN.map(a => ({ ...a }))), []);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: SEVEN.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, SEVEN);
  assert.equal(out.reply, 'Built it.');
});

test("the same digit-7 build, applied and simulated, shows 7", () => {
  const { r } = solveBuild(SEVEN);
  const { m } = display(r);
  assert.deepStrictEqual([m.digit, m.segments], ['7', 'abc'], JSON.stringify(m));
  assert.match(text(r), /shows 7\b/, text(r));
});

test('a digit-7 build with neither common wired: the display at f30 "is not connected between power and ground"', () => {
  seg();
  const actions = digitBuild(['a', 'b', 'c'], { commons: [] });
  const got = Server.findCircuitProblems(actions.map(a => ({ ...a })));
  assert.ok(got.some(p => /at f30 is not connected between power and ground/.test(p)), JSON.stringify(got));
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, seven_segment.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'seven_segment.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/seven_segment.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('seven_segment');
  assert.ok(def, 'window.Parts.get("seven_segment") after loading seven_segment.js');
  assert.equal(def.elements({}, {}).length, 10);
});

test("parts/seven_segment.js draws only through ctx: view.build and view.update, segment meshes named 'seg-<segment>'", () => {
  const file = path.join(PARTS_DIR, 'seven_segment.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/seven_segment.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.equal(typeof seg().view.build, 'function');
  assert.equal(typeof seg().view.update, 'function', 'view.update lights the segments');
  assert.match(src, /seg-/, "each bar is a mesh named 'seg-a' … 'seg-g', the dot 'seg-dp' (e2e/seven-segment.spec.js finds them by name)");
});

// ── docs ──────────────────────────────────────────────────────────────────

test('docs/API-CONTRACT.md has a "Pattern: multi-element straddling part" section', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'API-CONTRACT.md'), 'utf8');
  assert.match(doc, /^###\s*Pattern: multi-element straddling part/m);
});

test('docs/QA.md has one AI case for "Show the number 7 on a seven-segment display"', () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes('Show the number 7 on a seven-segment display'));
  assert.equal(rows.length, 1, 'one QA row sends the seven-segment prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
