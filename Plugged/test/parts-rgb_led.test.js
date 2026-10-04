// The RGB LED, parts/rgb_led.js (issue #42): a common-cathode LED with a red,
// a green and a blue die in one dome. Four legs in a row (the pot's footprint
// pattern), three D elements into the shared cathode (the 7-segment's
// multi-element pattern), and a dome whose colour is the mix of the three
// currents. Its definition half loads in Node through
// require('circuit3d/js/parts'); placing it by hand, Run, the dome colour
// and an AI build accepted in the page are checked by e2e/rgb-led.spec.js
// and e2e/parts.spec.js. Its worked build for the AI (ai.recipe, ai.guide) is
// test/rgb-led-recipe.test.js.
//
// Shapes these tests assume (the issue, plus choices stated here so the
// builder matches them):
// - Identity: type 'rgb_led', name 'RGB LED' (the results line and the AI's
//   problem lines say "RGB LED"), category 'Semiconductors' (beside the
//   LED), an <svg> icon, not a source. prefix 'RGB' (proposed; taken: R, RV,
//   BAT, PS, D, ZD, LED, DS, BZ, LDR, SW, S, SS, TH, LP, M, and the current
//   source's). Labels RGB1, RGB2.
// - pins ['red', 'cathode', 'green', 'blue'] (the usual leg order; the
//   cathode is the long leg).
// - place { kind: 'footprint', legs [[0,0],[1,0],[2,0],[3,0]], rotations
//   [0, 180] }, no straddle: the four legs sit in one row, each in its own
//   column, so the part always sits inside one half (a–e or f–j), never
//   across the gap. At c30 facing right (0): red c30, cathode c31, green c32,
//   blue c33. At c33 facing left (180): red c33, cathode c32, green c31,
//   blue c30.
// - elements: three D, id = the colour so r.current.red is the red die's mA:
//     { kind: 'D', id: 'red',   pins: ['red',   'cathode'], vf: 2.0, ron }
//     { kind: 'D', id: 'green', pins: ['green', 'cathode'], vf: 3.2, ron }
//     { kind: 'D', id: 'blue',  pins: ['blue',  'cathode'], vf: 3.2, ron }
//   ron is the LED's own (0.1 Ω, read from Parts.get('led').elements()).
//   No values are needed (none are checked).
// - measure(r) → { red, green, blue, color } (extra fields allowed):
//     red/green/blue  each die's forward current in mA, never negative;
//     color           '#rrggbb' (lower or upper case), the mix: rr comes only
//                     from the red die, gg only from green, bb only from
//                     blue. A die counts (is lit) when its D is 'on' and
//                     carries at least the LED's threshold, 1 mA; an unlit
//                     die gives 00. A lit die's component rises with its
//                     current, reaching full (ff) at 15 mA or above (as the
//                     LED's glow, FULL_MA 15), so 12 mA reads at least 0x99
//                     and 7 mA less than 14.9 mA. Nothing lit: '#000000'.
// - warnings(r, m): one line per die over 20 mA (≤ 120 chars), naming it
//   ("red") with its mA ("31.8 mA"); none otherwise. Never "backwards".
// - report(r, m) and a results-panel line (line(r, m), class sim-on) while
//   any die is lit: the line names the RGB LED (/RGB/) and each lit die with
//   its mA ("red 14.9 mA"). No sim-on line for it while all three are dark.
// - view: { build, update }; the dome is a mesh named 'rgb-dome' whose
//   emissive colour follows m.color (checked in the page).
// - ai: tool place_rgb_led (the default), { hole, direction }; keywords
//   include rgb led, rgb, color led, multicolor, and never plain 'led'
//   (the demo says "LED"). Not everyday.
// - examples: at least the known answer, 9 V → 470 Ω → red pin, cathode to
//   ground: red ≈ 14.9 mA, green and blue 0.
//
// Layout (RGB LED at c30 facing right: red c30, cathode c31, green c32,
// blue c33), top half, BAT1 on tp_63 / tn_63:
//   red    470 Ω b26–b30, fed tp_26 → a26
//   green  470 Ω d32–d36, fed tp_36 → a36
//   blue   470 Ω b33–b37, fed tp_37 → a37
//   cathode a31 → tn_31
// Hand-computed (ideal battery, ron 0.1 Ω):
//   red   (9 − 2.0) / 470.1  = 14.890 mA      red via 220 Ω: 7 / 220.1 = 31.80 mA
//   green (9 − 3.2) / 470.1  = 12.338 mA      red via 1 kΩ: 7 / 1000.1 = 7.00 mA
//   blue  (9 − 3.2) / 470.1  = 12.338 mA      red via 10 kΩ: 0.70 mA (under 1 mA: unlit)
//   all three: 14.890 + 2 × 12.338 = 39.57 mA from the battery
//   a red LED in series ahead of the red die: (9 − 2 − 2) / 470.2 = 10.634 mA
//   one shared 470 Ω on the cathode, red and blue fed straight from +: the
//   red die clamps the cathode at 9 − 2 = 7 V, 7 / 470.1 = 14.89 mA; blue
//   would need 3.2 V but sees 2 V, so it stays dark (0 mA).

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
const Sidebar = require('../circuit3d/js/sidebar.js');
const Recipes = require('./fixtures/recipes.js');

