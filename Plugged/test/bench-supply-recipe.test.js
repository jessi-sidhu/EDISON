// The bench supply's worked ± build, ai.recipe, and a guide line for the −
// side (bug #78). The ± request ("Use the bench supply at ±12 V: an LED with
// a resistor on the + rail and another on the − rail") fails about 1 in 3 on
// the real AI: the − rail LED goes in backwards, or the resistor is too
// small (both LEDs over 20 mA). The fix that worked for every earlier part:
// ai.recipe, a proven build the server writes into the prompt as numbered
// steps only when place_bench_supply is sent, and a guide in plain words.
// The trap is the − side: the LED's ANODE goes toward COM (ground, tn) and
// its CATHODE toward −V (bn).
//
// Shapes these tests assume (stated so the builder matches them):
// - bench_supply's ai.recipe is an Example (parts, wires, expect) for the ±
//   request. Its rules are checkRecipe() below; PROVEN_DUAL meets them all
//   (the builder copies it in). Its name says ± (the block is also sent
//   with the single-rail bench request, so the heading must say what it is
//   for).
// - Layout (the prompt's rules: the second source's parts go in rows f–j,
//   with its rail wires in row j; #71: bn is the supply's −, COM is tn):
//     PS1 at 12 V (±12 V): PS1.0 → tp_63, PS1.1 → tn_63, PS1.2 → bn_63.
//     + side, the one-LED recipe at C=2 (top half): R1 b2–b6 1 kΩ,
//       LED1 cathode c8 / anode c6, tp_3 → a2, a8 → tn_8.
//     − side at C=10 (bottom half): tn_10 → f10 (COM down to the bottom
//       half, a straight wire over the empty a10–e10), R2 g10–g14 1 kΩ,
//       LED2 cathode h16 / anode h14 (anode toward COM), j16 → bn_16.
// - bench_supply's ai.guide: at most 400 characters, never the word
//   "recipe" (the prompt line "- place_bench_supply: <guide>" would parse
//   as a recipe heading). It keeps what test/parts-bench_supply.test.js
//   asks, and adds: for one rail, only + and COM (PS1.2 left unwired); on
//   the − side an LED's anode goes toward COM and its cathode toward −.
// - The ± request sends place_bench_supply, place_led and place_resistor.
// - Example → actions, and the prompt's recipe block format:
//   test/fixtures/recipe-steps.js. The prompt is checked on the real path,
//   as in test/zener-recipe.test.js.
// - EXPECTED GOLDEN CHANGE: the single-rail bench request ("Power an LED
//   from the bench supply at 5 V …", test/fixtures/prompts/bench-supply.txt)
//   sends place_bench_supply, so the ± recipe block (a heading and 13
//   steps) and the longer guide line go into its prompt, and its golden
//   changes (UPDATE_GOLDEN=1, then the real-AI AI-13 check). There is no
//   bench size budget in test/prompt-golden.test.js, only DEMO_BUDGET. The
//   demo request does not send place_bench_supply, so demo-led.txt must not
//   change.
//
// Hand-computed (ideal supply, a red LED is vf 2.0 V in series with ron
// 0.1 Ω): each side I = (12 − 2.0) / (1000 + 0.1) = 9.99900 mA, so the
// + rail and the − rail each give 9.999 mA; no LED over 20 mA, no rail near
// the 0.5 A limit.

