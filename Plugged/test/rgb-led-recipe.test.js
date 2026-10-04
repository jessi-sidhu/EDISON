// The RGB LED's worked build, ai.recipe, and its guide (#42). The lesson of
// #43, #33 and #35: from pin names alone the real AI mis-wires a new part,
// so each new part gets a proven build the server writes into the prompt as
// numbered steps, only when its tool is sent, and a guide in plain words.
// The RGB LED's traps: one resistor on the shared cathode instead of one per
// colour (then only red lights, test/parts-rgb_led.test.js), and the
// cathode (the second leg, not an end one) left unwired.
//
// Shapes these tests assume (stated so the builder matches them):
// - rgb_led's ai.recipe is an Example (parts, wires, expect) for "Make an
//   RGB LED glow purple". Its rules are checkRecipe() below; PROVEN_RGB
//   meets them all (the builder copies it in, with the RGB LED's label = its
//   prefix + 1): the RGB LED at c10 facing right (red c10, cathode c11,
//   green c12, blue c13), red through R1 470 Ω b6–b10 fed tp_6 → a6, blue
//   through R2 470 Ω b13–b17 fed tp_17 → a17, green unconnected, the
//   cathode a11 → tn_11. Its expect checks red and blue (and green 0).
// - rgb_led's ai.guide: at most 300 characters, never the word "recipe" (the
//   prompt line "- place_rgb_led: <guide>" would read as a recipe heading).
//   It says "Common cathode goes to ground." and "Each colour pin needs its
//   own resistor", names place_resistor (so the tool comes along), and
//   names each leg's hole for the recipe placement: hole c10, direction
//   right, then pin and hole ("red=c10", "red c10" or "red: c10") for all
//   four pins.
// - The prompt is checked on the real path, as in test/bulb-recipe.test.js:
//   AI_PROVIDER=deepseek, the real server, POST /api/ask on an empty board,
//   a fake global fetch that keeps the first body, messages[0].content.
// - The demo and bench requests don't send place_rgb_led, so no recipe
//   block or guide line for it goes into their prompts. (Registering the
//   part does change their goldens in the generated every-part lines and
//   labels; the orchestrator regenerates those.)
//
// Hand-computed (ideal battery, ron 0.1 Ω):
//   red  (9 − 2.0) / 470.1 = 14.890 mA
//   blue (9 − 3.2) / 470.1 = 12.338 mA
//   green 0; the battery gives 27.23 mA.

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
const QA_PROMPT    = 'Make an RGB LED glow purple';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';

const RED_MA  = (9 - 2.0) / 470.1 * 1000;   // 14.890
const BLUE_MA = (9 - 3.2) / 470.1 * 1000;   // 12.338

function rgb() {
  const def = Parts.get('rgb_led');
  assert.ok(def, "Parts.get('rgb_led') is null: parts/rgb_led.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here (on the real simulator, with a stand-in RGB LED of
// the issue's shape: pins red/cathode/green/blue on c10–c13, D(red, cathode,
// 2.0 V), D(green, cathode, 3.2 V), D(blue, cathode, 3.2 V), ron 0.1): every
// rule in checkRecipe holds, findCircuitProblems finds nothing, finishAIReply
// keeps every action, and applied through chat.js red reads 14.89 mA, blue
// 12.34 mA, green 0, the battery 27.23 mA, no warnings. Layout (top half):
//   BAT1 → tp_63 / tn_63;  RGB c10 (red) c11 (cathode) c12 (green) c13 (blue)
//   tp_6 → a6;  R1 470 Ω b6–b10 (into red);  tp_17 → a17;  R2 470 Ω b13–b17 (into blue)
//   a11 → tn_11 (cathode to ground);  column 12 (green) holds nothing else.
function provenRgb() {
  const lbl = rgb().prefix + '1';
  return {
    name:  'Purple: red and blue each through their own 470 Ω from 9 V, green unused, the common cathode to ground',
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'rgb_led', label: lbl, holes: ['c10', 'c11', 'c12', 'c13'] },
            { type: 'resistor', label: 'R1', holes: ['b6', 'b10'], values: { resistance: 470 } },     // red
            { type: 'resistor', label: 'R2', holes: ['b13', 'b17'], values: { resistance: 470 } }],   // blue
    wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_6', 'a6'], ['tp_17', 'a17'], ['a11', 'tn_11']],
    expect: { [lbl]: { red: [14.8, 15.0], green: [0, 0.01], blue: [12.25, 12.45] } },
  };
}

