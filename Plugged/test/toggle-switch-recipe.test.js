// The toggle switch's worked build, ai.recipe, and its guide (#32). The
// lesson of #43 and #33: from pin names alone the real AI mis-wires a new
// part, so each new part gets a proven build the server writes into the
// prompt as numbered steps, only when its tool is sent, and a guide in plain
// words. The switch has one more trap: it starts OPEN, so a build that only
// places and wires it leaves the LED dark. Its recipe ends by closing it.
//
// Shapes these tests assume (stated so the builder matches them):
// - toggle_switch's ai.recipe is an Example (parts, wires, expect): 9 V →
//   the switch → 470 Ω → red LED → ground, with the switch's part entry
//   carrying controls: { closed: true } (docs/API-CONTRACT.md → "Example":
//   "A part in `parts` may also set `controls`"). Its rules are
//   checkRecipe() below; PROVEN_TOGGLE meets them all (the builder copies it
//   in, with the switch's label = its prefix + 1).
// - The recipe block the server writes (backend/server.js recipeSteps) gets
//   one more kind of step: after the wires, each part with `controls` is
//   "set_control: part=<label>, <key>=<value>", e.g.
//       10. set_control: part=S1, closed=true
//   test/fixtures/recipe-steps.js has the Example → actions rule and parses
//   true / false as booleans. (Today's recipeSteps ignores `controls`.)
// - toggle_switch's ai.guide: at most 300 characters, never the word
//   "recipe" (the prompt line "- place_toggle_switch: <guide>" would read as
//   a recipe heading). It says the switch starts open (off), to close it with
//   set_control (closed: true) so the LED lights, and that the student can
//   click it to flip it.
// - The prompt is checked on the real path, as in
//   test/seven-segment-recipe.test.js: AI_PROVIDER=deepseek, the real
//   server, POST /api/ask on an empty board, a fake global fetch that keeps
//   the first body, messages[0].content.
// - The demo and bench requests don't send place_toggle_switch, so no recipe
//   block or guide line for it goes into their prompts. (Registering the part
//   does change their goldens in the generated every-part lines, the labels
//   and set_control's params; the orchestrator regenerates those.)
//
// Hand-computed (ideal 9 V battery; the closed switch is 1 mΩ; a red LED is
// 2.0 V in series with 0.1 Ω when on):
//   I = (9 − 2.0) / (470 + 0.1 + 0.001) = 7 / 470.101 = 14.8904 mA

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
const QA_PROMPT    = 'Add an on/off switch to an LED circuit';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const LED_MA = (9 - 2.0) / (470 + 0.1 + 0.001) * 1000;   // 14.8904 mA

