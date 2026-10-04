// The diode's worked build, ai.recipe, and its guide (#33 follow-up). The
// real-AI check failed 3/3 on "Add a diode for reverse-polarity protection
// to an LED circuit": the model placed place_diode holeA=b2 holeB=b6, then
// wired tp_3 → a2, feeding + into holeA, the CATHODE (pins ['cathode',
// 'anode']). The diode blocked and the LED stayed dark ("Circuit open"),
// though its reply named the pins right. Same class as #43's 7-segment
// display, fixed the same way: ai.recipe, a proven build the server writes
// into the prompt as numbered steps only when place_diode is sent, and an
// ai.guide that says in plain words which hole is which.
//
// Shapes these tests assume (stated so the builder matches them):
// - diode's ai.recipe is an Example (parts, wires, expect) for reverse-
//   polarity protection of an LED. Its rules are checkRecipe() below.
//   PROVEN_DIODE is one that meets them all (the builder copies it in).
// - diode's ai.guide: at most 300 characters, never the word "recipe" (the
//   prompt line "- place_diode: <guide>" would read as a recipe heading).
//   It says + goes to the anode (holeB), the cathode (holeA, the banded end)
//   goes on toward the load, and current flows from anode to cathode.
// - Example → actions, and the prompt's recipe block format:
//   test/fixtures/recipe-steps.js.
// - The prompt is checked on the real path, as in
//   test/seven-segment-recipe.test.js: AI_PROVIDER=deepseek, the real
//   server, POST /api/ask on an empty board, a fake global fetch that keeps
//   the first body, messages[0].content.
// - The demo and bench requests don't send place_diode, so their goldens
//   (test/prompt-golden.test.js) must not change with the recipe or guide.
//
// Hand-computed (ideal 9 V battery; the diode and the LED are each vf in
// series with 0.1 Ω when on; 1N4148 vf 0.65 V, red LED vf 2.0 V):
//   I = (9 − 0.65 − 2.0) / (470 + 0.1 + 0.1) = 6.35 / 470.2 = 13.505 mA
//   diode drop = 0.65 + 0.1 Ω × 13.505 mA = 0.6514 V

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
const QA_PROMPT    = 'Add a diode for reverse-polarity protection to an LED circuit';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const LED_MA  = (9 - 0.65 - 2.0) / (470 + 0.1 + 0.1) * 1000;   // 13.505 mA
const D_DROP  = 0.65 + 0.1 * LED_MA / 1000;                     // 0.6514 V
const LED_BACKWARDS = 'LED is backwards. Current cannot flow from cathode to anode. Flip it around.';

// The recipe proven here: every rule in checkRecipe holds, it simulates to
// the LED on at 13.505 mA with no warnings, findCircuitProblems finds
// nothing, and with the battery reversed nothing conducts. Layout (top half):
//   tp_2 → a2;  D1 anode b2, cathode b6;  R1 c6–c10 470 Ω;
//   LED1 anode d10, cathode d12;  a12 → tn_12.
const PROVEN_DIODE = {
  name:  '+ into the 1N4148\'s anode (holeB), its cathode (holeA) through 470 Ω to a red LED, LED to ground: the LED lights',
  parts: [{ type: 'battery', label: 'BAT1' },
          { type: 'diode', label: 'D1', holes: ['b6', 'b2'] },                                // cathode b6, anode b2
          { type: 'resistor', label: 'R1', holes: ['c6', 'c10'], values: { resistance: 470 } },
          { type: 'led', label: 'LED1', holes: ['d12', 'd10'], values: { color: 'red' } }],    // cathode d12, anode d10
  wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_2', 'a2'], ['a12', 'tn_12']],
  expect: { D1:   { on: true, drop: [0.64, 0.66], current: [13.4, 13.6] },
            LED1: { on: true, current: [13.4, 13.6] } },
};

function diode() {
  const def = Parts.get('diode');
  assert.ok(def, "Parts.get('diode') is null");
  return def;
}

// ── A board that keeps real records, as in test/seven-segment-recipe.test.js ──

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

// ── The rules a protection recipe must meet ───────────────────────────────

const HOLE   = /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/;
const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));

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