const N         = Recipes.HIGHEST_COL;   // 63
const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const ROWS      = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const BOARD     = { cols: N, bodyRows: ROWS };
const PINS      = ['red', 'cathode', 'green', 'blue'];
const DIES      = ['red', 'green', 'blue'];

const QA_PROMPT    = 'Make an RGB LED glow purple';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

const TAKEN = ['R', 'RV', 'BAT', 'PS', 'D', 'ZD', 'LED', 'DS', 'BZ', 'LDR', 'SW', 'S', 'SS', 'TH', 'LP', 'M'];

const RED_MA = (9 - 2.0) / 470.1 * 1000;   // 14.890
const GB_MA  = (9 - 3.2) / 470.1 * 1000;   // 12.338

function rgb() {
  const def = Parts.get('rgb_led');
  assert.ok(def, "Parts.get('rgb_led') is null: parts/rgb_led.js must exist and be listed in parts/index.js");
  return def;
}
const label = (n = 1) => rgb().prefix + n;

const plain = o => JSON.parse(JSON.stringify(o));
function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}
const text = r => (r.lines || []).map(l => l.text).join(' | ');

// '#rrggbb' → [r, g, b] (0–255 each).
function channels(color) {
  assert.match(String(color), /^#[0-9a-f]{6}$/i, `color is '#rrggbb'; got ${JSON.stringify(color)}`);
  const n = parseInt(color.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
// The dome colour's look: which components are bright (≥ 0x99) and which dark (≤ 0x40).
function looks(color, want, what) {
  const [r, g, b] = channels(color);
  const got = { r, g, b };
  for (const [k, on] of Object.entries(want)) {
    if (on) assert.ok(got[k] >= 0x99, `${what}: ${k} component bright (≥ 0x99) in ${color}`);
    else assert.ok(got[k] <= 0x40, `${what}: ${k} component dark (≤ 0x40) in ${color}`);
  }
}

function valuesFor(def, given) {
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  Object.assign(v, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
  }
  return v;
}

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
const holeNames = legs => legs.map(l => (l.row && l.col >= 0 ? l.row + (l.col + 1) : `?${l.col},${l.row}`));
const place = (legs, holeMap = new Map()) => Parts.checkPlacement('rgb_led', legs, holeMap, BOARD);

// ── Builds as AI actions, applied to a board that keeps real records ──────

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

const BATTERY = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];
const AT_C30 = { tool: 'place_rgb_led', hole: 'c30', direction: 'right' };

// Each die's resistor (at c30 facing right) and the wire feeding its far end from +.
const FEED = {
  red:   { r: ['b26', 'b30'], w: ['tp_26', 'a26'] },
  green: { r: ['d32', 'd36'], w: ['tp_36', 'a36'] },
  blue:  { r: ['b33', 'b37'], w: ['tp_37', 'a37'] },
};
const CATHODE = wire('a31', 'tn_31', 'black');

// ohms: { red: 470, blue: 470 } (a die left out is not connected).
// cathode: 'tn' (to ground, the default), 'none' (left floating).
function rgbBuild(ohms, { cathode = 'tn' } = {}) {
  const out = BATTERY.concat([AT_C30]);
  for (const [die, r] of Object.entries(ohms)) {
    out.push({ tool: 'place_resistor', holeA: FEED[die].r[0], holeB: FEED[die].r[1], resistance: r });
    out.push(wire(FEED[die].w[0], FEED[die].w[1], 'red'));
  }
  if (cathode === 'tn') out.push(CATHODE);
  return out;
}

function simBoard() {
  let parts = [], wires = [];
  const notes = [];
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });
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
        values: valuesFor(def, values),
      };
      if (def.controls) {
        rec.controls = {};
        for (const [k, c] of Object.entries(def.controls)) rec.controls[k] = c.default;
      }
      parts.push(rec);
      return rec;
    },
    setValues(comp, v) { comp.values = valuesFor(Parts.get(comp.type), Object.assign({}, comp.values, v)); },
    setControls(comp, c) { comp.controls = Object.assign({}, comp.controls, c); },
    deletePart(comp) { parts = parts.filter(p => p !== comp); },
    clearAll() { parts = []; wires = []; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch: fn => fn(),
    solve: () => Sim.analyze(parts, wires),
  };
}

function solveBuild(actions) {
  rgb();
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  assert.equal(r.shorted, false, `shorted: ${text(r)}`);
  return { board, r };
}

