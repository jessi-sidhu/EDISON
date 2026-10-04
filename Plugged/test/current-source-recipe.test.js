// The current source's worked build, ai.recipe, and its guide (#38). The
// lesson of #43, #33 and #35: from pin names alone the real AI mis-wires a
// new part, so each new part gets a proven build the server writes into the
// prompt as numbered steps, only when its tool is sent, and a guide in plain
// words. The current source's traps: its direction (current leaves `to`,
// holeB, and comes back into `from`, holeA), that `from` is the ground side,
// and that it needs no battery, though the prompt says every circuit does.
//
// Shapes these tests assume (stated so the builder matches them):
// - current_source's ai.recipe is an Example (parts, wires, expect) for
//   "Build a nodal analysis circuit with a 10 mA current source and two
//   resistors". Its rules are checkRecipe() below; PROVEN_ISRC meets them all
//   (the builder copies it in, with the source's label = its prefix + 1):
//   the 10 mA source's `to` into one node with two 1 kΩ resistors to ground,
//   its `from` wired to the tn rail. No battery.
// - current_source's ai.guide: at most 300 characters, never the word
//   "recipe" (the prompt line "- place_current_source: <guide>" would read as
//   a recipe heading). It says current leaves `to` (holeB) and returns into
//   `from` (holeA), which is ground (wired to a tn rail), that it needs no
//   battery, and names place_resistor (so that tool is sent with it).
// - The prompt is checked on the real path, as in test/bulb-recipe.test.js:
//   AI_PROVIDER=deepseek, the real server, POST /api/ask on an empty board, a
//   fake global fetch that keeps the first body, messages[0].content.
// - The demo and bench requests don't send place_current_source, so no recipe
//   block or guide line for it goes into their prompts. (Registering the part
//   does change their goldens in the generated every-part lines, labels and
//   the set_value tool's `current`; the orchestrator regenerates those.)
//
// Hand-computed: 10 mA into 1 kΩ ∥ 1 kΩ = 500 Ω: the node at 5.0 V, 5 mA
// through each resistor, 5.0 V across the source.

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
const QA_PROMPT    = 'Build a nodal analysis circuit with a 10 mA current source and two resistors';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