function toggle() {
  const def = Parts.get('toggle_switch');
  assert.ok(def, "Parts.get('toggle_switch') is null: parts/toggle_switch.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here (on the real simulator, with a stand-in switch of
// the issue's shape: SW(1, 2, closed), span 2): every rule in checkRecipe
// holds, findCircuitProblems finds nothing, finishAIReply keeps every
// action, and applied through chat.js the LED lights at 14.890 mA; without
// the set_control step the circuit is open. Layout (top half, C = 2):
//   tp_2 → a2;  switch b2 (pin 1) – b4 (pin 2);  R1 c4–c8 470 Ω;
//   LED1 anode d8, cathode d10;  a10 → tn_10;  then close the switch.
// The switch's label is its prefix + 1 (the first switch placed).
function provenToggle() {
  const sw = toggle().prefix + '1';
  return {
    name:  '+ into the switch, the switch through 470 Ω to a red LED, LED to ground; closed, the LED lights',
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'toggle_switch', label: sw, holes: ['b2', 'b4'], controls: { closed: true } },
            { type: 'resistor', label: 'R1', holes: ['c4', 'c8'], values: { resistance: 470 } },
            { type: 'led', label: 'LED1', holes: ['d10', 'd8'], values: { color: 'red' } }],   // cathode d10, anode d8
    wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_2', 'a2'], ['a10', 'tn_10']],
    expect: { [sw]: { closed: true, current: [14.8, 15.0] },
              LED1: { on: true, current: [14.8, 15.0] } },
  };
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

// ── The rules a switch recipe must meet ───────────────────────────────────

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

  // One switch, closed, labelled as it will be placed; one 470 Ω resistor; one red LED.
  const one = type => {
    const ps = ex.parts.filter(p => p.type === type);
    assert.equal(ps.length, 1, `${where}: one ${type}; got ${ps.map(p => p.label).join(', ') || 'none'}`);
    return ps[0];
  };
  const sw = one('toggle_switch'), res = one('resistor'), led = one('led');
  assert.deepStrictEqual(sw.controls, { closed: true }, `${where}: ${sw.label} sets controls { closed: true }, so the build closes it`);
  const before = ex.parts.slice(0, ex.parts.indexOf(sw));
  assert.equal(sw.label, Ids.nextLabel(before, 'toggle_switch'),
    `${where}: the switch's label is the one it gets when placed, so set_control finds it`);
  const [x, y] = sw.holes;
  assert.ok(isBody(x) && isBody(y) && rowOf(x) === rowOf(y) && Math.abs(colOf(x) - colOf(y)) === 2,
    `${where}: ${sw.label} ${x}–${y} on one row, 2 columns apart`);
  assert.equal((res.values && res.values.resistance) || 470, 470, `${where}: ${res.label} is 470 Ω`);
  assert.ok(!(led.values && led.values.color) || led.values.color === 'red', `${where}: ${led.label} is red (vf 2.0 V)`);

  // The series path: + → the switch → 470 Ω → LED anode; LED cathode → ground.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), GND = net('tn_1');
  const swNets = sw.holes.map(net);
  const inPin = swNets.indexOf(PLUS);
  assert.ok(inPin >= 0, `${where}: + (tp) goes into one pin of ${sw.label} (${sw.holes.join(', ')})`);
  const out = swNets[1 - inPin];
  assert.notEqual(out, PLUS, `${where}: ${sw.label}'s other pin is not on + too (it would switch nothing)`);
  const [lCath, lAnode] = led.holes;
  const rNets = res.holes.map(net);
  assert.ok(rNets.includes(out), `${where}: ${sw.label}'s other pin goes into ${res.label} (${res.holes.join('–')})`);
  assert.ok(rNets.includes(net(lAnode)) && net(lAnode) !== out, `${where}: ${res.label}'s other end goes to ${led.label}'s anode ${lAnode}`);
  assert.equal(net(lCath), GND, `${where}: ${led.label}'s cathode ${lCath} goes to ground (tn)`);

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

  // As AI actions: the last one closes the switch; findCircuitProblems finds
  // nothing; finishAIReply keeps them all; applied, the LED lights.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(actions[actions.length - 1], { tool: 'set_control', part: sw.label, closed: true },
    `${where}: the build ends by closing the switch`);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const ps = r.parts[sw.label], pl = r.parts[led.label];
  assert.ok(ps && pl, `${where}: analyze().parts has ${sw.label} and ${led.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(ps.m.closed, true, `${where}: ${sw.label} is closed: ${JSON.stringify(ps.m)}`);
  assert.ok(Math.abs(ps.m.current - LED_MA) <= 0.02, `${where}: ${sw.label} carries ${LED_MA.toFixed(3)} mA, got ${ps.m.current}`);
  assert.equal(pl.m.on, true, `${where}: ${led.label} is on: ${JSON.stringify(pl.m)}`);
  assert.ok(Math.abs(pl.m.current - LED_MA) <= 0.02, `${where}: ${led.label} expected ${LED_MA.toFixed(3)} mA, got ${pl.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);

  // Without the last step the switch stays open and nothing lights: the
  // set_control is what makes the build work.
  const open = solveActions(actions.slice(0, -1));
  assert.equal(open.parts[led.label].m.on, false, `${where}: without set_control the LED stays dark`);
  assert.match(text(open), /Circuit open/, `${where}: without set_control the circuit is open: ${text(open)}`);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Fails today only because the part isn't registered (its label needs the
// prefix); proven on the simulator with a stand-in of the issue's shape.
test('the proven switch recipe (provenToggle) meets every recipe rule: closed, the LED lights at 14.89 mA; open, nothing', () => {
  checkRecipe(provenToggle());
});

test("toggle_switch's ai.recipe closes the switch and lights the LED at 14.89 mA: every recipe rule, no warnings, no problems", () => {
  const { ai } = toggle();
  assert.ok(ai.recipe, 'toggle_switch has no ai.recipe: add the worked build (provenToggle in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test('toggle_switch\'s ai.guide says it starts open, to close it with set_control (closed: true) so the LED lights, and that a click flips it; ≤ 300 chars, no "recipe"', () => {
  const g = toggle().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `toggle_switch has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /\b(open|off)\b/i, 'ai.guide says the switch starts open (off)');
  assert.match(g, /\bset_control\b/, 'ai.guide names set_control');
  assert.match(g, /closed\s*[:=]\s*true/, 'ai.guide gives closed: true');
  assert.match(g, /\bLED\b|\blight/i, 'ai.guide says closing it lights the LED');
  assert.match(g, /\bclick/i, 'ai.guide says the student can click it to flip it');
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
  const def = toggle();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_toggle_switch'), `the QA request sends place_toggle_switch: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_toggle_switch|toggle switch/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the toggle switch '
    + `(a heading line with RECIPE and place_toggle_switch or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a switch recipe block whose numbered steps are the recipe\'s actions, ending "set_control: part=<label>, closed=true"', () => {
  const steps = qaSteps();
  const want = recipeActions(toggle().ai.recipe || provenToggle());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  // Parts are placed in the recipe's order (labels follow it); wires may
  // come in any order; the set_control comes after them.
  const places = xs => xs.filter(a => a.tool !== 'add_wire' && a.tool !== 'set_control');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  const sets   = xs => xs.filter(a => a.tool === 'set_control');
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.deepStrictEqual(sets(steps), [{ tool: 'set_control', part: toggle().prefix + '1', closed: true }],
    `one set_control step closes the switch: the prompt's steps are ${JSON.stringify(steps.map(s => s.tool))}`);
  assert.deepStrictEqual(steps[steps.length - 1], sets(want)[0], 'the set_control is the last step, after the wires');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the switch recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, light the LED at 14.89 mA', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const ps = r.parts[Ids.nextLabel([], 'toggle_switch')], pl = r.parts[Ids.nextLabel([], 'led')];
  assert.ok(ps && pl, `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.equal(ps.m.closed, true, `the steps close the switch: ${JSON.stringify(ps.m)}`);
  assert.equal(pl.m.on, true, JSON.stringify(pl.m));
  assert.ok(Math.abs(pl.m.current - LED_MA) <= 0.02, `LED expected ${LED_MA.toFixed(3)} mA, got ${pl.m.current}`);
});

test('the QA request\'s system prompt carries the switch guide line', () => {
  const g = toggle().ai.guide;
  assert.ok(g, 'toggle_switch has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_toggle_switch: ${g}`), 'the prompt has "- place_toggle_switch: <guide>"');
});

// Guard: the recipe and guide go in only when place_toggle_switch is sent,
// so the demo and bench prompts get no recipe block or guide line for it.
// (Fails today only because the part isn't registered.)
test('the demo and bench requests do not send place_toggle_switch, and their prompts carry no switch recipe block or guide line', () => {
  const def = toggle();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_toggle_switch'), `"${p}" sends place_toggle_switch`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a switch recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /toggle/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and toggle`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the switch guide`);
  }
});