function part(r, lbl = label()) {
  const p = r.parts && r.parts[lbl];
  assert.ok(p, `analyze().parts has no ${lbl}; got ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return p;
}
const onLines = r => (r.lines || []).filter(l => l.cls === 'sim-on' && /RGB/.test(l.text)).map(l => l.text);

// Each die's mA, within 0.05 mA.
function dies(m, want, what) {
  for (const d of DIES) near(m[d], want[d] || 0, 0.05, `${what}: ${d} mA`);
}

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists rgb_led.js, and the file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('rgb_led.js'), `FILES should include 'rgb_led.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'rgb_led.js')), 'circuit3d/js/parts/rgb_led.js must exist');
});

test('both 3D pages load js/parts/rgb_led.js, after registry.js and before components.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = order.indexOf('js/parts/rgb_led.js');
    assert.ok(at >= 0, `${page} loads js/parts/rgb_led.js: ${order.join(', ')}`);
    assert.ok(at > order.indexOf('js/parts/registry.js'), `${page}: rgb_led.js comes after registry.js`);
    const comps = order.indexOf('js/components.js');
    if (comps >= 0) assert.ok(at < comps, `${page}: rgb_led.js comes before components.js`);
  }
});

test("identity: type 'rgb_led', name 'RGB LED', a Semiconductor, an <svg> icon, not a source, prefix 'RGB' that no other part uses", () => {
  const def = rgb();
  assert.equal(def.type, 'rgb_led');
  assert.equal(def.name, 'RGB LED');
  assert.equal(def.category, 'Semiconductors');
  assert.ok(typeof def.sub === 'string' && def.sub.length > 0 && def.sub.length <= 32, def.sub);
  assert.match(def.icon, /^<svg/);
  assert.equal(def.ref, undefined, 'an RGB LED is not a source');
  assert.equal(def.prefix, 'RGB');
  assert.ok(!TAKEN.includes(def.prefix), `prefix ${def.prefix} is one of the taken ${JSON.stringify(TAKEN)}`);
  const others = Parts.all().filter(d => d.type !== 'rgb_led').map(d => d.prefix);
  assert.ok(!others.includes(def.prefix), `prefix ${def.prefix} is already used: ${JSON.stringify(others)}`);
});

test('labels: RGB1, RGB2; resistors (R) and LEDs (LED) on the board never count toward them, nor RGB labels toward theirs', () => {
  rgb();
  assert.equal(Ids.nextLabel([], 'rgb_led'), 'RGB1');
  assert.equal(Ids.nextLabel([{ type: 'rgb_led', label: 'RGB1' }], 'rgb_led'), 'RGB2');
  const board = [{ type: 'resistor', label: 'R1' }, { type: 'led', label: 'LED1' }];
  assert.equal(Ids.nextLabel(board, 'rgb_led'), 'RGB1', 'R1 and LED1 do not bump the RGB number');
  board.push({ type: 'rgb_led', label: 'RGB1' }, { type: 'rgb_led', label: 'RGB2' });
  assert.equal(Ids.nextLabel(board, 'resistor'), 'R2', 'RGB1 is not a resistor label ("R" + "GB1")');
  assert.equal(Ids.nextLabel(board, 'led'), 'LED2');
  assert.equal(Ids.nextLabel(board, 'rgb_led'), 'RGB3');
  assert.equal(Ids.findByLabel(board, 'RGB2').type, 'rgb_led');
});

test("pins ['red', 'cathode', 'green', 'blue']; a 4-leg footprint in one row, each leg its own column, rotations [0, 180], no straddle", () => {
  const def = rgb();
  assert.deepStrictEqual([...def.pins], PINS);
  const p = plain(def.place);
  assert.deepStrictEqual({ kind: p.kind, legs: p.legs, rotations: p.rotations },
    { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0], [3, 0]], rotations: [0, 180] });
  assert.ok(!p.straddle, 'it sits in one half, not across the gap');
});

test("elements: D(red, cathode, vf 2.0), D(green, cathode, vf 3.2), D(blue, cathode, vf 3.2), id = the colour, the LED's ron", () => {
  const def = rgb();
  const els = def.elements(valuesFor(def), {});
  const ledRon = Parts.get('led').elements(valuesFor(Parts.get('led')), {})[0].ron;
  assert.ok(Array.isArray(els) && els.length === 3, `three elements; got ${JSON.stringify(els)}`);
  const byId = Object.fromEntries(els.map(e => [e.id, e]));
  for (const [id, vf] of [['red', 2.0], ['green', 3.2], ['blue', 3.2]]) {
    const e = byId[id];
    assert.ok(e, `an element with id '${id}': ${JSON.stringify(els)}`);
    assert.equal(e.kind, 'D', JSON.stringify(e));
    assert.deepStrictEqual([...e.pins], [id, 'cathode'], `anode on the ${id} pin, cathode on 'cathode': ${JSON.stringify(e)}`);
    assert.equal(e.vf, vf, JSON.stringify(e));
    assert.equal(e.ron, ledRon, `the LED's ron (${ledRon}): ${JSON.stringify(e)}`);
    assert.equal(e.vz, undefined, 'no breakdown: it is no Zener');
  }
});