function checkRecipe(ex) {
  const where = ex.name || 'the recipe';
  assert.ok(ex && Array.isArray(ex.parts) && Array.isArray(ex.wires) && ex.expect, `${where}: an Example (parts, wires, expect)`);

  // One battery, wired to the rails at the highest column.
  const bats = ex.parts.filter(p => p.type === 'battery');
  assert.deepStrictEqual(bats.map(p => p.label), ['BAT1'], `${where}: one battery, BAT1`);
  const wireKeys = ex.wires.map(w => w.join(' -> '));
  for (const w of [`BAT1.0 -> tp_${N}`, `BAT1.1 -> tn_${N}`]) {
    assert.ok(wireKeys.includes(w), `${where}: wire ${w} (battery to the rails at the highest column); wires ${JSON.stringify(wireKeys)}`);
  }

  // One diode, one 470 Ω resistor, one LED.
  const one = type => {
    const ps = ex.parts.filter(p => p.type === type);
    assert.equal(ps.length, 1, `${where}: one ${type}; got ${ps.map(p => p.label).join(', ') || 'none'}`);
    return ps[0];
  };
  const d = one('diode'), res = one('resistor'), led = one('led');
  assert.equal((res.values && res.values.resistance) || 470, 470, `${where}: ${res.label} is 470 Ω`);
  assert.ok(!(led.values && led.values.color) || led.values.color === 'red', `${where}: ${led.label} is red (vf 2.0 V)`);
  assert.ok(!(d.values && d.values.model) || d.values.model === '1N4148', `${where}: ${d.label} is a 1N4148 (vf 0.65 V)`);

  // The series path: + → diode anode (holeB); diode cathode (holeA) → 470 Ω
  // → LED anode; LED cathode → ground.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), GND = net('tn_1');
  const [dCath, dAnode] = d.holes, [lCath, lAnode] = led.holes;
  assert.equal(net(dAnode), PLUS, `${where}: + (tp) goes to ${d.label}'s ANODE, holeB ${dAnode}`);
  assert.notEqual(net(dCath), PLUS, `${where}: ${d.label}'s cathode, holeA ${dCath}, is not on + (tp)`);
  const rNets = res.holes.map(net);
  assert.ok(rNets.includes(net(dCath)), `${where}: ${d.label}'s cathode ${dCath} goes into ${res.label} (${res.holes.join('–')})`);
  assert.ok(rNets.includes(net(lAnode)) && net(lAnode) !== net(dCath),
    `${where}: ${res.label}'s other end goes to ${led.label}'s anode ${lAnode}`);
  assert.equal(net(lCath), GND, `${where}: ${led.label}'s cathode ${lCath} goes to ground (tn)`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts on one row don't overlap, and no wire lies under a part: not
  // over any leg, not between a span part's legs on its row.
  const spans = ex.parts.filter(p => (p.holes || []).length === 2 && p.holes.every(isBody) && rowOf(p.holes[0]) === rowOf(p.holes[1]))
    .map(p => ({ label: p.label, row: rowOf(p.holes[0]), lo: Math.min(...p.holes.map(colOf)), hi: Math.max(...p.holes.map(colOf)) }));
  for (const s of spans) {
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
  // them all, and applied through chat.js the LED lights through the diode.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const pd = r.parts[d.label], pl = r.parts[led.label];
  assert.ok(pd && pl, `${where}: analyze().parts has ${d.label} and ${led.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(pd.m.on, true, `${where}: ${d.label} is on: ${JSON.stringify(pd.m)}`);
  assert.ok(Math.abs(pd.m.current - LED_MA) <= 0.02, `${where}: ${d.label} forward at ${LED_MA.toFixed(3)} mA, got ${pd.m.current}`);
  assert.ok(Math.abs(pd.m.drop - D_DROP) <= 0.002, `${where}: ${d.label} drops ${D_DROP.toFixed(4)} V anode to cathode, got ${pd.m.drop}`);
  assert.equal(pl.m.on, true, `${where}: ${led.label} is on: ${JSON.stringify(pl.m)}`);
  assert.ok(Math.abs(pl.m.current - LED_MA) <= 0.02, `${where}: ${led.label} expected ${LED_MA.toFixed(3)} mA, got ${pl.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
  return actions;
}

// The recipe with the battery's two wires swapped: BAT1.0 → tn, BAT1.1 → tp.
function reversedActions(ex) {
  const swap = { [`BAT1.0 -> tp_${N}`]: ['BAT1.0', `tn_${N}`], [`BAT1.1 -> tn_${N}`]: ['BAT1.1', `tp_${N}`] };
  const wires = ex.wires.map(w => swap[w.join(' -> ')] || w);
  assert.notDeepStrictEqual(wires, ex.wires, 'the recipe has the battery wires to swap');
  return recipeActions({ ...ex, wires });
}

function checkReversed(ex) {
  const where = (ex.name || 'the recipe') + ', battery reversed';
  const r = solveActions(reversedActions(ex));
  const d = ex.parts.find(p => p.type === 'diode'), led = ex.parts.find(p => p.type === 'led');
  const pd = r.parts[d.label], pl = r.parts[led.label];
  assert.equal(pd.m.on, false, `${where}: ${d.label} blocks: ${JSON.stringify(pd.m)}`);
  assert.ok(Math.abs(pd.m.current) < 0.01, `${where}: ${d.label} carries under 0.01 mA, got ${pd.m.current}`);
  assert.equal(pl.m.on, false, `${where}: ${led.label} is dark: ${JSON.stringify(pl.m)}`);
  assert.ok(Math.abs(pl.m.current) < 0.01, `${where}: ${led.label} carries under 0.01 mA, got ${pl.m.current}`);
  assert.ok(Math.abs(r.parts.BAT1.m.current) < 0.01, `${where}: the battery gives under 0.01 mA, got ${r.parts.BAT1.m.current}`);
  assert.deepStrictEqual(pd.warnings, [], `${where}: ${d.label} gives no warning (the diode doing its job is not one)`);
  // No part warns at all. The LED is the right way round: it is dark only
  // because the blocking diode cuts its anode off, and nothing drives it in
  // reverse, so it must not say "LED is backwards" (#73).
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no part warns`);
  assert.ok(!text(r).includes(LED_BACKWARDS), `${where}: the results panel has no "backwards" line: ${text(r)}`);
}

// ── The recipe itself ─────────────────────────────────────────────────────

// The recipe handed to the builder meets every rule, forward and reversed,
// so the rules can be met and the layout is proven. The reversed half also
// guards #73: the LED there is dark only because the blocking diode cuts its
// anode off, so it must not say "backwards".
test('the proven protection recipe (PROVEN_DIODE) meets every recipe rule, and reversed nothing conducts and no part warns (#73)', () => {
  diode();
  checkRecipe(PROVEN_DIODE);
  checkReversed(PROVEN_DIODE);
});

test("diode's ai.recipe is a reverse-polarity protection build that meets every recipe rule: LED on at 13.505 mA through the diode's anode, no warnings, no problems", () => {
  const { ai } = diode();
  assert.ok(ai.recipe, 'diode has no ai.recipe: add the worked protection build (PROVEN_DIODE in this file)');
  checkRecipe(ai.recipe);
});

test("diode's ai.recipe with the battery reversed: the diode blocks, nothing conducts (diode, LED, battery under 0.01 mA), and the diode gives no warning", () => {
  const { ai } = diode();
  assert.ok(ai.recipe, 'diode has no ai.recipe: add the worked protection build (PROVEN_DIODE in this file)');
  checkReversed(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('diode\'s ai.guide says + goes to the anode (holeB), the cathode (holeA, the banded end) toward the load, current anode to cathode; ≤ 300 chars, no "recipe"', () => {
  const g = diode().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `diode has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  const near = (a, b) => new RegExp(`${a}[^.;]{0,30}${b}|${b}[^.;]{0,30}${a}`, 'i');
  assert.match(g, near('holeB', 'anode'), 'ai.guide names the anode as holeB');
  assert.match(g, near('holeA', 'cathode'), 'ai.guide names the cathode as holeA');
  assert.match(g, /band/i, 'ai.guide says the cathode is the banded end');
  assert.match(g, /\+[^.;]{0,40}(anode|holeB)|(anode|holeB)[^.;]{0,40}\+/i, 'ai.guide says + goes to the anode (holeB)');
  assert.match(g, /anode to (the )?cathode/i, 'ai.guide says current flows from anode to cathode');
  assert.match(g, /load|resistor|LED/i, 'ai.guide says the cathode goes on toward the load');
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
  const def = diode();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_diode'), `the QA request sends place_diode: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_diode|\bdiode\b/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the diode '
    + '(a heading line with RECIPE and place_diode or "Diode", then numbered steps). '
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a diode recipe block whose numbered steps are the recipe\'s actions, exact tools and holes', () => {
  const steps = qaSteps();
  const want = recipeActions(diode().ai.recipe || PROVEN_DIODE);
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the diode recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, light the LED through the diode', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const pd = r.parts[Ids.nextLabel([], 'diode')], pl = r.parts[Ids.nextLabel([], 'led')];
  assert.ok(pd && pl, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.equal(pd.m.on, true, JSON.stringify(pd.m));
  assert.equal(pl.m.on, true, JSON.stringify(pl.m));
  assert.ok(Math.abs(pl.m.current - LED_MA) <= 0.02, `LED expected ${LED_MA.toFixed(3)} mA, got ${pl.m.current}`);
});

test('the QA request\'s system prompt carries the diode guide line', () => {
  const g = diode().ai.guide;
  assert.ok(g, 'diode has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_diode: ${g}`), 'the prompt has "- place_diode: <guide>"');
});

// Pin (passes today): the recipe and guide go in only when place_diode is
// sent, so the demo and bench prompts, and their goldens
// (test/prompt-golden.test.js), do not change. (Those prompts do name
// place_diode in the generated every-part lines: pin roles, values, sizing.
// That is today's baseline and fine.)
test('pin: the demo and bench requests do not send place_diode, and their prompts carry no diode recipe block or guide line', () => {
  const def = diode();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_diode'), `"${p}" sends place_diode`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a diode recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /diode/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and diode`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the diode guide`);
  }
});
