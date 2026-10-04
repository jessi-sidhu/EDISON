// The 7-segment display's worked build, ai.recipe (#43 follow-up). The real-AI
// check failed 3/3 on "Show the number 7 on a seven-segment display": from the
// compressed guide alone the model put the segment resistors on the wrong
// columns and stacked two wires in a32. The contract already has
// ai.recipe?: Example; the server now writes a sent part's recipe into the
// per-request system prompt as numbered tool calls with exact holes, only
// when that part's tool is sent, so the demo prompt and its golden stay as
// they are.
//
// Shapes these tests assume (stated so the builder matches them):
// - seven_segment's ai.recipe is an Example (parts, wires, expect) for the
//   digit 7. Its rules are checkRecipe() below. PROVEN_SEVEN is one that
//   meets them all (the builder copies it into the part).
// - Example → actions, and the prompt's recipe block format:
//   test/fixtures/recipe-steps.js.
// - The prompt is checked on the real path, as in test/prompt-golden.test.js:
//   AI_PROVIDER=deepseek, the real server, POST /api/ask on an empty board,
//   a fake global fetch that keeps the first body, messages[0].content.

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
const QA_PROMPT   = 'Show the number 7 on a seven-segment display';
const DEMO_PROMPT = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const SEG_MA = (9 - 2) / (470 + 0.1) * 1000;   // 14.891 mA: 9 V, a 2.0 V segment, 470 Ω + 0.1 Ω ron

// The display at f30 facing right, pins in datasheet order
// (e d com1 c dp b a com2 f g).
const DISPLAY_AT_F30 = ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30'];
// Each segment's column and half at that placement.
const SEG_AT = { e: 'bot30', d: 'bot31', c: 'bot33', dp: 'bot34', g: 'top30', f: 'top31', a: 'top33', b: 'top34' };