// ── measure(), warnings(), on a PartResult built by hand ──────────────────
// on: { red: mA, … } with each listed die 'on' at that mA; the rest 'off' at 0.

function resultWith(on) {
  const current = {}, modes = {}, pins = { red: null, cathode: null, green: null, blue: null };
  for (const d of DIES) { current[d] = on[d] || 0; modes[d] = on[d] ? 'on' : 'off'; }
  return { label: 'RGB1', values: valuesFor(rgb()), controls: {}, pins, current, modes, open: {} };
}
const measureOf = on => rgb().measure(resultWith(on));

test('measure: red 14.9 mA alone → { red 14.9, green 0, blue 0 }, color red: rr bright, gg and bb 00', () => {
  const m = measureOf({ red: 14.9 });
  dies(m, { red: 14.9 }, 'red alone');
  const [r, g, b] = channels(m.color);
  assert.ok(r >= 0x99, `rr bright in ${m.color}`);
  assert.deepStrictEqual([g, b], [0, 0], `an unlit die gives 00: ${m.color}`);
});

test('measure: nothing lit → 0 mA each and color #000000, JSON-safe', () => {
  const m = measureOf({});
  dies(m, {}, 'dark');
  assert.equal(m.color.toLowerCase(), '#000000');
  assert.deepStrictEqual(plain(m), m, 'measure() is plain data');
});

test('measure: each die feeds only its own component: green alone → 00gg00, blue alone → 0000bb', () => {
  const g = channels(measureOf({ green: 12.3 }).color);
  assert.ok(g[1] >= 0x99 && g[0] === 0 && g[2] === 0, `green alone: ${JSON.stringify(g)}`);
  const b = channels(measureOf({ blue: 12.3 }).color);
  assert.ok(b[2] >= 0x99 && b[0] === 0 && b[1] === 0, `blue alone: ${JSON.stringify(b)}`);
});

test("measure: the LED's 1 mA threshold: a die 'on' at 0.7 mA reads 0.7 mA but is not lit (color 00)", () => {
  const m = measureOf({ red: 0.7 });
  near(m.red, 0.7, 0.001, 'red mA');
  assert.equal(m.color.toLowerCase(), '#000000', `0.7 mA is under the 1 mA threshold: ${m.color}`);
});

test('measure: the mix follows the current: red at 7 mA is dimmer than at 14.9 mA, and 20 mA is full (ff)', () => {
  const [lo] = channels(measureOf({ red: 7 }).color);
  const [hi] = channels(measureOf({ red: 14.9 }).color);
  const [full] = channels(measureOf({ red: 20 }).color);
  assert.ok(lo > 0 && lo < hi, `7 mA (${lo}) is lit but dimmer than 14.9 mA (${hi})`);
  assert.equal(full, 0xff, 'full at 15 mA or above');
});

test('measure: a negative (reverse) die current reads 0 mA, never negative', () => {
  const r = resultWith({});
  r.current.blue = -0.000002;
  assert.ok(rgb().measure(r).blue >= 0, JSON.stringify(rgb().measure(r)));
});

test('warnings: red 31.8 mA → one line naming red and 31.8 mA; green and blue at 12.3 mA say nothing', () => {
  const r = resultWith({ red: 31.8, green: 12.3, blue: 12.3 });
  const w = rgb().warnings(r, rgb().measure(r));
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.match(w[0], /\bred\b/i, w[0]);
  assert.match(w[0], /31\.8 ?mA/, w[0]);
  assert.match(w[0], /20 ?mA/, `names the 20 mA rating: ${w[0]}`);
  assert.doesNotMatch(w[0], /\bgreen\b|\bblue\b/i, w[0]);
  assert.ok(w[0].length <= 120, w[0]);
});

test('warnings: none at 20 mA or under on every die, nor with nothing lit', () => {
  for (const on of [{ red: 20, green: 20, blue: 20 }, { red: 14.9, blue: 12.3 }, {}]) {
    const r = resultWith(on);
    assert.deepStrictEqual(rgb().warnings(r, rgb().measure(r)), [], JSON.stringify(on));
  }
});

test('warnings: all three over 20 mA → three lines, one per die', () => {
  const r = resultWith({ red: 31.8, green: 26.4, blue: 26.4 });
  const w = rgb().warnings(r, rgb().measure(r));
  assert.equal(w.length, 3, JSON.stringify(w));
  for (const d of DIES) assert.ok(w.some(t => new RegExp(`\\b${d}\\b`, 'i').test(t)), `a line for ${d}: ${JSON.stringify(w)}`);
});

// ── Known answers through the simulator ───────────────────────────────────

test('known answer: 9 V → 470 Ω → red pin, cathode to ground: red 14.89 mA, green and blue 0, color red, no warnings', () => {
  const { r } = solveBuild(rgbBuild({ red: 470 }));
  const { m, warnings } = part(r);
  dies(m, { red: RED_MA }, 'red only');
  looks(m.color, { r: true, g: false, b: false }, 'red only');
  assert.deepStrictEqual(warnings, []);
  near(r.parts.BAT1.m.current, RED_MA, 0.1, 'battery mA');
});

