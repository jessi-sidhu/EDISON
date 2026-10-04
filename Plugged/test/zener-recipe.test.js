// The Zener's worked build, ai.recipe, and its guide (issue #35). The lesson
// of #43 (7-segment) and #33 (diode): the real AI mis-wires a new part
// unless the prompt carries a proven build. The Zener is worse: it is used
// REVERSED, the opposite of the diode (cathode toward +, anode to ground),
// so a model that learned the diode puts it in backwards and it just
// conducts at 0.7 V. So, as for the diode: ai.recipe, a proven regulator the
// server writes into the prompt as numbered steps only when place_zener is
// sent, and an ai.guide that says in plain words which hole goes where.
//
// Shapes these tests assume (stated so the builder matches them):
// - zener's ai.recipe is an Example (parts, wires, expect) for "Build a 5.1 V
//   Zener regulator from a 12 V supply". Its rules are checkRecipe() below.
//   PROVEN_ZENER is one that meets them all (the builder copies it in).
//   The battery is fixed at 9 V, so it is powered by the bench supply
//   (#34) at 12 V: PS1.0 (+) → tp_N, PS1.1 (COM) → tn_N.
// - zener's ai.guide: at most 300 characters, never the word "recipe". It
//   says the Zener is reversed for regulation, the cathode (holeA) goes
//   toward + through a series resistor, and the anode (holeB) to ground.
// - The QA request must also send place_resistor and place_bench_supply, so
//   the recipe's steps are tools the model has. (Tool selection adds the
//   tools a sent part's guide names, as the LED's guide brings
//   place_resistor.)
// - findCircuitProblems must not call a regulating Zener "backwards": its
//   cathode on the + side is how it is used (it has vz). Today it does:
//   "The zener diode at c6/c10 is backwards: …". A core fix in
//   backend/server.js, beside the part.
// - Example → actions, and the prompt's recipe block format:
//   test/fixtures/recipe-steps.js. The prompt is checked on the real path,
//   as in test/diode-recipe.test.js.
// - The demo and bench requests don't send place_zener, so their prompts
//   carry no Zener recipe or guide. (Their goldens still change: the
//   generated every-part lines name every part. That is the builder's
//   UPDATE_GOLDEN step.)
//
// Hand-computed (ideal 12 V supply; the Zener is vz 5.1 V in series with
// 0.1 Ω in breakdown):
//   I = (12 − 5.1) / (1000 + 0.1) = 6.8993 mA,  V = 5.1 + 0.1 Ω × I = 5.10069 V

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
const QA_PROMPT    = 'Build a 5.1 V Zener regulator from a 12 V supply';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const DIODE_PROMPT = 'Add a diode for reverse-polarity protection to an LED circuit';
const SUPPLY_V = 12, SERIES = 1000, VZ = 5.1, RON = 0.1;
const Z_MA = (SUPPLY_V - VZ) / (SERIES + RON) * 1000;   // 6.8993 mA
const Z_V  = VZ + RON * Z_MA / 1000;                     // 5.10069 V

// The recipe proven here: every rule in checkRecipe holds, and it simulates
// to the Zener in breakdown at 5.1007 V and 6.899 mA with no warnings.
// Layout (top half):
//   PS1 at 12 V on tp_63 / tn_63;  tp_2 → a2;  R1 b2–b6 1 kΩ;
//   ZD1 cathode c6 (on R1's column), anode c10;  a10 → tn_10.
const PROVEN_ZENER = {
  name:  "Bench supply at 12 V; + through 1 kΩ into the Zener's cathode (holeA); its anode (holeB) to ground: it holds 5.1 V",
  parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
          { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
          { type: 'zener', label: 'ZD1', holes: ['c6', 'c10'] }],                          // cathode c6, anode c10
  wires: [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['tp_2', 'a2'], ['a10', 'tn_10']],
  expect: { ZD1: { mode: 'breakdown', voltage: [5.0, 5.2], current: [6.6, 7.2] } },
};

function zener() {
  const def = Parts.get('zener');
  assert.ok(def, "Parts.get('zener') is null: parts/zener.js must exist and be listed in parts/index.js");
  return def;
}

// ── A board that keeps real records, as in test/diode-recipe.test.js ──────

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

