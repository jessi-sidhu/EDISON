// The DC motor's worked build, ai.recipe, and its guide (#37). The lesson of
// #43 and #33: from pin names alone the real AI mis-wires a new part, so each
// new part gets a proven build the server writes into the prompt as numbered
// steps, only when its tool is sent, and a guide in plain words. The motor
// has two traps: the switch it is built with starts OPEN (the build must
// close it), and the default 9 V battery straight across the 10 Ω motor is
// 900 mA, over the 0.5 A limit. The recipe sets the battery to 3 V (300 mA,
// full speed, no warning) and ends by closing the switch.
//
// Shapes these tests assume (stated so the builder matches them):
// - motor's ai.recipe is an Example (parts, wires, expect): the battery at a
//   lower voltage → the toggle switch → the motor → ground, with the switch's
//   part entry carrying controls: { closed: true }. Its rules are
//   checkRecipe() below; PROVEN_MOTOR meets them all (the builder copies it
//   in, with the switch's label = its prefix + 1 and the motor's the same).
// - motor's ai.guide: at most 300 characters, never the word "recipe" (the
//   prompt line "- place_motor: <guide>" would read as a recipe heading). It
//   says the motor has no polarity (either way round works; reversing it
//   reverses the spin), to keep the current under 0.5 A, and names every
//   tool the recipe needs besides the battery (place_toggle_switch, plus
//   place_resistor if a resistor is used), because tool selection only pulls
//   in tools named in a sent part's guide or matched by keywords.
// - The prompt is checked on the real path, as in
//   test/toggle-switch-recipe.test.js: AI_PROVIDER=deepseek, the real server,
//   POST /api/ask on an empty board, a fake global fetch that keeps the first
//   body, messages[0].content.
// - The demo and bench requests don't send place_motor, so no recipe block
//   or guide line for it goes into their prompts. (Registering the part does
//   change their goldens in the generated every-part lines; the orchestrator
//   regenerates those.)
//
// Hand-computed (ideal 3 V battery; the closed switch is 1 mΩ; the motor is
// 10 Ω, start 50 mA, full speed from 250 mA):
//   I = 3 / (10 + 0.001) = 299.97 mA → spinning, speed 1, under 0.5 A
//   switch open: 0 mA, not spinning

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
const QA_PROMPT    = 'Make a motor spin with a switch';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const MOTOR_MA = 3 / (10 + 0.001) * 1000;   // 299.97 mA