// The recipe proven here: every rule in checkRecipe holds, it simulates to
// "shows 7" (a, b, c at 14.89 mA each, no warnings) and findCircuitProblems
// finds nothing. Layout:
//   top half:    a e33 ← R1 b33–b37 ← tp_37→a37      b e34 ← R2 c34–c39 ← tp_39→a39
//                com2 e32 → a32→tn_32
//   bottom half: c f33 ← R3 h33–h37 ← f37, jumpered from e37 (column 37 top is +)
const PROVEN_SEVEN = {
  name:  "a, b and c each through their own 470 Ω from 9 V, com2 to ground: it shows '7'",
  parts: [{ type: 'battery', label: 'BAT1' },
          { type: 'seven_segment', label: 'DS1', holes: DISPLAY_AT_F30 },
          { type: 'resistor', label: 'R1', holes: ['b33', 'b37'], values: { resistance: 470 } },   // a
          { type: 'resistor', label: 'R2', holes: ['c34', 'c39'], values: { resistance: 470 } },   // b
          { type: 'resistor', label: 'R3', holes: ['h33', 'h37'], values: { resistance: 470 } }],  // c
  wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`],
          ['tp_37', 'a37'], ['tp_39', 'a39'], ['e37', 'f37'], ['a32', 'tn_32']],
  expect: { DS1: { digit: '7', segments: 'abc', dp: false } },
};

function seg() {
  const def = Parts.get('seven_segment');
  assert.ok(def, "Parts.get('seven_segment') is null");
  return def;
}

// ── A board that keeps real records, as in test/parts-seven_segment.test.js ──

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

// ── The rules a digit-7 recipe must meet ──────────────────────────────────

const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const halfOf = h => (h[0] <= 'e' ? 'top' : 'bot') + colOf(h);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));

// The body holes a wire lies over: a wire in one column covers the rows
// between its ends (a rail counts as just past row a or row j); any other
// wire, its two ends.
function wireCells([from, to]) {
  const ends = [from, to].filter(h => /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/.test(h));
  if (ends.length < 2 || colOf(ends[0]) !== colOf(ends[1])) return ends.filter(isBody);
  const [lo, hi] = [rowIdx(rowOf(ends[0])), rowIdx(rowOf(ends[1]))].sort((x, y) => x - y);
  return ROWS.filter((_, i) => i >= lo && i <= hi).map(r => r + colOf(ends[0]));
}

function checkRecipe(ex) {
  const where = ex.name || 'the recipe';
  assert.ok(ex && Array.isArray(ex.parts) && Array.isArray(ex.wires) && ex.expect, `${where}: an Example (parts, wires, expect)`);

  // One battery, wired to the rails at the highest column; the display at f30 facing right.
  const bats = ex.parts.filter(p => p.type === 'battery');
  assert.deepStrictEqual(bats.map(p => p.label), ['BAT1'], `${where}: one battery, BAT1`);
  const wireKeys = ex.wires.map(w => w.join(' -> '));
  for (const w of [`BAT1.0 -> tp_${N}`, `BAT1.1 -> tn_${N}`]) {
    assert.ok(wireKeys.includes(w), `${where}: wire ${w} (battery to the rails at the highest column); wires ${JSON.stringify(wireKeys)}`);
  }
  const displays = ex.parts.filter(p => p.type === 'seven_segment');
  assert.equal(displays.length, 1, `${where}: one 7-segment display`);
  const ds = displays[0];
  assert.deepStrictEqual(ds.holes, DISPLAY_AT_F30, `${where}: the display at f30 facing right`);
  assert.ok(ex.expect[ds.label] && ex.expect[ds.label].digit === '7', `${where}: expect ${ds.label}.digit '7': ${JSON.stringify(ex.expect)}`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Resistors: 3–5 columns apart on one row, 470 Ω, no column overlap with
  // another part on the same row.
  const resistors = ex.parts.filter(p => p.type === 'resistor');
  const spans = [];   // { label, row, lo, hi }
  for (const p of resistors) {
    const [x, y] = p.holes;
    assert.ok(isBody(x) && isBody(y) && rowOf(x) === rowOf(y), `${where}: ${p.label} ${x}–${y} on one row`);
    const d = Math.abs(colOf(x) - colOf(y));
    assert.ok(d >= 3 && d <= 5, `${where}: ${p.label} ${x}–${y} is ${d} columns apart; 3–5`);
    assert.equal((p.values && p.values.resistance) || 470, 470, `${where}: ${p.label} is 470 Ω`);
    spans.push({ label: p.label, row: rowOf(x), lo: Math.min(colOf(x), colOf(y)), hi: Math.max(colOf(x), colOf(y)) });
  }
  for (const row of ['e', 'f']) spans.push({ label: ds.label, row, lo: 30, hi: 34 });
  for (const s of spans) {
    for (const t of spans) {
      if (s === t || s.row !== t.row) continue;
      assert.ok(s.hi < t.lo || t.hi < s.lo, `${where}: ${s.label} and ${t.label} overlap on row ${s.row} (${s.lo}–${s.hi}, ${t.lo}–${t.hi})`);
    }
  }

  // No wire lies under a part: not between a resistor's legs on its row,
  // not over another part's leg.
  const legs = new Set(ex.parts.flatMap(p => p.holes || []));
  for (const w of ex.wires) {
    for (const cell of wireCells(w)) {
      assert.ok(!legs.has(cell), `${where}: wire ${w.join(' -> ')} ${w.includes(cell) ? 'ends in' : 'passes over'} ${cell}, a part's leg`);
      const under = spans.find(s => s.label !== ds.label && s.row === rowOf(cell) && colOf(cell) > s.lo && colOf(cell) < s.hi);
      assert.ok(!under, `${where}: wire ${w.join(' -> ')} passes under ${under && under.label} at ${cell}`);
    }
  }

  // a, b and c each have their own resistor into their column, in the right
  // half; no other segment has one.
  for (const [s, at] of Object.entries(SEG_AT)) {
    const into = resistors.filter(p => p.holes.some(h => halfOf(h) === at));
    if (['a', 'b', 'c'].includes(s)) {
      assert.equal(into.length, 1, `${where}: segment ${s} (${at}) is fed through exactly one resistor; got ${into.map(p => p.label).join(', ') || 'none'}`);
    } else {
      assert.equal(into.length, 0, `${where}: segment ${s} (${at}) has no resistor; got ${into.map(p => p.label).join(', ')}`);
    }
  }
  const feeders = ['a', 'b', 'c'].map(s => resistors.find(p => p.holes.some(h => halfOf(h) === SEG_AT[s])).label);
  assert.equal(new Set(feeders).size, 3, `${where}: a, b and c have one resistor each: ${feeders.join(', ')}`);

  // As AI actions: findCircuitProblems finds nothing, finishAIReply keeps
  // them all, and applied through chat.js the display shows 7.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const p = r.parts[ds.label];
  assert.ok(p, `${where}: analyze().parts has no ${ds.label}`);
  assert.deepStrictEqual([p.m.digit, p.m.segments, p.m.dp], ['7', 'abc', false], `${where}: ${JSON.stringify(p.m)}`);
  for (const s of ['a', 'b', 'c']) {
    const mA = p.r.current[s];
    assert.ok(Math.abs(mA - SEG_MA) <= 0.05, `${where}: segment ${s} expected ${SEG_MA.toFixed(3)} mA, got ${mA}`);
  }
  const warned = Object.entries(r.parts).filter(([, q]) => q.warnings && q.warnings.length)
    .map(([l, q]) => `${l}: ${q.warnings.join('; ')}`);
  assert.deepStrictEqual(warned, [], `${where}: no warnings`);
  assert.match(text(r), /shows 7\b/, text(r));
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Pin (passes today): the recipe handed to the builder meets every rule, so
// the rules can be met and the layout is proven on the simulator.
test('pin: the proven digit-7 recipe (PROVEN_SEVEN) meets every recipe rule and shows 7', () => {
  seg();
  checkRecipe(PROVEN_SEVEN);
});