// ── A board that keeps real records, as in test/bulb-recipe.test.js ───────

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

// Purple: rr and bb bright (≥ 0x99), gg dark (≤ 0x40).
function purple(color, where) {
  assert.match(String(color), /^#[0-9a-f]{6}$/i, `${where}: color is '#rrggbb'; got ${JSON.stringify(color)}`);
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  assert.ok(r >= 0x99 && b >= 0x99 && g <= 0x40, `${where}: purple (rr and bb bright, gg dark); got ${color}`);
}

// Red 14.89, blue 12.34, green 0, purple, no warnings, battery 27.23 mA.
function glowsPurple(r, lbl, where) {
  const p = r.parts[lbl];
  assert.ok(p, `${where}: analyze().parts has ${lbl}; got ${JSON.stringify(Object.keys(r.parts))}`);
  const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 0.05, `${where}: ${what} ${want.toFixed(2)} mA, got ${got}`);
  near(p.m.red, RED_MA, 'red');
  near(p.m.blue, BLUE_MA, 'blue');
  near(p.m.green, 0, 'green');
  purple(p.m.color, where);
  assert.ok(Math.abs(r.parts.BAT1.m.current - (RED_MA + BLUE_MA)) <= 0.1, `${where}: battery ${(RED_MA + BLUE_MA).toFixed(2)} mA, got ${r.parts.BAT1.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);
}

// ── The rules an RGB LED recipe must meet ─────────────────────────────────

const HOLE   = /^([a-j]\d+|(tp|tn|bp|bn)_\d+)$/;
const isBody = h => /^[a-j]\d+$/.test(h);
const colOf  = h => Number(/\d+$/.exec(h)[0]);
const rowOf  = h => (isBody(h) ? h[0] : /^(tp|tn|bp|bn)/.exec(h)[1]);
const rowIdx = r => (r === 'tp' || r === 'tn' ? -1 : r === 'bp' || r === 'bn' ? ROWS.length : ROWS.indexOf(r));
const half   = h => (rowOf(h) <= 'e' ? 'top' : 'bot');

function wireCells([from, to]) {
  const ends = [from, to].filter(h => HOLE.test(h));
  if (ends.length < 2 || colOf(ends[0]) !== colOf(ends[1])) return ends.filter(isBody);
  const [lo, hi] = [rowIdx(rowOf(ends[0])), rowIdx(rowOf(ends[1]))].sort((x, y) => x - y);
  return ROWS.filter((_, i) => i >= lo && i <= hi).map(r => r + colOf(ends[0]));
}

function checkRecipe(ex) {
  const where = ex.name || 'the recipe';
  assert.ok(ex && Array.isArray(ex.parts) && Array.isArray(ex.wires) && ex.expect, `${where}: an Example (parts, wires, expect)`);

  // One 9 V battery, wired to the rails at the highest column.
  const bats = ex.parts.filter(p => p.type === 'battery');
  assert.deepStrictEqual(bats.map(p => p.label), ['BAT1'], `${where}: one battery, BAT1`);
  assert.ok(!bats[0].values || bats[0].values.voltage === undefined || bats[0].values.voltage === 9, `${where}: the default 9 V battery`);
  const wireKeys = ex.wires.map(w => w.join(' -> '));
  for (const w of [`BAT1.0 -> tp_${N}`, `BAT1.1 -> tn_${N}`]) {
    assert.ok(wireKeys.includes(w), `${where}: wire ${w} (battery to the rails at the highest column); wires ${JSON.stringify(wireKeys)}`);
  }

  // One RGB LED, labelled as it will be placed, its legs a real placement
  // (one row, each leg its own column); the example checks red and blue.
  const rgbs = ex.parts.filter(p => p.type === 'rgb_led');
  assert.equal(rgbs.length, 1, `${where}: one RGB LED; got ${rgbs.map(p => p.label).join(', ') || 'none'}`);
  const led = rgbs[0];
  const before = ex.parts.slice(0, ex.parts.indexOf(led));
  assert.equal(led.label, Ids.nextLabel(before, 'rgb_led'), `${where}: the RGB LED's label is the one it gets when placed`);
  assert.equal(led.holes.length, 4, `${where}: four holes, one per pin`);
  assert.equal(new Set(led.holes.map(colOf)).size, 4, `${where}: each leg in its own column: ${led.holes.join(' ')}`);
  const pinHole = Object.fromEntries(rgb().pins.map((p, i) => [p, led.holes[i]]));
  const want = ex.expect[led.label] || {};
  assert.ok(Array.isArray(want.red) && want.red[0] <= RED_MA && want.red[1] >= RED_MA, `${where}: expect.${led.label}.red holds ${RED_MA.toFixed(2)}: ${JSON.stringify(want)}`);
  assert.ok(Array.isArray(want.blue) && want.blue[0] <= BLUE_MA && want.blue[1] >= BLUE_MA, `${where}: expect.${led.label}.blue holds ${BLUE_MA.toFixed(2)}: ${JSON.stringify(want)}`);

  // Red and blue each get their own 470 Ω resistor, one leg in that pin's
  // column (same half); green's column holds nothing else; one resistor
  // is 3–5 columns on one row.
  const rs = ex.parts.filter(p => p.type === 'resistor');
  assert.equal(rs.length, 2, `${where}: two resistors, one for red and one for blue`);
  const sameNode = (h, pin) => colOf(h) === colOf(pinHole[pin]) && half(h) === half(pinHole[pin]);
  for (const pin of ['red', 'blue']) {
    const mine = rs.filter(p => p.holes.some(h => sameNode(h, pin)));
    assert.equal(mine.length, 1, `${where}: one resistor into the ${pin} pin's column (${pinHole[pin]})`);
    assert.equal((mine[0].values && mine[0].values.resistance) || 470, 470, `${where}: ${mine[0].label} is 470 Ω`);
  }
  for (const p of rs) {
    const [x, y] = p.holes;
    const d = Math.abs(colOf(x) - colOf(y));
    assert.ok(isBody(x) && isBody(y) && rowOf(x) === rowOf(y) && d >= 3 && d <= 5, `${where}: ${p.label} ${x}–${y} on one row, 3–5 columns apart`);
  }
  const everyEnd = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h) && isBody(h))];
  assert.deepStrictEqual(everyEnd.filter(h => h !== pinHole.green && sameNode(h, 'green')), [], `${where}: green (${pinHole.green}) is left unconnected`);
  assert.ok(ex.wires.some(w => w.some(h => isBody(h) && sameNode(h, 'cathode')) && w.some(h => /^tn_\d+$/.test(h))),
    `${where}: a wire from the cathode's column (${pinHole.cathode}) to tn`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Parts on one row don't overlap, and no wire lies under a part.
  const spans = ex.parts.filter(p => (p.holes || []).length >= 2 && p.holes.every(isBody) && new Set(p.holes.map(rowOf)).size === 1)
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
  // them all; applied, the RGB LED glows purple with no warnings.
  const actions = recipeActions(ex);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);
  glowsPurple(solveActions(actions), led.label, where);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Fails today only because the part isn't registered (its label needs the