test('report and the results panel: a sim-on line names the RGB LED and "red 14.9 mA"', () => {
  const def = rgb();
  const { r } = solveBuild(rgbBuild({ red: 470 }));
  const { r: pr, m } = part(r);
  const said = def.report(pr, m);
  assert.match(said, /\bred\b[^|]*14\.9 ?mA/i, `report(): ${said}`);
  assert.ok(said.length <= 80, said);
  const lines = onLines(r);
  assert.equal(lines.length, 1, `one sim-on line for the RGB LED: ${text(r)}`);
  assert.match(lines[0], /\bred\b[^|]*14\.9 ?mA/i, lines[0]);
});

for (const [die, want] of [['red', RED_MA], ['green', GB_MA], ['blue', GB_MA]]) {
  test(`one die at a time: 9 V → 470 Ω → ${die} pin reads ${want.toFixed(2)} mA on ${die} only, and color shows only ${die}`, () => {
    const { r } = solveBuild(rgbBuild({ [die]: 470 }));
    const { m, warnings } = part(r);
    dies(m, { [die]: want }, `${die} only`);
    looks(m.color, { r: die === 'red', g: die === 'green', b: die === 'blue' }, `${die} only`);
    assert.deepStrictEqual(warnings, []);
  });
}

test('all three dies, each through its own 470 Ω: 14.89 / 12.34 / 12.34 mA, color near white, battery 39.57 mA, no warnings', () => {
  const { r } = solveBuild(rgbBuild({ red: 470, green: 470, blue: 470 }));
  const { m, warnings } = part(r);
  dies(m, { red: RED_MA, green: GB_MA, blue: GB_MA }, 'all three');
  const [cr, cg, cb] = channels(m.color);
  assert.ok(Math.min(cr, cg, cb) >= 0x99, `every component bright: ${m.color}`);
  assert.ok(Math.max(cr, cg, cb) - Math.min(cr, cg, cb) <= 0x66, `near white, no component far from the others: ${m.color}`);
  assert.deepStrictEqual(warnings, []);
  near(r.parts.BAT1.m.current, RED_MA + 2 * GB_MA, 0.2, 'battery mA = the three dies');
});

test('purple: red and blue through 470 Ω each, green unconnected: 14.89 and 12.34 mA, color purple (rr and bb bright, gg dark)', () => {
  const { r } = solveBuild(rgbBuild({ red: 470, blue: 470 }));
  const { m, warnings } = part(r);
  dies(m, { red: RED_MA, blue: GB_MA }, 'purple');
  looks(m.color, { r: true, g: false, b: true }, 'purple');
  assert.deepStrictEqual(warnings, []);
});

test('red through 220 Ω draws 31.8 mA: one warning naming red, also a results line; green and blue at 470 Ω are fine', () => {
  const { r } = solveBuild(rgbBuild({ red: 220, green: 470, blue: 470 }));
  const { m, warnings } = part(r);
  near(m.red, 7 / 220.1 * 1000, 0.05, 'red mA');
  near(m.green, GB_MA, 0.05, 'green mA');
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /\bred\b/i);
  assert.match(warnings[0], /31\.8 ?mA/, warnings[0]);
  assert.ok(r.lines.some(l => l.text.includes(warnings[0])), `the warning is a results line: ${text(r)}`);
});

test('red through 1 kΩ (7.0 mA) is lit but dimmer in the mix than through 470 Ω; through 10 kΩ (0.70 mA) it is under 1 mA and unlit', () => {
  const [dim] = channels(part(solveBuild(rgbBuild({ red: 1000 })).r).m.color);
  const [bright] = channels(part(solveBuild(rgbBuild({ red: 470 })).r).m.color);
  assert.ok(dim > 0 && dim < bright, `1 kΩ (${dim}) dimmer than 470 Ω (${bright})`);
  const { m } = part(solveBuild(rgbBuild({ red: 10000 })).r);
  near(m.red, 0.7, 0.01, 'red mA through 10 kΩ');
  assert.equal(m.color.toLowerCase(), '#000000', m.color);
});

test('cathode left floating: red fed through 470 Ω, but nothing lights (0 mA each, #000000), no warnings, no "backwards" line, no sim-on line', () => {
  const { r } = solveBuild(rgbBuild({ red: 470, blue: 470 }, { cathode: 'none' }));
  const { m, warnings } = part(r);
  dies(m, {}, 'floating cathode');
  assert.equal(m.color.toLowerCase(), '#000000');
  assert.deepStrictEqual(warnings, []);
  assert.doesNotMatch(text(r), /backwards/i, text(r));
  assert.deepStrictEqual(onLines(r), []);
});