// ── The rules a regulator recipe must meet ────────────────────────────────

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

  // The bench supply at 12 V (the battery is fixed at 9 V), wired to the
  // rails at the highest column; no battery.
  assert.deepStrictEqual(ex.parts.filter(p => p.type === 'battery').map(p => p.label), [], `${where}: no battery (9 V only)`);
  const sups = ex.parts.filter(p => p.type === 'bench_supply');
  assert.deepStrictEqual(sups.map(p => p.label), ['PS1'], `${where}: one bench supply, PS1`);
  const volts = (sups[0].values && sups[0].values.voltage) || Parts.get('bench_supply').values.voltage.default;
  assert.equal(volts, SUPPLY_V, `${where}: PS1 is at 12 V`);
  const wireKeys = ex.wires.map(w => w.join(' -> '));
  for (const w of [`PS1.0 -> tp_${N}`, `PS1.1 -> tn_${N}`]) {
    assert.ok(wireKeys.includes(w), `${where}: wire ${w} (supply to the rails at the highest column); wires ${JSON.stringify(wireKeys)}`);
  }
  assert.ok(!ex.wires.flat().includes('PS1.2'), `${where}: the − terminal stays unused`);

  // One 5.1V Zener; one 1 kΩ series resistor; at most one load resistor.
  const zs = ex.parts.filter(p => p.type === 'zener');
  assert.equal(zs.length, 1, `${where}: one zener; got ${zs.map(p => p.label).join(', ') || 'none'}`);
  const z = zs[0];
  assert.ok(!(z.values && z.values.model) || z.values.model === '5.1V', `${where}: ${z.label} is the 5.1V model`);
  const others = ex.parts.filter(p => !['bench_supply', 'zener', 'resistor'].includes(p.type));
  assert.deepStrictEqual(others.map(p => p.type), [], `${where}: only the supply, the Zener and resistors`);

  // The path: + → series R → the Zener's CATHODE (holeA); ANODE (holeB) → ground.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), GND = net('tn_1');
  const [zCath, zAnode] = z.holes;
  const NODE = net(zCath);
  assert.notEqual(NODE, PLUS, `${where}: ${z.label}'s cathode, holeA ${zCath}, is not wired straight to + (it needs the series resistor)`);
  assert.notEqual(NODE, GND, `${where}: ${z.label}'s cathode, holeA ${zCath}, is not on ground: the Zener is REVERSED, cathode toward +`);
  assert.equal(net(zAnode), GND, `${where}: ${z.label}'s ANODE, holeB ${zAnode}, goes to ground (tn)`);
  const rs = ex.parts.filter(p => p.type === 'resistor');
  const series = rs.filter(p => { const ns = p.holes.map(net); return ns.includes(PLUS) && ns.includes(NODE); });
  assert.equal(series.length, 1, `${where}: one resistor from + to ${z.label}'s cathode ${zCath}; got ${series.map(p => p.label).join(', ') || 'none'}`);
  assert.equal(series[0].values && series[0].values.resistance, SERIES, `${where}: ${series[0].label} is 1 kΩ`);
  const loads = rs.filter(p => p !== series[0]);
  assert.ok(loads.length <= 1, `${where}: at most one load resistor`);
  for (const l of loads) {
    const ns = l.holes.map(net).sort();
    assert.deepStrictEqual(ns, [NODE, GND].sort(), `${where}: load ${l.label} sits across the Zener (its cathode node and ground)`);
  }

  // Nothing shorted by accident: every pin is on +, the node or ground, and
  // no part has both pins on one net.
  for (const p of ex.parts.filter(q => q.holes)) {
    const ns = p.holes.map(net);
    assert.notEqual(ns[0], ns[1], `${where}: ${p.label}'s two legs are shorted together (${p.holes.join(', ')})`);
    for (const [h, n] of p.holes.map((h, k) => [h, ns[k]])) {
      assert.ok([PLUS, NODE, GND].includes(n), `${where}: ${p.label}'s ${h} is on a stray net, off the circuit`);
    }
  }

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts: 3–5 columns on one row, no two overlapping on a row, and no
  // wire under a part (over a leg, or between a span part's legs on its row).
  const spans = ex.parts.filter(p => (p.holes || []).length === 2 && p.holes.every(isBody) && rowOf(p.holes[0]) === rowOf(p.holes[1]))
    .map(p => ({ label: p.label, row: rowOf(p.holes[0]), lo: Math.min(...p.holes.map(colOf)), hi: Math.max(...p.holes.map(colOf)) }));
  for (const s of spans) {
    assert.ok(s.hi - s.lo >= 3 && s.hi - s.lo <= 5, `${where}: ${s.label} spans ${s.hi - s.lo} columns, not 3–5`);
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

  // As AI actions: findCircuitProblems finds nothing (a regulating Zener is
  // not "backwards"), finishAIReply keeps them all, and applied through
  // chat.js the Zener breaks down at 5.1 V.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions, `${where}: finishAIReply keeps every action`);
  assert.equal(out.reply, 'Built it.', `${where}: no "Heads up" added to the reply`);

  const r = solveActions(actions);
  const pz = r.parts[z.label];
  assert.ok(pz, `${where}: analyze().parts has ${z.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(pz.m.mode, 'breakdown', `${where}: ${z.label} regulates (breakdown): ${JSON.stringify(pz.m)}`);
  assert.ok(pz.m.voltage >= 5.0 && pz.m.voltage <= 5.2, `${where}: ${z.label} holds 5.0–5.2 V, got ${pz.m.voltage}`);
  const loadMA = loads.reduce((s, l) => s + pz.m.voltage / l.values.resistance * 1000, 0);
  const wantMA = (SUPPLY_V - pz.m.voltage) / SERIES * 1000 - loadMA;
  assert.ok(Math.abs(pz.m.current - wantMA) <= 0.02, `${where}: ${z.label} takes ${wantMA.toFixed(3)} mA, got ${pz.m.current}`);
  if (!loads.length) {
    assert.ok(Math.abs(pz.m.current - Z_MA) <= 0.01, `${where}: hand ${Z_MA.toFixed(4)} mA, got ${pz.m.current}`);
    assert.ok(Math.abs(pz.m.voltage - Z_V) <= 0.001, `${where}: hand ${Z_V.toFixed(5)} V, got ${pz.m.voltage}`);
  }
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

test('the proven regulator recipe (PROVEN_ZENER) meets every recipe rule: breakdown at 5.1007 V, 6.899 mA, no problems, no warnings', () => {
  zener();
  checkRecipe(PROVEN_ZENER);
});

test("zener's ai.recipe is a 12 V → 1 kΩ → reversed 5.1V Zener regulator that meets every recipe rule", () => {
  const { ai } = zener();
  assert.ok(ai.recipe, 'zener has no ai.recipe: add the worked regulator build (PROVEN_ZENER in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('zener\'s ai.guide says it is reversed: cathode (holeA) toward + through a series resistor, anode (holeB) to ground; ≤ 300 chars, no "recipe"', () => {
  const g = zener().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `zener has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  const near = (a, b) => new RegExp(`(${a})[^.;]{0,40}(${b})|(${b})[^.;]{0,40}(${a})`, 'i');
  assert.match(g, /revers/i, 'ai.guide says the Zener is reversed for regulation');
  assert.match(g, near('holeA', 'cathode'), 'ai.guide names the cathode as holeA');
  assert.match(g, near('holeB', 'anode'), 'ai.guide names the anode as holeB');
  assert.match(g, near('cathode', '\\+|positive'), 'ai.guide says the cathode goes toward +');
  assert.match(g, near('anode', 'ground|GND|\\btn'), 'ai.guide says the anode goes to ground');
  assert.match(g, /series resistor|resistor in series/i, 'ai.guide says it needs a series resistor');
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
    for (const p of [QA_PROMPT, DEMO_PROMPT, BENCH_PROMPT, DIODE_PROMPT]) sent[p] = await capture(p);
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

test('the QA request sends place_zener, and the recipe\'s other tools: place_resistor and place_bench_supply', () => {
  zener();
  const got = toolNames(sent[QA_PROMPT]);
  for (const n of ['place_zener', 'place_resistor', 'place_bench_supply']) {
    assert.ok(got.includes(n), `the QA request sends ${n}: ${JSON.stringify(got)}`);
  }
});

// The recipe steps in the prompt sent for the QA request.
function qaSteps() {
  const def = zener();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_zener'), `the QA request sends place_zener: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_zener|\bzener\b/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the Zener '
    + '(a heading line with RECIPE and place_zener or "Zener", then numbered steps). '
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a Zener recipe block whose numbered steps are the recipe\'s actions, exact tools and holes', () => {
  const steps = qaSteps();
  const want = recipeActions(zener().ai.recipe || PROVEN_ZENER);
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the Zener recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, hold 5.0–5.2 V in breakdown', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const pz = r.parts[Ids.nextLabel([], 'zener')];
  assert.ok(pz, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.equal(pz.m.mode, 'breakdown', JSON.stringify(pz.m));
  assert.ok(pz.m.voltage >= 5.0 && pz.m.voltage <= 5.2, `Zener expected 5.0–5.2 V, got ${pz.m.voltage}`);
  assert.deepStrictEqual(warnedOf(r), []);
});

test('the QA request\'s system prompt carries the Zener guide line', () => {
  const g = zener().ai.guide;
  assert.ok(g, 'zener has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_zener: ${g}`), 'the prompt has "- place_zener: <guide>"');
});

// The recipe and guide go in only when place_zener is sent, so the demo,
// bench and diode prompts carry none of it.
test('the demo, bench and diode requests do not send place_zener, and their prompts carry no Zener recipe block or guide line', () => {
  const def = zener();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT, DIODE_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_zener'), `"${p}" sends place_zener`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a Zener recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /zener/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and zener`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the Zener guide`);
  }
});
