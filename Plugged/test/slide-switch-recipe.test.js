// The slide switch's worked build, ai.recipe, and its guide (#39). The
// lesson of #43, #33 and #32: from pin names alone the real AI mis-wires a
// new part, so each new part gets a proven build the server writes into the
// prompt as numbered steps, only when its tool is sent, and a guide in plain
// words. The slide switch's traps: + goes into the MIDDLE leg (common), not
// an end; and as placed (toB false) it joins common to pin a, so the LED on
// a lights and the LED on b stays dark until set_control toB: true.
//
// Shapes these tests assume (stated so the builder matches them):
// - slide_switch's ai.recipe is an Example (parts, wires, expect) for "Use a
//   slide switch to choose between a red and a green LED": the battery to
//   the rails; + → common; a → 470 Ω → red LED → ground; b → 470 Ω → green
//   LED → ground. The switch is left as placed (no controls, toB false), so
//   red lights and green is dark. Its rules are checkRecipe() below;
//   provenSlide() meets them all (the builder copies it in, with the
//   switch's label = its prefix + 1). The server writes it as numbered steps
//   (backend/server.js recipeSteps; the switch as "place_slide_switch:
//   hole=c8, direction=right"); test/fixtures/recipe-steps.js reads them.
// - slide_switch's ai.guide: at most 300 characters, never the word "recipe"
//   (the prompt line "- place_slide_switch: <guide>" would read as a recipe
//   heading). It says the middle leg is common, that as placed (by default)
//   common joins pin a, and that set_control toB: true moves it to pin b.
// - The prompt is checked on the real path, as in
//   test/toggle-switch-recipe.test.js: AI_PROVIDER=deepseek, the real
//   server, POST /api/ask on an empty board, a fake global fetch that keeps
//   the first body, messages[0].content.
// - The demo and bench requests don't send place_slide_switch, so no recipe
//   block or guide line for it goes into their prompts. (Registering the part
//   does change their goldens in the generated every-part lines, the labels
//   and set_control's params; the orchestrator regenerates those.)
//
// Hand-computed (ideal 9 V battery; a closed SW is 1 mΩ; a red LED is 2.0 V,
// a green LED 2.2 V, each in series with 0.1 Ω when on):
//   on a: I(red)   = (9 − 2.0) / (470 + 0.1 + 0.001) = 7 / 470.101   = 14.8904 mA
//   on b: I(green) = (9 − 2.2) / (470 + 0.1 + 0.001) = 6.8 / 470.101 = 14.4650 mA

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
const QA_PROMPT    = 'Use a slide switch to choose between a red and a green LED';
const DEMO_PROMPT  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH_PROMPT = 'Power an LED from the bench supply at 5 V with a series resistor.';
const RED_MA   = (9 - 2.0) / (470 + 0.1 + 0.001) * 1000;   // 14.8904 mA
const GREEN_MA = (9 - 2.2) / (470 + 0.1 + 0.001) * 1000;   // 14.4650 mA

function slide() {
  const def = Parts.get('slide_switch');
  assert.ok(def, "Parts.get('slide_switch') is null: parts/slide_switch.js must exist and be listed in parts/index.js");
  return def;
}

