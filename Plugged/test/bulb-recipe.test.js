// The bulb's worked build, ai.recipe, and its guide (#36). The lesson of #43,
// #33 and #35: from pin names alone the real AI mis-wires a new part, so
// each new part gets a proven build the server writes into the prompt as
// numbered steps, only when its tool is sent, and a guide in plain words.
// The bulb's trap is the battery: it is 9 V unless given a voltage, and 9 V
// straight across the 6 V bulb is 2.25 × its rated power ("would burn out").
// The recipe sets the battery to the bulb's rating.
//
// Shapes these tests assume (stated so the builder matches them):
// - bulb's ai.recipe is an Example (parts, wires, expect) for "Light a 6 V
//   bulb from a battery". Its rules are checkRecipe() below; provenBulb()
//   meets them all (the builder copies it in, with the bulb's label = its
//   prefix + 1): the battery at 6 V (values: { voltage: 6 }, so the prompt's
//   step is "place_battery: voltage=6") straight across the 60 Ω / 6 V bulb.
// - bulb's ai.guide: at most 300 characters, never the word "recipe" (the
//   prompt line "- place_bulb: <guide>" would read as a recipe heading). It
//   says the bulb has no polarity (either way round) and to match the
//   battery voltage to its rating (set the battery to 6 V for a 6 V bulb).
// - The prompt is checked on the real path, as in
//   test/toggle-switch-recipe.test.js: AI_PROVIDER=deepseek, the real
//   server, POST /api/ask on an empty board, a fake global fetch that keeps
//   the first body, messages[0].content.
// - The demo and bench requests don't send place_bulb, so no recipe block
//   or guide line for it goes into their prompts. (Registering the part does
//   change their goldens in the generated every-part lines and labels; the
//   orchestrator regenerates those.)
//
// Hand-computed (ideal battery; the bulb is a plain 60 Ω resistor, rated
// 6² / 60 = 0.6 W): 6 V across it is 100 mA, 0.6 W, brightness 1.0.

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
const QA_PROMPT    = 'Light a 6 V bulb from a battery';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

function bulb() {
  const def = Parts.get('bulb');
  assert.ok(def, "Parts.get('bulb') is null: parts/bulb.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here (on the real simulator, with a stand-in bulb of the
// issue's shape: R(1, 2, 60 Ω), span 2–4): every rule in checkRecipe holds,
// findCircuitProblems finds nothing, finishAIReply keeps every action, and
// applied through chat.js the battery supplies 100.0 mA and the bulb takes
// 0.60 W at brightness 1.0, no warnings. Layout (top half):
//   BAT1 at 6 V → tp_63 / tn_63;  tp_2 → a2;  bulb b2 (pin 1) – b5 (pin 2);  a5 → tn_5.
function provenBulb() {
  const lp = bulb().prefix + '1';
  return {
    name:  'A 6 V battery straight across the 6 V bulb: it lights at full brightness (100 mA, 0.6 W)',
    parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 6 } },
            { type: 'bulb', label: lp, holes: ['b2', 'b5'] }],
    wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_2', 'a2'], ['a5', 'tn_5']],
    expect: { [lp]: { brightness: [0.99, 1.0], power: [0.59, 0.61] },
              BAT1: { current: [99.5, 100.5] } },
  };
}

// ── A board that keeps real records, as in test/toggle-switch-recipe.test.js ──

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
    return Object.assign(v, given || {});
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
      parts.push(rec);
      return rec;
    },
    setValues(comp, v) { comp.values = Object.assign({}, comp.values, v); },
    setControls(comp, c) { comp.controls = Object.assign({}, comp.controls, c); },
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

// ── The rules a bulb recipe must meet ─────────────────────────────────────

const HOLE   = /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/;
const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));