const assert = require('node:assert');
const http   = require('node:http');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server  = require('../backend/server.js');
const Parts   = require('../circuit3d/js/parts');
const Chat    = require('../circuit3d/js/chat.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Ids     = require('../circuit3d/js/ids.js');
const { recipeActions, parseRecipeSteps } = require('./fixtures/recipe-steps.js');

const N    = require('../circuit3d/js/board-geometry.js').COLS;   // 63
const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const QA_PROMPT    = 'Use the bench supply at ±12 V: an LED with a resistor on the + rail and another on the − rail';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const SUPPLY_V = 12, SERIES = 1000, VF = 2.0, RON = 0.1;
const LED_MA = (SUPPLY_V - VF) / (SERIES + RON) * 1000;   // 9.99900 mA

// The recipe proven here: every rule in checkRecipe holds, findCircuitProblems
// finds nothing, finishAIReply keeps every action, and applied through
// chat.js both LEDs light at 9.999 mA, each rail gives 9.999 mA, no warnings.
const PROVEN_DUAL = {
  name:  '±12 V (both rails): an LED and 1 kΩ from + to COM, and another from COM to −, its anode toward COM',
  parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
          { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
          { type: 'led', label: 'LED1', holes: ['c8', 'c6'] },        // cathode c8, anode c6 (toward +)
          { type: 'resistor', label: 'R2', holes: ['g10', 'g14'], values: { resistance: 1000 } },
          { type: 'led', label: 'LED2', holes: ['h16', 'h14'] }],     // cathode h16 (toward −), anode h14 (toward COM)
  wires: [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['PS1.2', `bn_${N}`],
          ['tp_3', 'a2'], ['a8', 'tn_8'],
          ['tn_10', 'f10'], ['j16', 'bn_16']],
  expect: { LED1: { on: true, current: [9.9, 10.1] },
            LED2: { on: true, current: [9.9, 10.1] },
            PS1:  { posAmps: [9.9, 10.1], negAmps: [9.9, 10.1], posOver: false, negOver: false } },
};

function supply() {
  const def = Parts.get('bench_supply');
  assert.ok(def, "Parts.get('bench_supply') is null: parts/bench_supply.js must exist and be listed in parts/index.js");
  return def;
}

// ── A board that keeps real records, as in test/zener-recipe.test.js ──────

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

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

const text = r => (r.lines || []).map(l => l.text).join(' | ');

// Applies the actions through chat.js (every one must apply) and solves.
function solveActions(actions) {
  const board = simBoard();
  const out = Chat.acceptBuild(actions.map(a => ({ ...a })), board);
  assert.deepEqual(out, { applied: actions.length, failed: 0 }, `every action applies; notes ${JSON.stringify(board.notes)}`);
  const r = board.solve();
  assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
  assert.equal(r.shorted, false, `shorted: ${text(r)}`);
  return r;
}

const warnedOf = r => Object.entries(r.parts).filter(([, q]) => q.warnings && q.warnings.length)
  .map(([l, q]) => `${l}: ${q.warnings.join('; ')}`);

// Both LEDs lit at the hand value, both rails giving it, nothing warned.
function checkBothLit(r, where, leds = ['LED1', 'LED2'], ps = 'PS1') {
  for (const l of leds) {
    const p = r.parts[l];
    assert.ok(p, `${where}: analyze().parts has ${l}; got ${JSON.stringify(Object.keys(r.parts))}`);
    assert.equal(p.m.on, true, `${where}: ${l} lights: ${JSON.stringify(p.m)}; ${text(r)}`);
    assert.ok(Math.abs(p.m.current - LED_MA) <= 0.01, `${where}: ${l} hand ${LED_MA.toFixed(4)} mA, got ${p.m.current}`);
  }
  const s = r.parts[ps];
  assert.ok(s, `${where}: analyze().parts has ${ps}`);
  assert.ok(Math.abs(s.m.posAmps - LED_MA) <= 0.01, `${where}: + rail hand ${LED_MA.toFixed(4)} mA, got ${s.m.posAmps}`);
  assert.ok(Math.abs(s.m.negAmps - LED_MA) <= 0.01, `${where}: − rail hand ${LED_MA.toFixed(4)} mA, got ${s.m.negAmps}`);
  assert.equal(s.m.posOver, false, `${where}: + rail not current-limited`);
  assert.equal(s.m.negOver, false, `${where}: − rail not current-limited`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
}

// ── The rules a ± recipe must meet ────────────────────────────────────────

const HOLE   = /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/;
const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));
const topHalf = h => isBody(h) && h[0] <= 'e';
const botHalf = h => isBody(h) && h[0] >= 'f';