test('wired the wrong way round (cathode to +, red through 470 Ω to −): all dark, 0 mA each, no over-20 mA warning', () => {
  const actions = BATTERY.concat([
    AT_C30,
    { tool: 'place_resistor', holeA: 'b26', holeB: 'b30', resistance: 470 },
    wire('a26', 'tn_26', 'black'),
    wire('tp_31', 'a31', 'red'),
  ]);
  const { r } = solveBuild(actions);
  const { m, warnings } = part(r);
  dies(m, {}, 'reversed');
  assert.equal(m.color.toLowerCase(), '#000000');
  assert.ok(!warnings.some(w => /mA/.test(w)), JSON.stringify(warnings));
});

test('placed facing left (c33, rotation 180: red c33, cathode c32, green c31, blue c30), fed on its legs: red lights at 14.89 mA', () => {
  const actions = BATTERY.concat([
    { tool: 'place_rgb_led', hole: 'c33', direction: 'left' },
    { tool: 'place_resistor', holeA: 'b33', holeB: 'b37', resistance: 470 },
    wire('tp_37', 'a37', 'red'),
    wire('a32', 'tn_32', 'black'),
  ]);
  const { board, r } = solveBuild(actions);
  const c = board.components().find(p => p.type === 'rgb_led');
  assert.deepStrictEqual(Parts.legsOf(c).map(l => [l.pin, l.hole]), [['red', 'c33'], ['cathode', 'c32'], ['green', 'c31'], ['blue', 'c30']]);
  const { m } = part(r);
  dies(m, { red: RED_MA }, 'facing left');
  looks(m.color, { r: true, g: false, b: false }, 'facing left');
});

test('a plain red LED in series ahead of the red die: 10.63 mA through both ((9 − 2 − 2) / 470.2), both lit', () => {
  const actions = BATTERY.concat([
    AT_C30,
    { tool: 'place_resistor', holeA: 'd24', holeB: 'd28', resistance: 470 },
    wire('tp_24', 'a24', 'red'),
    { tool: 'place_led', holeA: 'b30', holeB: 'b28' },   // cathode b30 (the red die's column), anode b28
    CATHODE,
  ]);
  const { r } = solveBuild(actions);
  const want = 5 / 470.2 * 1000;
  dies(part(r).m, { red: want }, 'series');
  assert.equal(r.parts.LED1.m.on, true, JSON.stringify(r.parts.LED1.m));
  near(r.parts.LED1.m.current, want, 0.05, 'LED1 mA');
});

test('one shared 470 Ω on the cathode, red and blue straight from +: only red lights (14.89 mA), blue stays dark: the classic shared-resistor mistake', () => {
  const actions = BATTERY.concat([
    AT_C30,
    wire('tp_30', 'a30', 'red'),    // red pin straight to +
    wire('tp_33', 'a33', 'red'),    // blue pin straight to +
    { tool: 'place_resistor', holeA: 'b31', holeB: 'b35', resistance: 470 },
    wire('a35', 'tn_35', 'black'),
  ]);
  const { r } = solveBuild(actions);
  const { m, warnings } = part(r);
  dies(m, { red: RED_MA }, 'shared cathode resistor');
  looks(m.color, { r: true, g: false, b: false }, 'shared cathode resistor');
  assert.deepStrictEqual(warnings, []);
});

// ── examples: the issue's known answer ────────────────────────────────────

test('examples: a known-answer example, 470 Ω into the red pin on 9 V, expects red ≈ 14.9 mA and green and blue 0', () => {
  const def = rgb();
  const ex = (def.examples || []).find(e => {
    const p = e.parts.find(q => q.type === 'rgb_led');
    const want = p && e.expect && e.expect[p.label];
    return want && Array.isArray(want.red) && want.red[0] <= 14.89 && want.red[1] >= 14.89;
  });
  assert.ok(ex, `an example expecting red ≈ 14.9 mA; got ${JSON.stringify((def.examples || []).map(e => [e.name, e.expect]))}`);
  const p = ex.parts.find(q => q.type === 'rgb_led');
  const want = ex.expect[p.label];
  for (const d of ['green', 'blue']) {
    const w = want[d];
    assert.ok(w === 0 || (Array.isArray(w) && w[0] <= 0 && w[1] >= 0 && w[1] <= 0.1), `expect.${p.label}.${d} is 0: ${JSON.stringify(want)}`);
  }
  const rs = ex.parts.filter(q => q.type === 'resistor');
  assert.equal(rs.length, 1, `one resistor: ${ex.name}`);
  assert.equal((rs[0].values && rs[0].values.resistance) || 470, 470);
  assert.ok(!ex.parts.some(q => q.type === 'battery' && q.values && q.values.voltage !== 9), 'the 9 V battery');
  // test/parts-examples.test.js solves every example against its expect.
});

// ── Placement ─────────────────────────────────────────────────────────────

test('footprintLegs at c30, rotation 0: red c30, cathode c31, green c32, blue c33; allowed', () => {
  rgb();
  const legs = Parts.footprintLegs('rgb_led', 'c30', 0);
  assert.ok(Array.isArray(legs), `legs, got ${JSON.stringify(legs)}`);
  assert.deepStrictEqual(holeNames(legs), ['c30', 'c31', 'c32', 'c33']);
  assert.deepStrictEqual(legs.map(l => l.pin), PINS);
  assert.deepStrictEqual(place(legs), { ok: true });
});

