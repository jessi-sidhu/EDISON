// Part packs (issue #76, AI context v2 spec §3). Each DeepSeek request sends
// a fixed core plus the rule lines of only the parts in play, so the prompt
// stops growing with the catalogue.
//
// Shapes these tests assume (decided on the issue, stated so the builder
// matches them):
// - "In play" = the parts whose place_* tool is in the request's tool list
//   (selectTools, which already adds the tools of parts on the board).
//   place_battery is always sent, so the battery is always in play.
// - Filter in place, don't reorder. Only these shrink to the parts in play:
//   the COMPONENT RULES pin-role lines, the PART VALUES lines and the SIZING
//   lines (the guides, controls and recipes already do). The catalogue, the
//   label prefixes and the wiredBy line stay, for every part.
// - The hand-written SERIES vs PARALLEL section and the parallel, series and
//   separate-branches recipes go only with place_led; the ONE BUTTON
//   SWITCHING SEPARATE BRANCHES recipe only with place_button. The one-LED
//   recipe is core and always sent.
// - set_value and set_control are built per request from the parts in play,
//   in the same description format as today. With no part that has controls,
//   set_control still goes, with just `part`.
// - use_parts answers with the added part's pin roles, PART VALUES and
//   SIZING lines, as well as its guide and recipe.
// - SYSTEM_PROMPT (every tool; Gemini and claude) still has everything.
//
// How: the real server's ask() with AI_PROVIDER=deepseek and a fake global
// fetch that keeps the bodies DeepSeek would get. No network, no key. The
// expected lines are read from SYSTEM_PROMPT's own sections, so this file
// checks which lines go, not their wording.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
const Server = require('../backend/server.js');
const Parts  = require('../circuit3d/js/parts');
const testSpan = require('./fixtures/parts/test_span.js');

const DEMO  = 'Build a single LED circuit with a current-limiting resistor.';
const BENCH = 'Power an LED from the bench supply at 5 V with a series resistor.';
const MIXED = 'Build two LEDs in parallel, a button, a motor and a diode.';

const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;
const aiValues = def => (def.ai.values || Object.keys(def.values || {})).filter(k => def.values && def.values[k]);

// ── Sending a request ───────────────────────────────────────────────────────

// A DeepSeek stand-in: answers with the next scripted message, keeps bodies.
function scripted(replies) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    const message = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }] }) };
  };
  fn.calls = calls;
  return fn;
}

// The first body DeepSeek would get for this message and board.
async function firstBody(message, markdown = '', S = Server) {
  const fetch = scripted([{ content: 'Sure.', tool_calls: null }]);
  vi.stubGlobal('fetch', fetch);
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try { await S.ask(markdown, message, []); } finally { quiet.mockRestore(); vi.unstubAllGlobals(); }
  assert.ok(fetch.calls.length >= 1, `nothing was sent to DeepSeek for "${message}"`);
  return fetch.calls[0];
}

const systemOf  = body => body.messages[0].content;
const linesOf   = body => systemOf(body).split('\n');
const toolsOf   = body => body.tools || [];
const namesOf   = body => toolsOf(body).map(t => t.function.name);
const propsOf   = (body, name) => {
  const t = toolsOf(body).find(x => x.function.name === name);
  assert.ok(t, `${name} is not sent: ${JSON.stringify(namesOf(body))}`);
  return Object.keys((t.function.parameters && t.function.parameters.properties) || {});
};
const enumOf = (body, name, key) => {
  const t = toolsOf(body).find(x => x.function.name === name);
  const p = t && t.function.parameters.properties[key];
  return (p && p.enum) || [];
};

// ── The lines each part owns, from the full SYSTEM_PROMPT ──────────────────

const FULL = Server.SYSTEM_PROMPT.split('\n');
function section(heading) {
  const at = FULL.findIndex(l => l.startsWith(heading));
  assert.ok(at >= 0, `SYSTEM_PROMPT has no "${heading}" section`);
  const end = FULL.findIndex((l, i) => i > at && l.trim() === '');
  return FULL.slice(at + 1, end < 0 ? undefined : end);
}
const RULES  = section('COMPONENT RULES:');
const VALUES = section('PART VALUES');
const SIZING = section('SIZING');