// The body holes a wire lies over: a wire in one column covers the rows
// between its ends (a rail counts as just past row a or row j); any other
// wire, its two ends.
function wireCells([from, to]) {
  const ends = [from, to].filter(h => HOLE.test(h));
  if (ends.length < 2 || colOf(ends[0]) !== colOf(ends[1])) return ends.filter(isBody);
  const [lo, hi] = [rowIdx(rowOf(ends[0])), rowIdx(rowOf(ends[1]))].sort((x, y) => x - y);
  return ROWS.filter((_, i) => i >= lo && i <= hi).map(r => r + colOf(ends[0]));
}

// The net each hole is on: a body hole's column and half; a rail row, whole;
// joined by the recipe's hole-to-hole wires.
function netsOf(ex) {
  const up = {};
  const key = h => (isBody(h) ? (h[0] <= 'e' ? 'top' : 'bot') + colOf(h) : rowOf(h));
  const find = k => { while (up[k] && up[k] !== k) k = up[k]; return k; };
  for (const [a, b] of ex.wires) {
    if (HOLE.test(a) && HOLE.test(b)) up[find(key(a))] = find(key(b));
  }
  return h => find(key(h));
}

// The LED and the resistor in series from `hi` to `lo`, the LED's anode
// (holeB) on the hi side of it: hi –R– mid –LED– lo, or hi –LED– mid –R– lo.
function seriesPair(ex, net, hi, lo, sideName) {
  const where = ex.name || 'the recipe';
  const leds = ex.parts.filter(p => p.type === 'led');
  const rs   = ex.parts.filter(p => p.type === 'resistor');
  const chains = (cathOf, anodeOf) => {
    const out = [];
    for (const l of leds) {
      const [cath, anode] = [cathOf(l), anodeOf(l)];
      for (const r of rs) {
        const rn = r.holes.map(net);
        if (rn.includes(hi) && rn.includes(anode) && anode !== hi && anode !== lo && cath === lo) out.push({ led: l, r });
        if (anode === hi && rn.includes(cath) && rn.includes(lo) && cath !== hi && cath !== lo) out.push({ led: l, r });
      }
    }
    return out;
  };
  const found = chains(l => net(l.holes[0]), l => net(l.holes[1]));
  const backwards = chains(l => net(l.holes[1]), l => net(l.holes[0])).map(f => f.led);
  assert.equal(found.length, 1, `${where}: one LED and one resistor in series on the ${sideName} side, the LED's anode (holeB) `
    + `toward the higher rail; found ${found.map(f => f.led.label + '+' + f.r.label).join(', ') || 'none'}`
    + (backwards.length ? `; backwards on this side: ${backwards.map(l => `${l.label} ${l.holes.join('/')}`).join(', ')}` : ''));
  return found[0];
}