// prefix); proven on the simulator with a stand-in of the issue's shape.
test('the proven RGB LED recipe (provenRgb: red and blue through 470 Ω each, cathode to ground) meets every recipe rule: red 14.89, blue 12.34, green 0 mA, purple', () => {
  checkRecipe(provenRgb());
});

test("rgb_led's ai.recipe glows purple (red 14.89, blue 12.34, green 0 mA): every recipe rule, no warnings, no problems", () => {
  const { ai } = rgb();
  assert.ok(ai.recipe, 'rgb_led has no ai.recipe: add the worked build (provenRgb in this file)');
  checkRecipe(ai.recipe);
});

// ── The guide ─────────────────────────────────────────────────────────────

test("rgb_led's ai.guide says the common cathode goes to ground and each colour pin needs its own resistor (place_resistor); ≤ 300 chars, no \"recipe\"", () => {
  const g = rgb().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `rgb_led has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /common cathode goes to ground/i, g);
  assert.match(g, /each colou?r pin needs its own resistor/i, g);
  assert.match(g, /\bplace_resistor\b/, 'names place_resistor, so the resistor tool is sent with it');
});

test('the guide names each leg\'s hole for the recipe placement: hole c10, direction right, red c10, cathode c11, green c12, blue c13', () => {
  const { ai } = rgb();
  assert.match(ai.guide, /\bc10\b/, ai.guide);
  assert.match(ai.guide, /\bright\b/, ai.guide);
  const legs = Parts.footprintLegs('rgb_led', 'c10', 0);
  const pairs = legs.map(l => [l.pin, l.row + (l.col + 1)]);
  assert.deepStrictEqual(pairs, [['red', 'c10'], ['cathode', 'c11'], ['green', 'c12'], ['blue', 'c13']]);
  const missing = pairs.filter(([pin, hole]) => !new RegExp(`(^|[^a-z0-9])${pin}\\s*[:=]?\\s*${hole}(?![0-9])`, 'i').test(ai.guide))
    .map(([pin, hole]) => `${pin} ${hole}`);
  assert.deepStrictEqual(missing, [], `the guide should name each pin's hole ("${missing.join('", "')}" missing): ${ai.guide}`);
  const r = ai.recipe && ai.recipe.parts.find(p => p.type === 'rgb_led');
  if (r) assert.deepStrictEqual(r.holes, ['c10', 'c11', 'c12', 'c13'], 'the guide and the recipe place it the same way');
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
  const def = rgb();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_rgb_led'), `the QA request sends place_rgb_led: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_rgb_led|\brgb\b/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the RGB LED '
    + `(a heading line with RECIPE and place_rgb_led or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request sends place_rgb_led and place_resistor', () => {
  rgb();
  const names = toolNames(sent[QA_PROMPT]);
  for (const n of ['place_rgb_led', 'place_resistor']) assert.ok(names.includes(n), `${n} missing from ${JSON.stringify(names)}`);
});

test('the QA request\'s system prompt has an RGB LED recipe block whose numbered steps are the recipe\'s actions, with "place_rgb_led: hole=c10, direction=right"', () => {
  const steps = qaSteps();
  const want = recipeActions(rgb().ai.recipe || provenRgb());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  const places = xs => xs.filter(a => a.tool !== 'add_wire');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.deepStrictEqual(steps.find(s => s.tool === 'place_rgb_led'), { tool: 'place_rgb_led', hole: 'c10', direction: 'right' });
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the RGB LED recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, glow purple with no warnings', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  glowsPurple(solveActions(steps), Ids.nextLabel([], 'rgb_led'), 'the prompt\'s steps');
});

test('the QA request\'s system prompt carries the RGB LED guide line', () => {
  const g = rgb().ai.guide;
  assert.ok(g, 'rgb_led has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_rgb_led: ${g}`), 'the prompt has "- place_rgb_led: <guide>"');
});

// Guard: the recipe and guide go in only when place_rgb_led is sent. The
// demo says "LED", so the RGB LED's keywords must not drag place_rgb_led (or
// its recipe) into the demo request. (Fails today only because the part
// isn't registered.)
test('the demo and bench requests do not send place_rgb_led, and their prompts carry no RGB LED recipe block or guide line', () => {
  const def = rgb();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_rgb_led'), `"${p}" sends place_rgb_led: ${JSON.stringify(toolNames(sent[p]))}`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has an RGB LED recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /\brgb\b/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and RGB`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the RGB LED guide`);
  }
});