// The recipe proven here (on the real simulator, with a stand-in switch of
// the issue's shape: SW(common, a, !toB), SW(common, b, toB), footprint
// [[0,0],[1,0],[2,0]]): every rule in checkRecipe holds, findCircuitProblems
// finds nothing, finishAIReply keeps every action, and applied through
// chat.js the red LED lights at 14.890 mA with the green one dark; after
// set_control toB: true the green LED lights at 14.465 mA with the red one
// dark. Layout (top half):
//   the switch at c8 facing right: a c8, common c9, b c10;  tp_9 → a9;
//   a:  R1 b4–b8 470 Ω;   LED1 red,   anode d4,  cathode d2;   a2 → tn_2;
//   b:  R2 b10–b14 470 Ω; LED2 green, anode d14, cathode d16;  a16 → tn_16.
// The switch's label is its prefix + 1 (the first switch placed).
function provenSlide() {
  const sw = slide().prefix + '1';
  return {
    name:  '+ into the middle leg (common); a through 470 Ω to a red LED, b through 470 Ω to a green LED; as placed, red lights',
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'slide_switch', label: sw, holes: ['c8', 'c9', 'c10'] },                // a c8, common c9, b c10
            { type: 'resistor', label: 'R1', holes: ['b4', 'b8'], values: { resistance: 470 } },
            { type: 'led', label: 'LED1', holes: ['d2', 'd4'], values: { color: 'red' } },     // cathode d2, anode d4
            { type: 'resistor', label: 'R2', holes: ['b10', 'b14'], values: { resistance: 470 } },
            { type: 'led', label: 'LED2', holes: ['d16', 'd14'], values: { color: 'green' } }], // cathode d16, anode d14
    wires: [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`], ['tp_9', 'a9'], ['a2', 'tn_2'], ['a16', 'tn_16']],
    expect: { [sw]: { side: 'a' },
              LED1: { on: true, current: [14.8, 15.0] },
              LED2: { on: false, current: 0 } },
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

// ── The rules a slide-switch recipe must meet ─────────────────────────────

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

  // One slide switch, left as placed, labelled as it will be placed; two
  // 470 Ω resistors; one red LED and one green LED.
  const of = type => ex.parts.filter(p => p.type === type);
  const sws = of('slide_switch');
  assert.equal(sws.length, 1, `${where}: one slide_switch; got ${sws.map(p => p.label).join(', ') || 'none'}`);
  const sw = sws[0];
  assert.ok(!sw.controls || !sw.controls.toB, `${where}: ${sw.label} is left as placed (toB false), so red lights: ${JSON.stringify(sw.controls)}`);
  const before = ex.parts.slice(0, ex.parts.indexOf(sw));
  assert.equal(sw.label, Ids.nextLabel(before, 'slide_switch'),
    `${where}: the switch's label is the one it gets when placed, so set_control finds it`);
  const res = of('resistor');
  assert.equal(res.length, 2, `${where}: two resistors; got ${res.map(p => p.label).join(', ')}`);
  for (const r of res) assert.equal((r.values && r.values.resistance) || 470, 470, `${where}: ${r.label} is 470 Ω`);
  const leds = of('led');
  const colour = p => (p.values && p.values.color) || 'red';
  const red = leds.find(p => colour(p) === 'red'), green = leds.find(p => colour(p) === 'green');
  assert.ok(leds.length === 2 && red && green, `${where}: one red LED and one green LED; got ${JSON.stringify(leds)}`);

  // The switch: three legs in one row, side by side, a / common / b, as a
  // footprint direction puts them (each leg its own column in one half).
  assert.equal(sw.holes.length, 3, `${where}: ${sw.label} has 3 legs`);
  assert.ok(sw.holes.every(isBody) && new Set(sw.holes.map(rowOf)).size === 1,
    `${where}: ${sw.label} ${sw.holes.join(' ')} sits along one row (a vertical switch puts two legs on one node)`);
  const cols = sw.holes.map(colOf);
  assert.ok(Math.abs(cols[1] - cols[0]) === 1 && Math.abs(cols[2] - cols[1]) === 1 && cols[0] !== cols[2],
    `${where}: ${sw.label}'s legs are in 3 neighbouring columns, common in the middle: ${sw.holes.join(' ')}`);
  const [holeA, holeCommon, holeB] = sw.holes;

  // + → common; a → a 470 Ω → the red LED's anode; b → the other 470 Ω → the
  // green LED's anode; each LED's cathode → ground.
  const net = netsOf(ex);
  const PLUS = net('tp_1'), GND = net('tn_1');
  assert.equal(net(holeCommon), PLUS, `${where}: + (tp) goes into common, the middle leg ${holeCommon}`);
  for (const [side, hole] of [['a', holeA], ['b', holeB]]) {
    assert.ok(net(hole) !== PLUS && net(hole) !== GND, `${where}: pin ${side} (${hole}) is on neither rail`);
  }
  assert.notEqual(net(holeA), net(holeB), `${where}: pins a and b are on different nets`);
  const branch = (side, hole, led) => {
    const r = res.find(q => q.holes.map(net).includes(net(hole)));
    assert.ok(r, `${where}: pin ${side} (${hole}) goes into a resistor`);
    const other = r.holes.map(net).find(n => n !== net(hole));
    const [cath, anode] = led.holes;
    assert.equal(net(anode), other, `${where}: ${r.label}'s other end goes to ${led.label}'s anode ${anode}`);
    assert.equal(net(cath), GND, `${where}: ${led.label}'s cathode ${cath} goes to ground (tn)`);
    return r;
  };
  const ra = branch('a', holeA, red), rb = branch('b', holeB, green);
  assert.notEqual(ra, rb, `${where}: each side has its own resistor`);

  // No hole, body or rail, holds two leads or wire ends.
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(h => HOLE.test(h))];
  const twice = used.filter((h, i) => used.indexOf(h) !== i);
  assert.deepStrictEqual(twice, [], `${where}: a hole holds one lead; used twice: ${twice.join(', ')}`);

  // Span parts on one row don't overlap, and no wire lies under a part.
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

  // As AI actions: no set_control (it is left as placed); findCircuitProblems
  // finds nothing; finishAIReply keeps them all; applied, red lights, green
  // is dark, the switch reads side a, and nothing warns.
  const actions = recipeActions(ex);
  assert.ok(!actions.some(a => a.tool === 'set_control'), `${where}: the build leaves the switch as placed`);
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], `${where}: findCircuitProblems`);
  const kept = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(kept.actions, actions, `${where}: finishAIReply keeps every action`);

  const r = solveActions(actions);
  const ps = r.parts[sw.label], pr = r.parts[red.label], pg = r.parts[green.label];
  assert.ok(ps && pr && pg, `${where}: analyze().parts has ${sw.label}, ${red.label}, ${green.label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(ps.m.side, 'a', `${where}: ${sw.label} is on a: ${JSON.stringify(ps.m)}`);
  assert.equal(pr.m.on, true, `${where}: the red ${red.label} is on: ${JSON.stringify(pr.m)}`);
  assert.ok(Math.abs(pr.m.current - RED_MA) <= 0.02, `${where}: red ${red.label} expected ${RED_MA.toFixed(3)} mA, got ${pr.m.current}`);
  assert.equal(pg.m.on, false, `${where}: the green ${green.label} is dark: ${JSON.stringify(pg.m)}`);
  assert.ok(Math.abs(pg.m.current) < 1e-6, `${where}: green ${green.label} carries nothing, got ${pg.m.current}`);
  assert.deepStrictEqual(warnedOf(r), [], `${where}: no warnings`);

  // Flipped with set_control toB: true, the reverse.
  const flipped = solveActions(actions.concat([{ tool: 'set_control', part: sw.label, toB: true }]));
  assert.equal(flipped.parts[sw.label].m.side, 'b', `${where}: flipped, ${sw.label} is on b`);
  assert.equal(flipped.parts[green.label].m.on, true, `${where}: flipped, the green LED lights`);
  assert.ok(Math.abs(flipped.parts[green.label].m.current - GREEN_MA) <= 0.02,
    `${where}: flipped, green expected ${GREEN_MA.toFixed(3)} mA, got ${flipped.parts[green.label].m.current}`);
  assert.equal(flipped.parts[red.label].m.on, false, `${where}: flipped, the red LED is dark`);
  assert.deepStrictEqual(warnedOf(flipped), [], `${where}: flipped, no warnings`);
  return actions;
}

// ── The recipe itself ─────────────────────────────────────────────────────

// Fails today only because the part isn't registered (its label needs the
// prefix, its steps its footprint); proven on the simulator with a stand-in
// of the issue's shape.
test('the proven slide-switch recipe (provenSlide) meets every recipe rule: as placed red lights at 14.89 mA; flipped, green at 14.47 mA', () => {
  checkRecipe(provenSlide());
});

test("slide_switch's ai.recipe: + into common, a → 470 Ω → red, b → 470 Ω → green; every recipe rule, no warnings, no problems", () => {
  const { ai } = slide();
  assert.ok(ai.recipe, 'slide_switch has no ai.recipe: add the worked build (provenSlide in this file)');
  checkRecipe(ai.recipe);
});

test('the recipe as steps places the switch with hole + direction (a footprint), on the holes the recipe names', () => {
  const ex = slide().ai.recipe || provenSlide();
  const place = recipeActions(ex).find(a => a.tool === 'place_slide_switch');
  assert.ok(place, 'a place_slide_switch step');
  assert.ok(typeof place.hole === 'string' && ['right', 'left'].includes(place.direction),
    `hole + a horizontal direction: ${JSON.stringify(place)}`);
  const sw = ex.parts.find(p => p.type === 'slide_switch');
  const legs = Parts.footprintLegs('slide_switch', place.hole, Chat.ROTATION[place.direction]);
  assert.deepStrictEqual(legs.map(l => l.hole), sw.holes);
});

// ── The guide ─────────────────────────────────────────────────────────────

const SIDE = s => new RegExp(`(?:pin|side|throw|leg)\\s+['"\`]?${s}\\b|['"\`]${s}['"\`]`, 'i');

test('slide_switch\'s ai.guide says the middle leg is common, pin a is joined as placed, and set_control toB: true moves it to b; ≤ 300 chars, no "recipe"', () => {
  const g = slide().ai.guide;
  assert.ok(typeof g === 'string' && g.length > 0, `slide_switch has no ai.guide: ${JSON.stringify(g)}`);
  assert.ok(g.length <= 300, `ai.guide is ${g.length} characters; at most 300`);
  assert.doesNotMatch(g, /recipe/i, 'ai.guide must not say "recipe": its prompt line would parse as a recipe heading');
  assert.match(g, /\bmiddle\b/i, 'ai.guide says which leg is common: the middle one');
  assert.match(g, /\bcommon\b/i, 'ai.guide names common');
  assert.match(g, SIDE('a'), 'ai.guide names pin a (e.g. "pin a")');
  assert.match(g, SIDE('b'), 'ai.guide names pin b (e.g. "pin b")');
  assert.match(g, /\b(default|as placed|starts?)\b/i, 'ai.guide says which side it starts on');
  assert.match(g, /\bset_control\b/, 'ai.guide names set_control');
  assert.match(g, /toB\s*[:=]\s*true/, 'ai.guide gives toB: true to flip it');
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

test('the QA request sends place_slide_switch, place_led, place_resistor and set_control', () => {
  const got = toolNames(sent[QA_PROMPT]);
  for (const n of ['place_slide_switch', 'place_led', 'place_resistor', 'set_control']) {
    assert.ok(got.includes(n), `${n} missing from the QA request's tools: ${JSON.stringify(got)}`);
  }
});

// The recipe steps in the prompt sent for the QA request.
function qaSteps() {
  const def = slide();
  const body = sent[QA_PROMPT];
  assert.ok(toolNames(body).includes('place_slide_switch'), `the QA request sends place_slide_switch: ${JSON.stringify(toolNames(body))}`);
  const prompt = systemOf(body);
  const block = parseRecipeSteps(prompt, def);
  const near = prompt.split('\n').filter(l => /place_slide_switch|slide switch/i.test(l));
  assert.ok(block, 'the system prompt for "' + QA_PROMPT + '" has no recipe block for the slide switch '
    + `(a heading line with RECIPE and place_slide_switch or "${def.name}", then numbered steps). `
    + `Lines that mention it: ${JSON.stringify(near)}`);
  assert.ok(block.steps.length > 0, `the recipe block "${block.heading}" has no numbered steps`);
  return block.steps;
}

test('the QA request\'s system prompt has a slide-switch recipe block whose numbered steps are the recipe\'s actions, with no set_control', () => {
  const steps = qaSteps();
  const want = recipeActions(slide().ai.recipe || provenSlide());
  assert.equal(steps[0] && steps[0].tool, 'delete_all', `step 1 is delete_all: ${JSON.stringify(steps[0])}`);
  // Parts are placed in the recipe's order (labels follow it); wires may come
  // in any order.
  const places = xs => xs.filter(a => a.tool !== 'add_wire' && a.tool !== 'set_control');
  const wires  = xs => xs.filter(a => a.tool === 'add_wire').map(a => `${a.from} -> ${a.to}`).sort();
  assert.deepStrictEqual(places(steps), places(want), 'the delete_all and place_* steps, in order');
  assert.deepStrictEqual(wires(steps), wires(want), 'the add_wire steps');
  assert.deepStrictEqual(steps.filter(a => a.tool === 'set_control'), [], 'no set_control: the switch is left on a');
  assert.equal(steps.length, want.length, `${steps.length} steps; the recipe has ${want.length} actions`);
});

test('the slide-switch recipe steps parsed from the prompt pass findCircuitProblems with [] and, applied through chat.js, light red and leave green dark', () => {
  const steps = qaSteps();
  assert.deepStrictEqual(Server.findCircuitProblems(steps.map(a => ({ ...a }))), []);
  const r = solveActions(steps);
  const ex = slide().ai.recipe || provenSlide();
  const colour = p => (p.values && p.values.color) || 'red';
  const red = ex.parts.find(p => p.type === 'led' && colour(p) === 'red').label;
  const green = ex.parts.find(p => p.type === 'led' && colour(p) === 'green').label;
  const ps = r.parts[Ids.nextLabel([], 'slide_switch')];
  assert.ok(ps && r.parts[red] && r.parts[green], `analyze().parts: ${JSON.stringify(Object.keys(r.parts || {}))}`);
  assert.equal(ps.m.side, 'a', JSON.stringify(ps.m));
  assert.equal(r.parts[red].m.on, true, JSON.stringify(r.parts[red].m));
  assert.ok(Math.abs(r.parts[red].m.current - RED_MA) <= 0.02, `red expected ${RED_MA.toFixed(3)} mA, got ${r.parts[red].m.current}`);
  assert.equal(r.parts[green].m.on, false, JSON.stringify(r.parts[green].m));
});

test('the QA request\'s system prompt carries the slide-switch guide line', () => {
  const g = slide().ai.guide;
  assert.ok(g, 'slide_switch has no ai.guide');
  assert.ok(systemOf(sent[QA_PROMPT]).includes(`- place_slide_switch: ${g}`), 'the prompt has "- place_slide_switch: <guide>"');
});

// Guard: the recipe and guide go in only when place_slide_switch is sent,
// so the demo and bench prompts get no recipe block or guide line for it.
// (Fails today only because the part isn't registered.)
test('the demo and bench requests do not send place_slide_switch, and their prompts carry no slide-switch recipe block or guide line', () => {
  const def = slide();
  for (const p of [DEMO_PROMPT, BENCH_PROMPT]) {
    assert.ok(!toolNames(sent[p]).includes('place_slide_switch'), `"${p}" sends place_slide_switch`);
    const prompt = systemOf(sent[p]);
    assert.equal(parseRecipeSteps(prompt, def), null, `"${p}": the prompt has a slide-switch recipe block`);
    const recipeish = prompt.split('\n').filter(l => /recipe/i.test(l) && /slide/i.test(l));
    assert.deepStrictEqual(recipeish, [], `"${p}": lines that say recipe and slide`);
    if (def.ai.guide) assert.ok(!prompt.includes(def.ai.guide), `"${p}": the prompt carries the slide-switch guide`);
  }
});