test("seven_segment's ai.recipe is a digit-7 build that meets every recipe rule: shows 7 (abc at 14.89 mA), no warnings, no problems", () => {
  const { ai } = seg();
  assert.ok(ai.recipe, 'seven_segment has no ai.recipe: add the worked digit-7 build (PROVEN_SEVEN in this file)');
  checkRecipe(ai.recipe);
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

// The recipe steps in the prompt sent for the QA request.
function qaSteps() {
  const def = seg();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_seven_segment'), `the QA request sends place_seven_segment: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /seven_segment|7-segment/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the 7-segment display '
    + '(a heading line with RECIPE and place_seven_segment or "7-segment display", then numbered steps). '
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a 7-segment recipe block whose numbered steps are the recipe\'s actions, exact tools and holes', () => {
  const steps = qaSteps();
  const want = recipeActions(seg().ai.recipe || PROVEN_SEVEN);
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  // Parts are placed in the recipe's order (labels follow it); wires may
  // come in any order (e.g. the battery's right after place_battery).
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, show 7', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const p = r.parts[Ids.nextLabel([], 'seven_segment')];
  assert.ok(p, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.deepStrictEqual([p.m.digit, p.m.segments], ['7', 'abc'], JSON.stringify(p.m));
  assert.match(text(r), /shows 7\b/, text(r));
});

// Pin (passes today): the recipe goes in only when the display's tool is
// sent, so the demo and bench prompts (and their goldens) do not change.
test('pin: the demo and bench requests do not send place_seven_segment, and their prompts carry no 7-segment recipe block', () => {
  const def = seg();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_seven_segment'), `"${p}" sends place_seven_segment`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a 7-segment recipe block`);
    assert.doesNotMatch(prompt, /place_seven_segment/, `"${p}": the prompt mentions place_seven_segment`);
  }
});