function isrc() {
  const def = Parts.get('current_source');
  assert.ok(def, "Parts.get('current_source') is null: parts/current_source.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here, on the simulator with the I stamp added and a
// stand-in source of the issue's shape (I(from, to, 0.01), span 2–5):
// IS1 5.00 V across, R1 and R2 5.00 mA each; every rule in checkRecipe holds
// but findCircuitProblems, which today calls all three parts "not connected
// between power and ground" (it knows only V sources). Layout (top half):
//   source b2 (from) – b5 (to);  a2 → tn_2 (from to ground);
//   R1 c5–c9, a9 → tn_9;  R2 d5–d10, a10 → tn_10.  Node = column 5.
function provenIsrc() {
  const is = isrc().prefix + '1';
  return {
    name:  'A 10 mA current source into two 1 kΩ resistors in parallel: the node sits at 5.0 V, 5 mA through each',
    parts: [{ type: 'current_source', label: is, holes: ['b2', 'b5'] },
            { type: 'resistor', label: 'R1', holes: ['c5', 'c9'], values: { resistance: 1000 } },
            { type: 'resistor', label: 'R2', holes: ['d5', 'd10'], values: { resistance: 1000 } }],
    wires: [['a2', 'tn_2'], ['a9', 'tn_9'], ['a10', 'tn_10']],
    expect: { [is]: { current: [9.99, 10.01], voltage: [4.99, 5.01] },
              R1: { current: [4.99, 5.01] }, R2: { current: [4.99, 5.01] } },
  };
}

// ── A board that keeps real records, as in test/bulb-recipe.test.js ──

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

// The applied build reads 5.0 V across the source and 5 mA through each 1 kΩ.
function assertFiveVolts(r, where) {
  const is = Ids.nextLabel([], 'current_source');
  const s = r.parts[is];
  assert.ok(s, `${where}: analyze().parts has ${is}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.ok(Math.abs(s.m.voltage - 5) <= 0.01, `${where}: 5.0 V across ${is} (10 mA into 500 Ω), got ${JSON.stringify(s.m)}`);
  for (const R of ['R1', 'R2']) {
    assert.ok(r.parts[R] && Math.abs(r.parts[R].m.current - 5) <= 0.01, `${where}: 5 mA through ${R}, got ${JSON.stringify(r.parts[R] && r.parts[R].m)}`);
  }
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
  assert.doesNotMatch(text(r), /no path|Circuit open|No battery|⚠/i, `${where}: ${text(r)}`);
}

// ── The rules a current-source recipe must meet ───────────────────────────

const HOLE   = /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/;
const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));
const half   = h => (isBody(h) ? (ROWS.indexOf(rowOf(h)) < 5 ? 'top' : 'bot') : null);

function wireCells([from, to]) {
  const ends = [from, to].filter(h => HOLE.test(h));
  if (ends.length < 2 || colOf(ends[0]) !== colOf(ends[1])) return ends.filter(isBody);
  const [lo, hi] = [rowIdx(rowOf(ends[0])), rowIdx(rowOf(ends[1]))].sort((x, y) => x - y);
  return ROWS.filter((_, i) => i >= lo && i <= hi).map(r => r + colOf(ends[0]));
}

function checkRecipe(ex) {
  const where = ex.name || 'the recipe';
  assert.ok(ex && Array.isArray(ex.parts) && Array.isArray(ex.wires) && ex.expect, `${where}: an Example (parts, wires, expect)`);

  // No battery or other source: the current source is the only one.
  const others = ex.parts.filter(p => p.type !== 'current_source' && Parts.get(p.type) && Parts.get(p.type).ref !== undefined);
  assert.deepStrictEqual(others.map(p => p.label), [], `${where}: no battery or other source`);

  // One current source at its defaults (10 mA), labelled as it will be
  // placed, on one row 2–5 columns apart, its `from` column wired to a tn rail.
  const srcs = ex.parts.filter(p => p.type === 'current_source');
  assert.equal(srcs.length, 1, `${where}: one current source`);
  const s = srcs[0];
  assert.ok(!s.values || Object.keys(s.values).length === 0 || s.values.current === 0.01, `${where}: ${s.label} at 10 mA: ${JSON.stringify(s.values)}`);
  assert.equal(s.label, Ids.nextLabel(ex.parts.slice(0, ex.parts.indexOf(s)), 'current_source'), `${where}: the label it gets when placed`);
  const [from, to] = s.holes;
  const d = Math.abs(colOf(from) - colOf(to));
  assert.ok(isBody(from) && isBody(to) && rowOf(from) === rowOf(to) && d >= 2 && d <= 5,
    `${where}: ${s.label} ${from}–${to} on one row, 2–5 columns apart`);
  const toGround = ex.wires.some(w => w.some(e => /^tn_\d+$/.test(e))
    && w.some(e => isBody(e) && colOf(e) === colOf(from) && half(e) === half(from)));
  assert.ok(toGround, `${where}: a wire from ${s.label}'s \`from\` column (${colOf(from)}) to a tn rail: ${JSON.stringify(ex.wires)}`);

  // Two 1 kΩ resistors, each from the `to` column (same half) to ground.
  const rs = ex.parts.filter(p => p.type === 'resistor');
  assert.equal(rs.length, 2, `${where}: two resistors`);
  for (const r of rs) {
    assert.equal(r.values && r.values.resistance, 1000, `${where}: ${r.label} is 1 kΩ`);
    assert.ok(r.holes.some(h => colOf(h) === colOf(to) && half(h) === half(to)), `${where}: ${r.label} has a leg in the \`to\` column ${colOf(to)}`);
  }
  assert.ok(Array.isArray(ex.expect[s.label] && ex.expect[s.label].voltage), `${where}: expect.${s.label}.voltage is a range`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts on one row don't overlap, and no wire lies under a part.
  const spans = ex.parts.filter(p => (p.holes || []).length === 2 && p.holes.every(isBody) && rowOf(p.holes[0]) === rowOf(p.holes[1]))
    .map(p => ({ label: p.label, row: rowOf(p.holes[0]), lo: Math.min(...p.holes.map(colOf)), hi: Math.max(...p.holes.map(colOf)) }));
  for (const a of spans) {
    for (const b of spans) {
      if (a === b || a.row !== b.row) continue;
      assert.ok(a.hi < b.lo || b.hi < a.lo, `${where}: ${a.label} and ${b.label} overlap on row ${a.row}`);
    }
  }
  const legs = new Set(ex.parts.flatMap(p => p.holes || []));
  for (const w of ex.wires) {
    for (const cell of wireCells(w)) {
      assert.ok(!legs.has(cell), `${where}: wire ${w.join(' -> ')} ${w.includes(cell) ? 'ends in' : 'passes over'} ${cell}, a part's leg`);
      const under = spans.find(x => x.row === rowOf(cell) && colOf(cell) > x.lo && colOf(cell) < x.hi);
      assert.ok(!under, `${where}: wire ${w.join(' -> ')} passes under ${under && under.label} at ${cell}`);
    }
  }

  // As AI actions: findCircuitProblems finds nothing; finishAIReply keeps
  // them all; applied, 5.0 V across the source and 5 mA through each.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);
  assert.equal(kept.reply, 'Built it.', `${where}: no "Heads up" in the reply`);
  assertFiveVolts(solveActions(actions), where);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

test('the proven recipe (provenIsrc: 10 mA into 1 kΩ ∥ 1 kΩ, no battery) meets every recipe rule: 5.0 V, 5 mA each', () => {
  checkRecipe(provenIsrc());
});

test("current_source's ai.recipe puts 10 mA into two 1 kΩ to ground: 5.0 V, 5 mA each, every recipe rule, no problems", () => {
  const { ai } = isrc();
  assert.ok(ai.recipe, 'current_source has no ai.recipe: add the worked build (provenIsrc in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('current_source\'s ai.guide: current leaves `to` (holeB) and returns into `from` (holeA), the ground side on a tn rail; no battery; names place_resistor; ≤ 300 chars, no "recipe"', () => {
  const g = isrc().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `current_source has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /\bto\b[^.]*holeB|holeB[^.]*\bto\b/, 'ai.guide ties `to` to holeB');
  assert.match(g, /\bfrom\b[^.]*holeA|holeA[^.]*\bfrom\b/, 'ai.guide ties `from` to holeA');
  assert.match(g, /\bleaves?\b|\bout of\b|\bpushes\b/i, 'ai.guide says where the current leaves');
  assert.match(g, /ground|\btn\b/i, 'ai.guide says `from` is ground (wired to a tn rail)');
  assert.match(g, /no battery|without a battery|not need a battery|needs no battery|battery is not needed/i, 'ai.guide says it needs no battery');
  assert.match(g, /\bplace_resistor\b/, 'ai.guide names place_resistor, so that tool is sent with it');
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
  const def = isrc();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_current_source'), `the QA request sends place_current_source: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_current_source|current source/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the current source '
    + `(a heading line with RECIPE and place_current_source or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request sends place_current_source and place_resistor, and its prompt says holeA = from, holeB = to', () => {
  isrc();
  const names = toolNames(sent[QA_PROMPT]);
  assert.ok(names.includes('place_current_source') && names.includes('place_resistor'), JSON.stringify(names));
  assert.ok(systemOf(sent[QA_PROMPT]).includes('- place_current_source: holeA = from, holeB = to'), 'the generated pin-role line');
});

test('the QA request\'s system prompt has a current-source recipe block whose numbered steps are the recipe\'s actions, with no place_battery', () => {
  const steps = qaSteps();
  const want = recipeActions(isrc().ai.recipe || provenIsrc());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.ok(!steps.some(s => s.tool === 'place_battery'), 'no battery in the current-source build');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, read 5.0 V and 5 mA each', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  assertFiveVolts(solveActions(steps), 'the prompt\'s steps');
});

test('the QA request\'s system prompt carries the current-source guide line', () => {
  const g = isrc().ai.guide;
  assert.ok(g, 'current_source has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_current_source: ${g}`), 'the prompt has "- place_current_source: <guide>"');
});

// Guard: the recipe and guide go in only when place_current_source is sent.
// The demo says "current-limiting", so the source's keywords must not drag
// it (or its recipe) into the demo request. (Fails today only because the
// part isn't registered.)
test('the demo and bench requests do not send place_current_source, and their prompts carry no current-source recipe block or guide line', () => {
  const def = isrc();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_current_source'), `"${p}" sends place_current_source: ${JSON.stringify(toolNames(sent[p]))}`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a current-source recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /current source|current_source/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and current source`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the current-source guide`);
  }
});