function wireCells([from, to]) {
  const ends = [from, to].filter(h => HOLE.test(h));
  if (ends.length < 2 || colOf(ends[0]) !== colOf(ends[1])) return ends.filter(isBody);
  const [lo, hi] = [rowIdx(rowOf(ends[0])), rowIdx(rowOf(ends[1]))].sort((x, y) => x - y);
  return ROWS.filter((_, i) => i >= lo && i <= hi).map(r => r + colOf(ends[0]));
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

  // One bulb at its defaults (60 Ω / 6 V), labelled as it will be placed,
  // on one row 2–4 columns apart; the example checks its brightness.
  const bulbs = ex.parts.filter(p => p.type === 'bulb');
  assert.equal(bulbs.length, 1, `${where}: one bulb; got ${bulbs.map(p => p.label).join(', ') || 'none'}`);
  const b = bulbs[0];
  assert.ok(!b.values || Object.keys(b.values).length === 0, `${where}: ${b.label} is the default 60 Ω / 6 V bulb: ${JSON.stringify(b.values)}`);
  const before = ex.parts.slice(0, ex.parts.indexOf(b));
  assert.equal(b.label, Ids.nextLabel(before, 'bulb'), `${where}: the bulb's label is the one it gets when placed`);
  const [x, y] = b.holes;
  const d = Math.abs(colOf(x) - colOf(y));
  assert.ok(isBody(x) && isBody(y) && rowOf(x) === rowOf(y) && d >= 2 && d <= 4,
    `${where}: ${b.label} ${x}–${y} on one row, 2–4 columns apart`);
  const want = ex.expect[b.label] && ex.expect[b.label].brightness;
  assert.ok(Array.isArray(want) && want[0] <= 1 && want[1] >= 1, `${where}: expect.${b.label}.brightness is a range holding 1.0: ${JSON.stringify(ex.expect)}`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts on one row don't overlap, and no wire lies under a part.
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

  // As AI actions: findCircuitProblems finds nothing; finishAIReply keeps
  // them all; applied, the bulb is at full brightness with no warnings.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const pb = r.parts[b.label];
  assert.ok(pb, `${where}: analyze().parts has ${b.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.ok(Math.abs(pb.m.brightness - 1) <= 0.005, `${where}: ${b.label} at brightness 1.0, got ${JSON.stringify(pb.m)}`);
  assert.ok(Math.abs(pb.m.power - 0.6) <= 0.005, `${where}: ${b.label} takes its rated 0.6 W, got ${pb.m.power}`);
  assert.ok(Math.abs(r.parts.BAT1.m.current - 100) <= 0.5, `${where}: 100 mA through the bulb, got ${r.parts.BAT1.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings (no "would burn out", no resistor over its rating)`);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Fails today only because the part isn't registered (its label needs the
// prefix); proven on the simulator with a stand-in of the issue's shape.
test('the proven bulb recipe (provenBulb: 6 V battery straight across the bulb) meets every recipe rule: 100 mA, 0.6 W, brightness 1.0', () => {
  checkRecipe(provenBulb());
});

test("bulb's ai.recipe lights the bulb at full brightness (100 mA, 0.6 W): every recipe rule, no warnings, no problems", () => {
  const { ai } = bulb();
  assert.ok(ai.recipe, 'bulb has no ai.recipe: add the worked build (provenBulb in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('bulb\'s ai.guide says it has no polarity and to match the battery voltage to its rating; ≤ 300 chars, no "recipe"', () => {
  const g = bulb().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `bulb has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /polarity|either way|either direction|any way round/i, 'ai.guide says the bulb has no polarity');
  assert.match(g, /battery/i, 'ai.guide names the battery');
  assert.match(g, /volt|\d ?V\b/i, 'ai.guide talks about the voltage');
  assert.match(g, /rating|rated/i, 'ai.guide says to match the bulb\'s rating');
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
  const def = bulb();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_bulb'), `the QA request sends place_bulb: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_bulb|\bbulb\b/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the bulb '
    + `(a heading line with RECIPE and place_bulb or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a bulb recipe block whose numbered steps are the recipe\'s actions, with "place_battery: voltage=6"', () => {
  const steps = qaSteps();
  const want = recipeActions(bulb().ai.recipe || provenBulb());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.deepStrictEqual(steps.find(s => s.tool === 'place_battery'), { tool: 'place_battery', voltage: 6 },
    'the battery is set to the bulb\'s 6 V');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the bulb recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, light the bulb at brightness 1.0 with no warnings', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const pb = r.parts[Ids.nextLabel([], 'bulb')];
  assert.ok(pb, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.ok(Math.abs(pb.m.brightness - 1) <= 0.005, JSON.stringify(pb.m));
  assert.deepStrictEqual(warnedOf(r), []);
});

test('the QA request\'s system prompt carries the bulb guide line', () => {
  const g = bulb().ai.guide;
  assert.ok(g, 'bulb has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_bulb: ${g}`), 'the prompt has "- place_bulb: <guide>"');
});

// Guard: the recipe and guide go in only when place_bulb is sent. The demo
// says "LED", and "light"/"lamp" are the LED's keywords too, so the bulb's
// keywords must not drag place_bulb (or its recipe) into the demo request.
// (Fails today only because the part isn't registered.)
test('the demo and bench requests do not send place_bulb, and their prompts carry no bulb recipe block or guide line', () => {
  const def = bulb();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_bulb'), `"${p}" sends place_bulb: ${JSON.stringify(toolNames(sent[p]))}`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a bulb recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /bulb/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and bulb`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the bulb guide`);
  }
});