// A part's pack lines: pin role, value lines, sizing line.
function packOf(def) {
  const t = toolName(def);
  return {
    pinRole: RULES.filter(l => new RegExp(`^- ${t}: holeA = \\S+, holeB = \\S+$`).test(l)),
    values:  VALUES.filter(l => l.startsWith(`- ${t} `)),
    sizing:  SIZING.filter(l => l.startsWith(`- ${t}: `)),
  };
}
const packLines = def => { const p = packOf(def); return [...p.pinRole, ...p.values, ...p.sizing]; };
const P = type => { const d = Parts.get(type); assert.ok(d, `no part ${type}`); return d; };

// Every part whose tool is sent has all its pack lines; every other part has none.
function checkPacksMatchTools(body, label) {
  const lines = linesOf(body), names = namesOf(body);
  const missing = [], extra = [];
  for (const def of Parts.all()) {
    const want = names.includes(toolName(def));
    for (const l of packLines(def)) {
      if (want && !lines.includes(l)) missing.push(l);
      if (!want && lines.includes(l)) extra.push(l);
    }
  }
  assert.deepEqual(missing, [], `${label}: pack lines missing for parts in play (${names.join(', ')})`);
  assert.deepEqual(extra, [], `${label}: pack lines sent for parts NOT in play (tools: ${names.join(', ')})`);
}

// set_value / set_control carry the keys of the parts in play only.
function checkEditToolsMatchTools(body, label) {
  const names = namesOf(body);
  const inPlay = Parts.all().filter(d => names.includes(toolName(d)));
  const out    = Parts.all().filter(d => !names.includes(toolName(d)));
  const valueKeys   = new Set(inPlay.flatMap(aiValues));
  const controlKeys = new Set(inPlay.flatMap(d => Object.keys(d.controls || {})));
  const sv = propsOf(body, 'set_value'), sc = propsOf(body, 'set_control');
  assert.deepEqual([...valueKeys].filter(k => !sv.includes(k)), [], `${label}: set_value lacks keys of parts in play`);
  assert.deepEqual([...controlKeys].filter(k => !sc.includes(k)), [], `${label}: set_control lacks keys of parts in play`);
  const onlyOut = (keysOf, have) => [...new Set(out.flatMap(keysOf))].filter(k => !have.has(k));
  assert.deepEqual(onlyOut(aiValues, valueKeys).filter(k => sv.includes(k)), [],
    `${label}: set_value offers keys only parts NOT in play have (tools: ${names.join(', ')})`);
  assert.deepEqual(onlyOut(d => Object.keys(d.controls || {}), controlKeys).filter(k => sc.includes(k)), [],
    `${label}: set_control offers keys only parts NOT in play have (tools: ${names.join(', ')})`);
  assert.ok(sv.includes('part') && sc.includes('part'), `${label}: set_value and set_control keep "part"`);
}

// The hand-written section headings that move into the LED and button packs.
const LED_PACK = [
  'SERIES vs PARALLEL:',
  'RECIPE FOR 2 LEDs IN PARALLEL (one shared resistor, starting at column C):',
  'RECIPE FOR 2 LEDs IN SERIES (one resistor, starting at column C):',
  'SEPARATE BRANCHES, ONLY WHEN ASKED',
];
const BUTTON_PACK = 'RECIPE FOR ONE BUTTON SWITCHING SEPARATE BRANCHES';
const ONE_LED     = 'COMPLETE RECIPE FOR ONE LED (starting at column C):';
const has = (body, start) => linesOf(body).some(l => l.startsWith(start));

const CATALOGUE = FULL.find(l => l.startsWith('- Every part (type: name):'));
const LABELS    = FULL.find(l => l.startsWith('- Every part has a label'));
const WIRED_BY  = FULL.find(l => l.startsWith('- Parts on the board ('));

// ── The requests ────────────────────────────────────────────────────────────

const ZENER_BOARD = [
  '**Board status: 3 component(s), 0 wire(s).**', '',
  '## Components',
  '| id | type | value | pin_A | pin_B |',
  '|----|------|-------|-------|-------|',
  '| BAT1 | battery | 12 V | — | — |',
  '| R1 | resistor | 470 Ω | b2 | b6 |',
  '| ZD1 | zener | 5.1V | c8 | c6 |', '',
  '## Wires', '_None._',
].join('\n');

const sent = {};
beforeAll(async () => {
  sent.demo  = await firstBody(DEMO);
  sent.bench = await firstBody(BENCH);
  sent.board = await firstBody('change it to 3.3 V', ZENER_BOARD);
  sent.mixed = await firstBody(MIXED);
});

// ── 1. The demo request ─────────────────────────────────────────────────────