test('footprintLegs at c33, rotation 180: red c33, cathode c32, green c31, blue c30; allowed', () => {
  rgb();
  const legs = Parts.footprintLegs('rgb_led', 'c33', 180);
  assert.deepStrictEqual(holeNames(legs), ['c33', 'c32', 'c31', 'c30']);
  assert.deepStrictEqual(place(legs), { ok: true });
});

test('rotations 90 and 270 give no legs (vertically its legs would share one column, one node)', () => {
  rgb();
  assert.equal(Parts.footprintLegs('rgb_led', 'c30', 90), null);
  assert.equal(Parts.footprintLegs('rgb_led', 'c30', 270), null);
});

test('it fits in either half, any row: a30, e30, f30 and j30 are allowed', () => {
  rgb();
  for (const at of ['a30', 'e30', 'f30', 'j30']) {
    assert.deepStrictEqual(place(Parts.footprintLegs('rgb_led', at, 0)), { ok: true }, at);
  }
});

test('placement limits: c61 facing right runs past column 63, c2 facing left past column 1; both refused', () => {
  rgb();
  const right = place(Parts.footprintLegs('rgb_led', 'c61', 0));
  assert.equal(right.ok, false, JSON.stringify(right));
  assert.match(right.reason, /past column 63/, right.reason);
  const left = place(Parts.footprintLegs('rgb_led', 'c2', 180));
  assert.equal(left.ok, false, JSON.stringify(left));
  assert.match(left.reason, /past column 1\b/, left.reason);
  assert.deepStrictEqual(place(Parts.footprintLegs('rgb_led', 'c60', 0)), { ok: true }, 'c60–c63 just fits');
});

