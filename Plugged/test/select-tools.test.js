// Tests for selectTools(message, boardTypes) in backend/server.js (issue #27,
// step D1). docs/API-CONTRACT.md → "AI tools".
//
// Shapes these tests assume (stated so the builder matches them):
// - server.js exports selectTools(message, boardTypes). It is pure: the same
//   message and board give the same list, and boardTypes is not changed.
// - It returns a list of tool declarations in Gemini's function_declarations
//   shape ({ name, description, parameters? }), the same objects
//   CIRCUIT_TOOLS holds. These tests read each tool's `name`.
// - Order: the 7 always-sent tools (delete_all, add_wire, place_battery,
//   use_parts, set_value, set_control, delete_part), then the tools for parts
//   on the board, then keyword matches, then the everyday set (resistor, LED,
//   button, buzzer) if nothing matched.
// - Keywords match whole words, case-insensitive, with a simple plural "s".
// - At most 12 part tools, plus the 7 always-sent tools, which don't count
//   toward the 12 (issue #76). Never a name twice.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');
const { withGizmos } = require('./fixtures/gizmos.js');

const ALWAYS   = ['delete_all', 'add_wire', 'place_battery', 'use_parts'];
const EVERYDAY = ['place_resistor', 'place_led', 'place_button', 'place_buzzer'];
// All 7 tools sent with every request (#27 D2 added the edit tools).
const ALWAYS_SENT = [...ALWAYS, 'set_value', 'set_control', 'delete_part'];
// The part tools in a selection: everything but the always-sent tools.
const partTools = got => got.filter(n => !ALWAYS_SENT.includes(n));

function select(S, message, boardTypes = []) {
  assert.equal(typeof S.selectTools, 'function', 'server.js must export selectTools(message, boardTypes)');
  const out = S.selectTools(message, boardTypes);
  assert.ok(Array.isArray(out), 'selectTools must return a list of tools');
  for (const t of out) assert.equal(typeof (t && t.name), 'string', 'every tool needs a name: ' + JSON.stringify(t));
  return out.map(t => t.name);
}
const names = (message, boardTypes) => select(Server, message, boardTypes);

// ── What each message gets ─────────────────────────────────────────────────

const CASES = [
  // [message, parts on the board, must include, must not include]
  ['build an LED circuit',        [],         ['place_led', 'place_resistor'], []],
  ['add a button',                [],         ['place_button'],                ['place_buzzer']],
  ['Build 3 LEDs',                [],         ['place_led'],                   []],
  ['why is it so quiet?',         ['buzzer'], ['place_buzzer'],                []],
  ['hello there',                 [],         EVERYDAY,                        []],
  ['ADD A BUZZER',                [],         ['place_buzzer'],                ['place_button']],
  ['three buttons please',        [],         ['place_button'],                ['place_buzzer']],
  // Whole words only: "ledger" is not "led".
  ['add a button to the ledger',  [],         ['place_button'],                ['place_led', 'place_buzzer']],
];

for (const [message, board, want, notWant] of CASES) {
  test(`selectTools("${message}", [${board.join(', ')}]) sends ${want.join(', ')}${notWant.length ? ` and not ${notWant.join(', ')}` : ''}`, () => {
    const got = names(message, board);
    assert.deepEqual(want.filter(n => !got.includes(n)), [], `missing from ${JSON.stringify(got)}`);
    assert.deepEqual(notWant.filter(n => got.includes(n)), [], `should not be in ${JSON.stringify(got)}`);
  });
}

test('the always-sent tools are in every selection, ahead of the part tools', () => {
  for (const [message, board] of CASES) {
    const got = names(message, board);
    assert.deepEqual(ALWAYS.filter(n => !got.includes(n)), [], `"${message}": missing always-sent tools from ${JSON.stringify(got)}`);
    const lastAlways = Math.max(...ALWAYS.map(n => got.indexOf(n)));
    const firstPart  = got.findIndex(n => /^place_/.test(n) && n !== 'place_battery');
    if (firstPart >= 0) assert.ok(lastAlways < firstPart, `"${message}": always-sent tools must come first: ${JSON.stringify(got)}`);
  }
});

test('a part on the board comes before a keyword match', () => {
  const got = names('add a button', ['buzzer']);
  assert.ok(got.includes('place_buzzer') && got.includes('place_button'), JSON.stringify(got));
  assert.ok(got.indexOf('place_buzzer') < got.indexOf('place_button'), `board part first: ${JSON.stringify(got)}`);
});

test('no tool is sent twice, even when the board and the message name the same part', () => {
  const got = names('add an LED and another led, and a battery', ['led', 'led', 'battery', 'resistor']);
  assert.deepEqual(got.filter((n, i) => got.indexOf(n) !== i), [], `duplicates in ${JSON.stringify(got)}`);
});

test('the order is stable: the same request gives the same list', () => {
  const a = names('add a button and a buzzer', ['led']);
  const b = names('add a button and a buzzer', ['led']);
  assert.deepEqual(a, b);
});

test('selectTools is pure: it leaves boardTypes alone', () => {
  const board = Object.freeze(['buzzer', 'led']);
  names('add a button', board);
  assert.deepEqual([...board], ['buzzer', 'led']);
});

test('a board type the server does not know is skipped, not sent as a broken tool', () => {
  const got = names('hello', ['warp_drive']);
  assert.ok(!got.some(n => n == null || /warp_drive/.test(n)), JSON.stringify(got));
  assert.deepEqual(ALWAYS.filter(n => !got.includes(n)), []);
});