function checkRecipe(ex) {
  const where = ex.name || 'the recipe';
  assert.ok(ex && Array.isArray(ex.parts) && Array.isArray(ex.wires) && ex.expect, `${where}: an Example (parts, wires, expect)`);
  assert.match(String(ex.name), /±/, `${where}: the name says ± (the block also goes to single-rail requests)`);

  // PS1 at 12 V (±12 V), all three terminals on their rails at the highest
  // column: + on tp, COM on tn, − on bn. No battery.
  assert.deepStrictEqual(ex.parts.filter(p => p.type === 'battery').map(p => p.label), [], `${where}: no battery`);
  const sups = ex.parts.filter(p => p.type === 'bench_supply');
  assert.deepStrictEqual(sups.map(p => p.label), ['PS1'], `${where}: one bench supply, PS1`);
  const volts = (sups[0].values && sups[0].values.voltage) || Parts.get('bench_supply').values.voltage.default;
  assert.equal(volts, SUPPLY_V, `${where}: PS1 is at 12 V (±12 V)`);
  const wireKeys = ex.wires.map(w => w.join(' -> '));
  for (const w of [`PS1.0 -> tp_${N}`, `PS1.1 -> tn_${N}`, `PS1.2 -> bn_${N}`]) {
    assert.ok(wireKeys.includes(w), `${where}: wire ${w} (supply to the rails at the highest column); wires ${JSON.stringify(wireKeys)}`);
  }

  // Two red LEDs, two 1 kΩ resistors, nothing else.
  const others = ex.parts.filter(p => !['bench_supply', 'led', 'resistor'].includes(p.type));
  assert.deepStrictEqual(others.map(p => p.type), [], `${where}: only the supply, LEDs and resistors`);
  const leds = ex.parts.filter(p => p.type === 'led');
  const rs   = ex.parts.filter(p => p.type === 'resistor');
  assert.equal(leds.length, 2, `${where}: two LEDs`);
  assert.equal(rs.length, 2, `${where}: two resistors`);
  for (const l of leds) assert.ok(!(l.values && l.values.color) || l.values.color === 'red', `${where}: ${l.label} is red`);
  for (const r of rs) assert.equal(r.values && r.values.resistance, SERIES, `${where}: ${r.label} is 1 kΩ`);

  // + side: tp → LED (anode toward +) → tn. − side: tn → LED (anode toward
  // COM, cathode toward −) → bn.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), COM = net('tn_1'), NEG = net('bn_1');
  assert.ok(new Set([PLUS, COM, NEG]).size === 3, `${where}: tp, tn and bn are three separate nets`);
  const up   = seriesPair(ex, net, PLUS, COM, '+ (tp to tn)');
  const down = seriesPair(ex, net, COM, NEG, '− (tn to bn)');
  assert.notEqual(up.led, down.led, `${where}: a different LED on each side`);

  // The prompt's rules: the + side in the top half; the − side (the second
  // rail's parts) in rows f–j, with its bn wires from row j.
  for (const p of [up.led, up.r]) {
    assert.ok(p.holes.every(topHalf), `${where}: ${p.label} (+ side) sits in rows a–e: ${p.holes.join(', ')}`);
  }
  for (const p of [down.led, down.r]) {
    assert.ok(p.holes.every(botHalf), `${where}: ${p.label} (− side) sits in rows f–j, near bn: ${p.holes.join(', ')}`);
  }
  for (const w of ex.wires.filter(w => w.some(h => /^bn_/.test(h)) && w.some(isBody))) {
    assert.equal(rowOf(w.find(isBody)), 'j', `${where}: the bn wire ${w.join(' -> ')} lands in row j`);
  }
  assert.deepStrictEqual(ex.wires.flat().filter(h => /^bp_/.test(h)), [], `${where}: nothing on bp (bn is −, COM is tn)`);

  // Nothing shorted by accident: every pin is on a circuit net, and no part
  // has both pins on one net.
  const nodes = [PLUS, COM, NEG, ...[up, down].flatMap(s => [...s.led.holes, ...s.r.holes].map(net))];
  for (const p of ex.parts.filter(q => q.holes)) {
    const ns = p.holes.map(net);
    assert.notEqual(ns[0], ns[1], `${where}: ${p.label}'s two legs are shorted together (${p.holes.join(', ')})`);
    for (const [h, n] of p.holes.map((h, k) => [h, ns[k]])) {
      assert.ok(nodes.includes(n), `${where}: ${p.label}'s ${h} is on a stray net, off the circuit`);
    }
  }

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts: 1–3 columns for an LED, 3–5 for a resistor (the SIZING
  // lines), no two overlapping on a row, and no wire under a part (over a
  // leg, or between a span part's legs on its row).
  const spans = ex.parts.filter(p => (p.holes || []).length === 2 && p.holes.every(isBody) && rowOf(p.holes[0]) === rowOf(p.holes[1]))
    .map(p => ({ label: p.label, type: p.type, row: rowOf(p.holes[0]), lo: Math.min(...p.holes.map(colOf)), hi: Math.max(...p.holes.map(colOf)) }));
  for (const s of spans) {
    const [min, max] = s.type === 'led' ? [1, 3] : [3, 5];
    assert.ok(s.hi - s.lo >= min && s.hi - s.lo <= max, `${where}: ${s.label} spans ${s.hi - s.lo} columns, not ${min}–${max}`);
    for (const t of spans) {
      if (s === t || s.row !== t.row) continue;
      assert.ok(s.hi < t.lo || t.hi < s.lo, `${where}: ${s.label} and ${t.label} overlap on row ${s.row}`);
    }
  }
  const legs = new Set(ex.parts.flatMap(p => p.holes || []));
  for (const w of ex.wires) {
    for (const cell of wireCells(w)) {
      assert.ok(!legs.has(cell), `${where}: wire ${w.join(' -> ')} ${w.includes(cell) ? 'ends in' : 'passes over'} ${cell}, a part's leg`);
      const under = spans.find(s => s.row === rowOf(cell) && colOf(cell) > s.lo && colOf(cell) < s.hi);
      assert.ok(!under, `${where}: wire ${w.join(' -> ')} passes under ${under && under.label} at ${cell}`);
    }
  }

  // As AI actions: findCircuitProblems finds nothing, finishAIReply keeps
  // them all, and applied through chat.js both LEDs light at 9.999 mA.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions, `${where}: finishAIReply keeps every action`);
  assert.equal(out.reply, 'Built it.', `${where}: no "Heads up" added to the reply`);

  const r = solveActions(actions);
  checkBothLit(r, where, [up.led.label, down.led.label], 'PS1');
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

test('the proven ± recipe (PROVEN_DUAL) meets every recipe rule: both LEDs at 9.999 mA, each rail 9.999 mA, no problems, no warnings', () => {
  supply();
  checkRecipe(PROVEN_DUAL);
});

test("bench_supply's ai.recipe is a ±12 V build, an LED + 1 kΩ on each rail (the − one anode toward COM), that meets every recipe rule", () => {
  const { ai } = supply();
  assert.ok(ai.recipe, 'bench_supply has no ai.recipe: add the worked ± build (PROVEN_DUAL in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

const near = (a, b, gap = 50) => new RegExp(`(${a})[^.;]{0,${gap}}(${b})|(${b})[^.;]{0,${gap}}(${a})`, 'i');

test('bench_supply\'s ai.guide says one rail uses only + and COM (PS1.2 unwired), and a − side LED has its anode toward COM, its cathode toward −; ≤ 400 chars, no "recipe"', () => {
  const g = supply().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `bench_supply has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 400, `ai.guide is ${g.length} characters; at most 400`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  // One rail: only + and COM.
  assert.match(g, /\b(one|single)[ -](rail|supply)\b|\+ (rail )?only\b|only (the )?\+/i,
    `ai.guide says what to do for one rail (only + and COM): ${g}`);
  assert.match(g, /PS1\.2[^.;]{0,40}\b(unwired|unused|unconnected|free|empty)\b|\b(leave|no wire (to|on))\b[^.;]{0,30}PS1\.2|only PS1\.0 and PS1\.1/i,
    `ai.guide says PS1.2 stays unwired on one rail: ${g}`);
  // The − side: anode toward COM, cathode toward −.
  assert.match(g, near('anode', 'COM|\\btn_?|ground'), `ai.guide says a − side LED's anode goes toward COM: ${g}`);
  assert.match(g, near('cathode', '−|-V|\\bbn_?|PS1\\.2|negative'), `ai.guide says its cathode goes toward −: ${g}`);
  // What test/parts-bench_supply.test.js already asks stays true.
  for (const ref of ['PS1.0', 'PS1.1', 'PS1.2']) assert.ok(g.includes(ref), `the guide names ${ref}`);
  assert.match(g, /\btn_/, 'COM to a tn rail');
  assert.match(g, /warn/i, 'the limit only warns');
});

// ── The recipe in the prompt sent (real path) ─────────────────────────────

let base;
const sent = {};   // prompt → the first body sent to DeepSeek

function ask(message, markdown = '') {
  const body = JSON.stringify({ message, markdown, history: [] });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: base, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let t = '';
      res.on('data', c => { t += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(t) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function capture(request) {
  let first = null;
  vi.stubGlobal('fetch', async (url, opts) => {
    if (!first) first = JSON.parse(opts.body);
    return { ok: true, status: 200, text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'Sure.', tool_calls: null } }] }) };
  });
  try {
    const out = await ask(request);
    assert.equal(out.status, 200, `POST /api/ask for "${request}": ${JSON.stringify(out)}`);
  } finally {
    vi.unstubAllGlobals();
  }
  assert.ok(first, `nothing was sent to DeepSeek for "${request}"`);
  return first;
}

beforeAll(async () => {
  await new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
    base = Server.server.address().port;
    r();
  }));
  const quiet = [vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'info').mockImplementation(() => {})];
  try {
    for (const p of [QA_PROMPT, DEMO_PROMPT, BENCH_PROMPT]) sent[p] = await capture(p);
  } finally {
    for (const s of quiet) s.mockRestore();
  }
});
afterAll(() => new Promise(r => Server.server.close(r)));