test('pin: demo: the resistor, LED and battery packs are sent (pin role, values, sizing)', () => {
  const lines = linesOf(sent.demo);
  const want = [...packLines(P('resistor')), ...packLines(P('led')), ...packLines(P('battery'))];
  assert.ok(want.length >= 5, `sanity: expected at least 5 pack lines, got ${JSON.stringify(want)}`);
  assert.deepEqual(want.filter(l => !lines.includes(l)), [], 'demo pack lines missing');
});

test('demo: no Zener, bulb, motor, thermistor or current source values or sizing lines', () => {
  const lines = linesOf(sent.demo);
  const notWant = ['zener', 'bulb', 'motor', 'thermistor', 'current_source'].flatMap(t => packLines(P(t)));
  assert.deepEqual(notWant.filter(l => lines.includes(l)), [], 'the demo sends pack lines of parts not in play');
});

test('demo: every pack line in the prompt belongs to a part whose tool is sent', () => {
  checkPacksMatchTools(sent.demo, 'demo');
});

// #118: the op-amp is listed only in requests that have it in play, so the
// demo prompt (demo-led.txt) stays byte-identical. SYSTEM_PROMPT (every tool)
// lists it, so the demo's three core lines are SYSTEM_PROMPT's with only the
// op-amp's entry taken out.
const LISTED_ONLY_IN_PLAY = ['tl072'];
function dropEntry(line, entry) {
  if (line.includes(`, ${entry}`)) return line.replace(`, ${entry}`, '');
  if (line.includes(`${entry}, `)) return line.replace(`${entry}, `, '');
  return line;
}
// A part's name as the label-prefix line writes it (server.js partName):
// all-caps words kept ("TL072", "LED"), the rest lower case.
const labelName = def => def.name.split(' ').map(w => (/^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
function withoutInPlayOnly(line) {
  let out = line;
  for (const def of LISTED_ONLY_IN_PLAY.map(P)) {
    for (const entry of [`${def.type}: ${def.name}`, `${def.prefix} = ${labelName(def)}`]) out = dropEntry(out, entry);
    if (out.startsWith('- Parts on the board (')) out = out.replace(/\(([^)]*)\)/, (m, list) =>
      `(${list.split(', ').filter(x => x !== def.prefix).join(', ')})`);
  }
  return out;
}

test('pin: demo: the catalogue, label prefixes and wiredBy line name every part but the op-amp (listed only when in play, #118)', () => {
  const lines = linesOf(sent.demo);
  for (const l of [CATALOGUE, LABELS, WIRED_BY]) {
    assert.ok(l, 'SYSTEM_PROMPT has the core line');
    const want = withoutInPlayOnly(l);
    assert.ok(lines.includes(want), `missing core line: ${want}`);
  }
});

test('demo: the one-LED recipe and the LED pack (series/parallel/branches) are sent; the button-branches recipe is not', () => {
  assert.ok(has(sent.demo, ONE_LED), 'the one-LED recipe is core');
  for (const h of LED_PACK) assert.ok(has(sent.demo, h), `place_led is sent, so "${h}" goes too`);
  assert.ok(!has(sent.demo, BUTTON_PACK), 'place_button is not sent, so the button-branches recipe stays out');
});

test('demo: set_value has resistance and color but not r10, r25, startCurrent, ratedVoltage or model; set_control has no controls', () => {
  const sv = propsOf(sent.demo, 'set_value');
  for (const k of ['part', 'resistance', 'color']) assert.ok(sv.includes(k), `set_value lacks ${k}: ${JSON.stringify(sv)}`);
  const extra = ['r10', 'r25', 'startCurrent', 'ratedVoltage', 'model'].filter(k => sv.includes(k));
  assert.deepEqual(extra, [], `set_value offers keys of parts not in play: ${JSON.stringify(sv)}`);
  assert.deepEqual(propsOf(sent.demo, 'set_control'), ['part'], 'no part in play has controls, so set_control takes just part');
  checkEditToolsMatchTools(sent.demo, 'demo');
});

// ── 2. The bench supply request ─────────────────────────────────────────────

test('bench: the bench supply pack (voltage and limit lines) is sent, and only packs of parts in play', () => {
  const lines = linesOf(sent.bench);
  const bench = packOf(P('bench_supply'));
  assert.equal(bench.values.length, 2, `sanity: bench supply has voltage and limit lines: ${JSON.stringify(bench.values)}`);
  assert.deepEqual(bench.values.filter(l => !lines.includes(l)), [], 'bench supply values lines missing');
  checkPacksMatchTools(sent.bench, 'bench');
  checkEditToolsMatchTools(sent.bench, 'bench');
});

// ── 3. A part only on the board ─────────────────────────────────────────────

test('board: a Zener on the board (message "change it to 3.3 V") gets its values line and set_value its model choices', () => {
  const names = namesOf(sent.board);
  assert.ok(names.includes('place_zener'), `the Zener on the board is in play: ${JSON.stringify(names)}`);
  const lines = linesOf(sent.board);
  const zener = packOf(P('zener'));
  assert.deepEqual([...zener.values, ...zener.sizing, ...zener.pinRole].filter(l => !lines.includes(l)), [], 'Zener pack lines missing');
  const models = enumOf(sent.board, 'set_value', 'model');
  for (const m of ['3.3V', '5.1V', '12V']) assert.ok(models.includes(m), `set_value.model lacks ${m}: ${JSON.stringify(models)}`);
  assert.ok(!models.includes('1N4148') && !models.includes('1N4001'),
    `no diode is in play, so set_value.model offers only the Zener's: ${JSON.stringify(models)}`);
  checkPacksMatchTools(sent.board, 'board');
  checkEditToolsMatchTools(sent.board, 'board');
});

test('board: with no LED in play, the LED pack recipes are not sent', () => {
  assert.ok(!namesOf(sent.board).includes('place_led'), 'sanity: place_led is not sent');
  for (const h of LED_PACK) assert.ok(!has(sent.board, h), `"${h}" is sent without place_led`);
  assert.ok(has(sent.board, ONE_LED), 'the one-LED recipe is core and always sent');
});

// ── 4. A mixed request ──────────────────────────────────────────────────────

test('mixed: LEDs, a button, a motor and a diode all get their tools and packs, and the button recipe goes', () => {
  const names = namesOf(sent.mixed);
  const want = ['place_led', 'place_button', 'place_motor', 'place_diode'];
  assert.deepEqual(want.filter(n => !names.includes(n)), [], `missing tools: ${JSON.stringify(names)}`);
  const lines = linesOf(sent.mixed);
  const packs = ['led', 'button', 'motor', 'diode'].flatMap(t => packLines(P(t)));
  assert.deepEqual(packs.filter(l => !lines.includes(l)), [], 'pack lines missing');
  assert.ok(has(sent.mixed, BUTTON_PACK), 'place_button is sent, so the button-branches recipe goes');
  for (const h of LED_PACK) assert.ok(has(sent.mixed, h), `"${h}" missing with place_led sent`);
  checkPacksMatchTools(sent.mixed, 'mixed');
  checkEditToolsMatchTools(sent.mixed, 'mixed');
});

// ── 6. use_parts carries the added part's pack ─────────────────────────────

test('use_parts ["zener"] answers with the Zener pin role, values and sizing lines, its guide and its recipe', async () => {
  const fetch = scripted([
    { content: '', tool_calls: [{ id: 'u1', type: 'function', function: { name: 'use_parts', arguments: JSON.stringify({ types: ['zener'] }) } }] },
    { content: 'Here you go.', tool_calls: null },
  ]);
  vi.stubGlobal('fetch', fetch);
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try { await Server.ask('', 'add a part', []); } finally { quiet.mockRestore(); vi.unstubAllGlobals(); }

  assert.ok(!namesOf(fetch.calls[0]).includes('place_zener'), 'sanity: round 1 does not send place_zener');
  const m = fetch.calls[1].messages.find(x => x.role === 'tool' && x.tool_call_id === 'u1');
  assert.ok(m, 'no tool result for use_parts');
  const said = String(m.content);
  const def = P('zener'), pack = packOf(def);
  const want = [...pack.pinRole, ...pack.values, ...pack.sizing].map(l => l.replace(/^- /, ''));
  assert.equal(want.length, 3, `sanity: the Zener has a pin role, a values line and a sizing line: ${JSON.stringify(want)}`);
  assert.deepEqual(want.filter(l => !said.includes(l)), [], `the use_parts result lacks the Zener's pack lines:\n${said}`);
  assert.ok(said.includes(def.ai.guide), 'the use_parts result keeps the Zener guide');
  assert.ok(said.includes(`RECIPE FOR THE ${def.name.toUpperCase()}`), 'the use_parts result keeps the Zener recipe');
});

// ── 9. SYSTEM_PROMPT still has every pack (Gemini / claude path) ───────────

test('pin: SYSTEM_PROMPT (every tool) still has every part\'s values and sizing lines, and both hand-written packs', () => {
  const p = Server.SYSTEM_PROMPT;
  for (const def of Parts.all().filter(d => d.ai !== false)) {   // an ai: false part (#96) gets no pack
    const pack = packOf(def);
    assert.equal(pack.values.length, aiValues(def).length, `${def.type}: one values line per AI value key`);
    if (def.place.kind === 'span') assert.equal(pack.sizing.length, 1, `${def.type}: a sizing line`);
  }
  for (const h of [...LED_PACK, BUTTON_PACK, ONE_LED]) assert.ok(FULL.some(l => l.startsWith(h)), `SYSTEM_PROMPT lacks "${h}"`);
  assert.ok(p.includes(CATALOGUE));
});

// ── 7. Growth: a new part changes the demo only in its catalogue lines ─────
// Last: it registers a part in the shared registry and loads server.js again.

describe('with a dummy part registered', () => {
  // A part that would add a line to every generated section: a directional
  // span part (pin role), with values (PART VALUES, set_value), a slider
  // (controls, set_control), a guide and a recipe.
  function dummy() {
    const d = testSpan();
    Object.assign(d, { type: 'test_pack', name: 'Test pack', prefix: 'TK', pins: ['cathode', 'anode'] });
    d.values = {
      grip:    { unit: 'Ω', default: 1000, min: 1, max: 1e6 },
      flavour: { choices: { sweet: {}, sour: {} }, default: 'sweet' },
    };
    d.controls = { twist: { type: 'slider', default: 50, min: 0, max: 100, step: 1, unit: '%', saved: true } };
    d.gestures = { scroll: 'twist' };
    d.elements = values => [{ kind: 'D', id: 'd', pins: ['anode', 'cathode'], vf: 2, ron: values.grip }];
    d.ai = {
      about: 'A test-only packed part.', keywords: ['testpack'], guide: 'Test pack guide line (place_resistor).',
      recipe: { name: 'test pack alone', parts: [{ type: 'battery', label: 'BAT1' }, { type: 'test_pack', label: 'TK1', holes: ['b3', 'b7'] }],
        wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_9'], ['tp_3', 'a7'], ['a3', 'tn_3']], expect: {} },
    };
    d.examples = [{ ...d.ai.recipe, name: 'test pack example' }];
    return d;
  }

  let S2, before, after, packed;
  beforeAll(async () => {
    before = sent.demo;
    if (!Parts.get('test_pack')) Parts.define(dummy());
    const file = require.resolve('../backend/server.js');
    delete require.cache[file];
    S2 = require(file);
    after  = await firstBody(DEMO, '', S2);
    packed = await firstBody('add a testpack', '', S2);
  });

  test('sanity: the dummy part is real: SYSTEM_PROMPT has its values line and its tool goes when named', () => {
    assert.match(S2.SYSTEM_PROMPT, /- place_test_pack grip: /);
    assert.ok(namesOf(packed).includes('place_test_pack'), JSON.stringify(namesOf(packed)));
    assert.ok(linesOf(packed).some(l => l.startsWith('- place_test_pack grip: ')), 'named, it gets its pack');
  });

  test('the demo system prompt changes only in the catalogue, label and wiredBy lines', () => {
    const was = linesOf(before), now = linesOf(after);
    const gone  = was.filter(l => !now.includes(l));
    const added = now.filter(l => !was.includes(l));
    const core = l => /^- Every part \(type: name\):|^- Every part has a label|^- Parts on the board \(/.test(l);
    assert.deepEqual(gone.filter(l => !core(l)), [], 'lines the dummy part removed from the demo prompt');
    assert.deepEqual(added.filter(l => !core(l)), [], 'lines the dummy part added to the demo prompt');
    assert.equal(added.length, 3, `the three core lines name the dummy: ${JSON.stringify(added)}`);
    for (const l of added) assert.ok(/test_pack|Test pack|test pack|TK/.test(l), `changed core line should name the dummy: ${l}`);
    assert.equal(now.length, was.length, 'same number of lines');
  });

  test('the demo tools do not change at all', () => {
    assert.deepEqual(namesOf(after), namesOf(before), 'the same tools, in the same order');
    const changed = toolsOf(after).filter((t, i) => JSON.stringify(t) !== JSON.stringify(toolsOf(before)[i]))
      .map(t => `${t.function.name}: ${JSON.stringify(t.function.parameters).match(/grip|flavour|twist|test.pack/gi)}`);
    assert.deepEqual(changed, [], 'tools the dummy part changed (and the dummy words they now carry)');
  });
});