function motor() {
  const def = Parts.get('motor');
  assert.ok(def, "Parts.get('motor') is null: parts/motor.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here (on the real simulator, with a stand-in motor of
// the issue's shape: R(1, 2, 10 Ω), span 3–5, spinning at ≥ 50 mA, warning
// over 0.5 A): every rule in checkRecipe holds, findCircuitProblems finds
// nothing, finishAIReply keeps every action, and applied through chat.js the
// motor spins at 299.97 mA with no warnings; without the set_control step
// the circuit is open. Layout (top half, C = 2):
//   BAT1 at 3 V on tp_63 / tn_63;  tp_2 → a2;  switch b2 (pin 1) – b4 (pin 2);
//   motor c4 (pin 1) – c8 (pin 2);  a8 → tn_8;  then close the switch.
function provenMotor() {
  const sw = Parts.get('toggle_switch').prefix + '1';
  const mo = motor().prefix + '1';
  return {
    name:  'The battery at 3 V, + into the switch, the switch into the motor, the motor to ground; closed, it spins at 300 mA',
    parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 3 } },
            { type: 'toggle_switch', label: sw, holes: ['b2', 'b4'], controls: { closed: true } },
            { type: 'motor', label: mo, holes: ['c4', 'c8'] }],
    wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_2', 'a2'], ['a8', 'tn_8']],
    expect: { [sw]: { closed: true, current: [299, 301] },
              [mo]: { spinning: true, current: [299, 301] } },
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

// ── The rules a motor recipe must meet ────────────────────────────────────

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

  // One switch, closed, and one motor, each labelled as it will be placed;
  // anything else is at most one resistor.
  const one = type => {
    const ps = ex.parts.filter(p => p.type === type);
    assert.equal(ps.length, 1, `${where}: one ${type}; got ${ps.map(p => p.label).join(', ') || 'none'}`);
    return ps[0];
  };
  const sw = one('toggle_switch'), mo = one('motor');
  const others = ex.parts.filter(p => !['battery', 'toggle_switch', 'motor'].includes(p.type));
  assert.ok(others.every(p => p.type === 'resistor') && others.length <= 1,
    `${where}: besides the battery, switch and motor, at most one resistor; got ${JSON.stringify(others.map(p => p.type))}`);
  assert.deepStrictEqual(sw.controls, { closed: true }, `${where}: ${sw.label} sets controls { closed: true }, so the build closes it`);
  for (const p of [sw, mo]) {
    assert.equal(p.label, Ids.nextLabel(ex.parts.slice(0, ex.parts.indexOf(p)), p.type),
      `${where}: ${p.label}'s label is the one it gets when placed`);
  }
  const [x, y] = sw.holes;
  assert.ok(isBody(x) && isBody(y) && rowOf(x) === rowOf(y) && Math.abs(colOf(x) - colOf(y)) === 2,
    `${where}: ${sw.label} ${x}–${y} on one row, 2 columns apart`);
  const [p1, p2] = mo.holes;
  assert.ok(isBody(p1) && isBody(p2) && rowOf(p1) === rowOf(p2) && Math.abs(colOf(p1) - colOf(p2)) >= 3 && Math.abs(colOf(p1) - colOf(p2)) <= 5,
    `${where}: ${mo.label} ${p1}–${p2} on one row, 3–5 columns apart`);

  // The series path: + → the switch → (a resistor) → the motor → ground.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), GND = net('tn_1');
  const swNets = sw.holes.map(net);
  const inPin = swNets.indexOf(PLUS);
  assert.ok(inPin >= 0, `${where}: + (tp) goes into one pin of ${sw.label} (${sw.holes.join(', ')})`);
  const out = swNets[1 - inPin];
  assert.ok(out !== PLUS && out !== GND, `${where}: ${sw.label}'s other pin is on neither rail`);
  const moNets = mo.holes.map(net);
  assert.ok(moNets.includes(GND), `${where}: one pin of ${mo.label} goes to ground (tn)`);
  assert.ok(!moNets.includes(PLUS), `${where}: ${mo.label} is not straight across the rails (the switch would do nothing)`);

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

  // The recipe expects the motor spinning.
  assert.ok(ex.expect[mo.label] && ex.expect[mo.label].spinning === true, `${where}: expect ${mo.label} spinning: ${JSON.stringify(ex.expect)}`);

  // As AI actions: the last one closes the switch; findCircuitProblems finds
  // nothing; finishAIReply keeps them all; applied, the motor spins.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(actions[actions.length - 1], { tool: 'set_control', part: sw.label, closed: true },
    `${where}: the build ends by closing the switch`);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const ps = r.parts[sw.label], pm = r.parts[mo.label];
  assert.ok(ps && pm, `${where}: analyze().parts has ${sw.label} and ${mo.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(ps.m.closed, true, `${where}: ${sw.label} is closed: ${JSON.stringify(ps.m)}`);
  assert.equal(pm.m.spinning, true, `${where}: ${mo.label} spins: ${JSON.stringify(pm.m)}`);
  assert.ok(pm.m.current >= 100 && pm.m.current <= 500, `${where}: ${mo.label} draws 100–500 mA (fast, under the 0.5 A limit); got ${pm.m.current}`);
  assert.ok(Math.abs(ps.m.current - pm.m.current) <= 0.01, `${where}: the switch and the motor carry the same current (series): ${ps.m.current} vs ${pm.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
  for (const res of others) {
    const q = r.parts[res.label];
    const watts = (q.m.current / 1000) ** 2 * ((res.values && res.values.resistance) || 470);
    assert.ok(watts <= 0.25, `${where}: ${res.label} dissipates ${watts.toFixed(3)} W; a kit resistor is 0.25 W`);
  }

  // Without the last step the switch stays open and the motor stays still:
  // the set_control is what makes the build work.
  const open = solveActions(actions.slice(0, -1));
  assert.equal(open.parts[mo.label].m.spinning, false, `${where}: without set_control the motor stays still`);
  assert.ok(Math.abs(open.parts[mo.label].m.current) < 1e-6, `${where}: without set_control no current: ${open.parts[mo.label].m.current}`);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Fails today only because the part isn't registered (its label needs the
// prefix); proven on the simulator with a stand-in of the issue's shape.
test('the proven motor recipe (provenMotor) meets every recipe rule: the battery at 3 V, closed, the motor spins at 299.97 mA with no warnings; open, nothing', () => {
  const actions = checkRecipe(provenMotor());
  const r = solveActions(actions);
  const mo = r.parts[motor().prefix + '1'].m;
  assert.ok(Math.abs(mo.current - MOTOR_MA) <= 0.02, `motor expected ${MOTOR_MA.toFixed(2)} mA, got ${mo.current}`);
  assert.equal(mo.speed, 1, JSON.stringify(mo));
});

test("motor's ai.recipe builds a switched motor that spins: every recipe rule, no warnings, no problems", () => {
  const { ai } = motor();
  assert.ok(ai.recipe, 'motor has no ai.recipe: add the worked build (provenMotor in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('motor\'s ai.guide says it has no polarity (reversing it reverses the spin), to keep it under 0.5 A, and names the recipe\'s tools; ≤ 300 chars, no "recipe"', () => {
  const def = motor();
  const g = def.ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `motor has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /polarity|either way|either direction/i, 'ai.guide says the motor has no polarity');
  assert.match(g, /revers/i, 'ai.guide says reversing it reverses the spin');
  assert.match(g, /0\.5 ?A|500 ?mA/, 'ai.guide says to keep the current under 0.5 A');
  const recipe = def.ai.recipe || provenMotor();
  const need = [...new Set(recipe.parts.map(p => p.type).filter(t => t !== 'battery' && t !== 'motor'))]
    .map(t => (Parts.get(t).ai.tool || 'place_' + t));
  assert.ok(need.includes('place_toggle_switch'), JSON.stringify(need));
  for (const tool of need) assert.ok(g.includes(tool), `ai.guide names ${tool}, so a request that sends place_motor also sends it`);
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
  const def = motor();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_motor'), `the QA request sends place_motor: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_motor|\bmotor\b/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the motor '
    + `(a heading line with RECIPE and place_motor or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request sends place_motor, place_toggle_switch and set_control, and its prompt has a motor recipe block whose steps are the recipe\'s actions, ending with the set_control that closes the switch', () => {
  const steps = qaSteps();
  const tools = toolNames(sent[QA_PROMPT]);
  for (const n of ['place_toggle_switch', 'set_control', 'place_battery']) assert.ok(tools.includes(n), `${n} missing from ${JSON.stringify(tools)}`);
  const want = recipeActions(motor().ai.recipe || provenMotor());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire' && a.tool !== 'set_control');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  const sets   = xs => xs.filter(a => a.tool === 'set_control');
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order (the battery with its voltage)');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.deepStrictEqual(sets(steps), [{ tool: 'set_control', part: Parts.get('toggle_switch').prefix + '1', closed: true }],
    `one set_control step closes the switch: the prompt's steps are ${JSON.stringify(steps.map(s => s.tool))}`);
  assert.deepStrictEqual(steps[steps.length - 1], sets(want)[0], 'the set_control is the last step, after the wires');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the motor recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, spin the motor with no warnings', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const mo = r.parts[Ids.nextLabel([], 'motor')];
  assert.ok(mo, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.equal(mo.m.spinning, true, JSON.stringify(mo.m));
  assert.ok(mo.m.current >= 100 && mo.m.current <= 500, `the motor draws 100–500 mA: ${mo.m.current}`);
  assert.deepStrictEqual(warnedOf(r), []);
});

test('the QA request\'s system prompt carries the motor guide line', () => {
  const g = motor().ai.guide;
  assert.ok(g, 'motor has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_motor: ${g}`), 'the prompt has "- place_motor: <guide>"');
});

// Guard: the recipe and guide go in only when place_motor is sent, so the
// demo and bench prompts get no recipe block or guide line for it.
// (Fails today only because the part isn't registered.)
test('the demo and bench requests do not send place_motor, and their prompts carry no motor recipe block or guide line', () => {
  const def = motor();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_motor'), `"${p}" sends place_motor`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a motor recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /motor/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and motor`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the motor guide`);
  }
});