const systemOf = body => {
  const m = body.messages && body.messages[0];
  assert.ok(m && m.role === 'system', `messages[0] should be the system prompt: ${JSON.stringify(m && m.role)}`);
  return m.content;
};
const toolNames = body => (body.tools || []).map(t => t.function.name);

test('the ± request sends place_bench_supply, place_led and place_resistor (the recipe\'s tools)', () => {
  supply();
  const got = toolNames(sent[QA_PROMPT]);
  for (const n of ['place_bench_supply', 'place_led', 'place_resistor']) {
    assert.ok(got.includes(n), `the ± request sends ${n}: ${JSON.stringify(got)}`);
  }
});

// The recipe block in the prompt sent for `request`.
function blockFor(request) {
  const def = supply();
  const body = sent[request];
  assert.ok(toolNames(body).includes('place_bench_supply'), `"${request}" sends place_bench_supply: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const nearLines = prompt.split('\n').filter(l => /place_bench_supply|bench supply/i.test(l)).map(l => l.slice(0, 120));
  assert.ok(block, `the system prompt for "${request}" has no recipe block for the bench supply `
    + '(a heading line with RECIPE and place_bench_supply or "Bench supply", then numbered steps). '
    + `Lines that mention it: ${JSON.stringify(nearLines)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block;
}

test('the ± request\'s system prompt has a bench supply recipe block whose numbered steps are the recipe\'s actions, exact tools and holes', () => {
  const { steps } = blockFor(QA_PROMPT);
  const want = recipeActions(supply().ai.recipe || PROVEN_DUAL);
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the bench supply recipe steps parsed from the ± prompt pass findCircuitProblems with [] and, applied through chat.js, light both LEDs at 9.999 mA with no warnings', () => {
  const { steps } = blockFor(QA_PROMPT);
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  checkBothLit(r, 'the parsed ± steps', ['LED1', 'LED2'], 'PS1');   // labels in placement order after delete_all
});

test('the ± request\'s system prompt carries the bench supply guide line', () => {
  const g = supply().ai.guide;
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_bench_supply: ${g}`), 'the prompt has "- place_bench_supply: <guide>"');
});

// Expected golden change: the single-rail bench request sends
// place_bench_supply, so it gets the same block. Its heading must say ±, so
// the model doesn't copy the − rail into a one-rail build.
test('the single-rail bench request (bench-supply.txt golden) gets the recipe block too, and its heading says ± (it is not the one-rail build)', () => {
  const { heading } = blockFor(BENCH_PROMPT);
  assert.match(heading, /±/, `the recipe heading says ±: ${heading}`);
});

test('pin: the demo request does not send place_bench_supply, and its prompt carries no bench supply recipe block or guide line (demo-led.txt unchanged)', () => {
  const def = supply();
  assert.ok(!toolNames(sent[DEMO_PROMPT]).includes('place_bench_supply'), `the demo sends place_bench_supply: ${JSON.stringify(toolNames(sent[DEMO_PROMPT]))}`);
  const prompt = systemOf(sent[DEMO_PROMPT]);
  assert.equal(parseRecipeSteps(prompt, def), null, 'the demo prompt has a bench supply recipe block');
  assert.deepStrictEqual(prompt.split('\n').filter(l => /recipe/i.test(l) && /bench supply|place_bench_supply|±/i.test(l)), [],
    'demo prompt lines that say recipe and bench supply');
  assert.ok(!prompt.includes(def.ai.guide), 'the demo prompt carries the bench supply guide');
});