test('never more than 12 tools with the five real parts', () => {
  const every = ['resistor', 'led', 'battery', 'buzzer', 'button'];
  const got = names('a resistor, an led, a battery, a buzzer and a button', every);
  assert.ok(got.length <= 12, `${got.length} tools: ${JSON.stringify(got)}`);
});

// ── MAX_TOOLS counts part tools only (issue #76) ───────────────────────────
// A request naming 10 real parts used to get 5 part tools (the 7 always-sent
// tools took the rest of the 12) and silently lost the others.

const TEN_PARTS = 'a potentiometer, a resistor, a current source, a diode, an LED, a zener, a buzzer, a motor, a bulb and a thermistor';
const TEN_TOOLS = ['place_potentiometer', 'place_resistor', 'place_current_source', 'place_diode', 'place_led',
                   'place_zener', 'place_buzzer', 'place_motor', 'place_bulb', 'place_thermistor'];

test('a message naming 10 parts gets all 10 of their tools (more than 5 part tools), at most 12, plus every always-sent tool', () => {
  const got = names(TEN_PARTS);
  assert.deepEqual(ALWAYS_SENT.filter(n => !got.includes(n)), [], `always-sent tools missing: ${JSON.stringify(got)}`);
  assert.deepEqual(TEN_TOOLS.filter(n => !got.includes(n)), [], `named parts dropped: ${JSON.stringify(got)}`);
  assert.ok(partTools(got).length > 5, `${partTools(got).length} part tools: ${JSON.stringify(got)}`);
  assert.ok(partTools(got).length <= 12, `${partTools(got).length} part tools: ${JSON.stringify(got)}`);
  assert.deepEqual(got.filter((n, i) => got.indexOf(n) !== i), [], 'no duplicates');
});

test('the mixed request (LEDs, a button, a motor and a diode) gets place_button too', () => {
  const got = names('Build two LEDs in parallel, a button, a motor and a diode.');
  const want = ['place_led', 'place_resistor', 'place_button', 'place_motor', 'place_diode'];
  assert.deepEqual(want.filter(n => !got.includes(n)), [], `missing from ${JSON.stringify(got)}`);
});

// ── With 10 more parts registered (last: changes the registry) ─────────────

describe('with 10 extra parts in the registry', () => {
  let S, gizmos;
  beforeAll(() => { ({ Server: S, gizmos } = withGizmos(10)); });

  // #76: the always-sent tools no longer count toward the 12.
  test('a keyword that matches 10 parts sends all 10 gizmo tools: at most 12 part tools, plus every always-sent tool', () => {
    const got = select(S, 'add a gizmo', []);
    assert.ok(partTools(got).length <= 12, `${partTools(got).length} part tools: ${JSON.stringify(got)}`);
    assert.deepEqual(ALWAYS_SENT.filter(n => !got.includes(n)), [], JSON.stringify(got));
    const missing = gizmos.map(g => 'place_' + g.type).filter(n => !got.includes(n));
    assert.deepEqual(missing, [], `every matched gizmo fits in the 12 part slots: ${JSON.stringify(got)}`);
  });

  test('14 parts on the board plus keyword matches fill exactly 12 part slots, plus every always-sent tool', () => {
    const board = ['resistor', 'led', 'buzzer', 'button', ...gizmos.map(g => g.type)];
    const got = select(S, 'gizmo resistor led buzzer button', board);
    assert.equal(partTools(got).length, 12, `12 part tools when 14 are asked for: ${JSON.stringify(got)}`);
    assert.deepEqual(ALWAYS_SENT.filter(n => !got.includes(n)), [], JSON.stringify(got));
    assert.deepEqual(got.filter((n, i) => got.indexOf(n) !== i), [], 'no duplicates');
  });
});

// ── The edit tools, issue #27 (D2) ──────────────────────────────────────────
// set_value, set_control and delete_part join the always-sent tools, so the
// AI can change a built circuit ("make the resistor 1k") on any request.

const EDIT_TOOLS = ['set_value', 'set_control', 'delete_part'];

test('set_value, set_control and delete_part are in every selection, ahead of the part tools', () => {
  for (const [message, board] of [...CASES, ['make the resistor 1k', ['battery', 'resistor', 'led']]]) {
    const got = names(message, board);
    assert.deepEqual(EDIT_TOOLS.filter(n => !got.includes(n)), [], `"${message}": missing edit tools from ${JSON.stringify(got)}`);
    const lastEdit  = Math.max(...EDIT_TOOLS.map(n => got.indexOf(n)));
    const firstPart = got.findIndex(n => /^place_/.test(n) && n !== 'place_battery');
    if (firstPart >= 0) assert.ok(lastEdit < firstPart, `"${message}": the edit tools are always-sent, so they come first: ${JSON.stringify(got)}`);
  }
});

test('with the edit tools always sent, every part on the board still fits in 12', () => {
  const every = ['resistor', 'led', 'battery', 'buzzer', 'button'];
  const got = names('a resistor, an led, a battery, a buzzer and a button', every);
  assert.ok(got.length <= 12, `${got.length} tools: ${JSON.stringify(got)}`);
  const want = [...ALWAYS, ...EDIT_TOOLS, 'place_resistor', 'place_led', 'place_buzzer', 'place_button'];
  assert.deepEqual(want.filter(n => !got.includes(n)), [], `missing from ${JSON.stringify(got)}`);
});