test('a leg on a hole that is taken is refused (c32 holds a wire end)', () => {
  rgb();
  const r = place(Parts.footprintLegs('rgb_led', 'c30', 0), new Map([['c32', { wire: 0 }]]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^c32 already holds the end of a wire/);
});

test('the AI places it through chat.js: place_rgb_led at c61 facing right is refused with a note, place_rgb_led facing down too', () => {
  rgb();
  for (const a of [{ tool: 'place_rgb_led', hole: 'c61', direction: 'right' }, { tool: 'place_rgb_led', hole: 'c30', direction: 'down' }]) {
    const board = simBoard();
    const out = Chat.applyActions([a], board);
    assert.equal(board.components().length, 0, `nothing placed for ${JSON.stringify(a)}`);
    assert.ok(out.failed >= 1, JSON.stringify(out));
    assert.ok(board.notes.length >= 1, `a note says why: ${JSON.stringify(board.notes)}`);
  }
});

test('hole map: an RGB LED at c30 holds c30–c33 by label and pin name, 4 holes', () => {
  const def = rgb();
  const legs = Parts.footprintLegs('rgb_led', 'c30', 0);
  const comp = { type: 'rgb_led', label: 'RGB1', values: valuesFor(def), holeRefs: legs.map(l => ({ col: l.col, row: l.row })), pins: pinsOf(4) };
  const map = BoardIO.buildHoleMap([comp], []);
  assert.deepStrictEqual(map.get('c30'), { label: 'RGB1', pin: 'red' });
  assert.deepStrictEqual(map.get('c31'), { label: 'RGB1', pin: 'cathode' });
  assert.deepStrictEqual(map.get('c32'), { label: 'RGB1', pin: 'green' });
  assert.deepStrictEqual(map.get('c33'), { label: 'RGB1', pin: 'blue' });
  assert.equal(map.size, 4);
});

test('round trip: a placed purple RGB LED saves one named holeRef per pin; loaded back it sits on c30–c33 and still reads purple', () => {
  const def = rgb();
  const { board } = solveBuild(rgbBuild({ red: 470, blue: 470 }));
  const c = board.components().find(p => p.type === 'rgb_led');
  const saved = BoardIO.saveHoleRefs(c);
  assert.deepStrictEqual(saved, PINS.map((pin, i) => ({ pin, col: 29 + i, row: 'c' })));
  const record = JSON.parse(JSON.stringify({ type: 'rgb_led', label: c.label, values: c.values, holeRefs: saved }));
  const loaded = { type: 'rgb_led', label: record.label, values: valuesFor(def, record.values),
                   pins: pinsOf(4), holeRefs: BoardIO.loadHoleRefs(record) };
  assert.deepStrictEqual(Parts.legsOf(loaded).map(l => [l.pin, l.hole]), [['red', 'c30'], ['cathode', 'c31'], ['green', 'c32'], ['blue', 'c33']]);
  board.components()[board.components().indexOf(c)] = loaded;
  const { m } = part(board.solve());
  dies(m, { red: RED_MA, blue: GB_MA }, 'reloaded');
  looks(m.color, { r: true, g: false, b: true }, 'reloaded');
});

// ── The AI side ───────────────────────────────────────────────────────────

const decl = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const toolNames = message => Server.selectTools(message, []).map(d => d.name);

test('the generated place_rgb_led tool takes { hole, direction }, both required', () => {
  const def = rgb();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_rgb_led');
  const t = decl('place_rgb_led');
  assert.ok(t, `no place_rgb_led tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.hole && props.direction, JSON.stringify(t.parameters));
  assert.deepStrictEqual([...t.parameters.required].sort(), ['direction', 'hole']);
});

test("ai: keywords include rgb led, rgb, color led, multicolor, and not plain 'led' (the demo says LED); about ≤ 200 chars; not everyday", () => {
  const { ai } = rgb();
  for (const k of ['rgb led', 'rgb', 'color led', 'multicolor']) {
    assert.ok(ai.keywords.includes(k), `keyword "${k}" in ${JSON.stringify(ai.keywords)}`);
  }
  for (const k of ['led', 'light', 'lamp', 'diode']) assert.ok(!ai.keywords.includes(k), `"${k}" is another part's keyword`);
  assert.ok(ai.keywords.length <= 8);
  assert.ok(typeof ai.about === 'string' && ai.about.length > 0 && ai.about.length <= 200, ai.about);
  assert.ok(!ai.everyday, 'not in the everyday set, so the demo prompt stays as it is');
});

for (const message of [
  QA_PROMPT,
  'Add a multicolor LED to my circuit',
  'Build a color LED circuit',
  'Wire up two RGB LEDs',
]) {
  test(`selectTools("${message}") sends place_rgb_led and place_resistor, at most 12 tools`, () => {
    rgb();
    const got = toolNames(message);
    for (const n of ['place_rgb_led', 'place_resistor']) assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
    assert.ok(got.length <= 12, `${got.length} tools`);
  });
}

// Guard (fails until the part exists, then must hold): its keywords must not drag place_rgb_led into other prompts, above all the demo's.
for (const message of [
  DEMO_PROMPT,
  BENCH_PROMPT,
  'Build 3 LEDs, each with its own resistor.',
  'Change the LED color to blue',
]) {
  test(`guard: selectTools("${message}") does not send place_rgb_led`, () => {
    rgb();
    assert.ok(!toolNames(message).includes('place_rgb_led'), JSON.stringify(toolNames(message)));
  });
}

test('the red-only known answer (green and blue unused) has no circuit problems and passes finishAIReply untouched', () => {
  rgb();
  const build = rgbBuild({ red: 470 });
  assert.deepStrictEqual(Server.findCircuitProblems(build.map(a => ({ ...a }))), [], 'unused colour pins are fine');
  const out = Server.finishAIReply({ reply: 'Built it.', actions: build.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, build);
  assert.equal(out.reply, 'Built it.');
});

test('a build with the cathode left unwired: the RGB LED at c30 "is not connected between power and ground"', () => {
  rgb();
  const got = Server.findCircuitProblems(rgbBuild({ red: 470, blue: 470 }, { cathode: 'none' }));
  assert.ok(got.some(p => /RGB LED at c30 is not connected between power and ground/.test(p)), JSON.stringify(got));
});

// ── The sidebar ───────────────────────────────────────────────────────────

const found = q => Sidebar.groups(Parts.all(), q).flatMap(g => g.parts.map(p => p.type));

test('sidebar search: "rgb", "multicolor" and "Color LED" find only the RGB LED; "led" finds the LED and the RGB LED; "lamp" not the RGB LED', () => {
  rgb();
  assert.deepStrictEqual(found('rgb'), ['rgb_led']);
  assert.deepStrictEqual(found('multicolor'), ['rgb_led']);
  assert.deepStrictEqual(found('Color LED'), ['rgb_led']);
  assert.deepStrictEqual(found('led').sort(), ['led', 'rgb_led']);
  assert.ok(!found('lamp').includes('rgb_led'), JSON.stringify(found('lamp')));
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, rgb_led.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'rgb_led.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/rgb_led.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('rgb_led');
  assert.ok(def, 'window.Parts.get("rgb_led") after loading rgb_led.js');
  assert.equal(def.elements({}, {}).length, 3);
});

test("parts/rgb_led.js draws only through ctx: view.build and view.update, the dome a mesh named 'rgb-dome'", () => {
  const file = path.join(PARTS_DIR, 'rgb_led.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/rgb_led.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  assert.match(src, /rgb-dome/, "the dome is a mesh named 'rgb-dome' (e2e/rgb-led.spec.js finds it by name)");
  assert.equal(typeof rgb().view.build, 'function');
  assert.equal(typeof rgb().view.update, 'function', 'view.update colours the dome from m.color');
});

// ── docs ──────────────────────────────────────────────────────────────────

test(`docs/QA.md has one AI case for "${QA_PROMPT}"`, () => {
  const qa = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'QA.md'), 'utf8');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes(QA_PROMPT));
  assert.equal(rows.length, 1, 'one QA row sends the RGB LED prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});
