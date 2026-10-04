// The AI places the multimeter and the capacitor (issue #123). Both parts
// had `ai: false` (#96, #104); now each has an ai block, so a request that
// names one gets its pack, like every other part, and the demo LED request
// gets neither.
//
// Shapes these tests assume (from the issue and the scout's map, stated so
// the builder matches them):
// - multimeter: ai = { about, keywords (multimeter, meter, voltmeter,
//   ammeter, ...), guide naming its probes MM1.red / MM1.black, values
//   ['mode'], recipe = the V-mode divider (R2 of a 1k/1k on 9 V) }.
// - capacitor: ai = { about, keywords (capacitor, charge, ...), guide naming
//   its + and − pins (polarity), values ['capacitance'], recipe = 9 V →
//   1 kΩ → 1000 µF }. The recipes' numbers are checked by
//   test/parts-examples.test.js (it solves every ai.recipe), not here.
// - "A pack" is what test/part-packs.test.js means: the part's place_ tool,
//   its PART VALUES lines, its guide line and its recipe, plus its value keys
//   in set_value. set_value and set_control are rebuilt per request from the
//   parts in play (server.js selectTools → inPlay), so naming a part adds its
//   keys there and the demo's stay as they are.
// - Both parts are listed only when in play (ai.listed 'in-play', as the
//   TL072 is since #118): the catalogue, label-prefix and wiredBy lines name
//   them only in a request whose tools include theirs, so the demo prompt
//   does not grow. SYSTEM_PROMPT (every tool; Gemini and claude) names both.
// - The demo golden (test/fixtures/prompts/demo-led.txt, byte for byte) and
//   DEMO_BUDGET are test/prompt-golden.test.js's; they are not repeated here.
//
// How: the real server's ask() with AI_PROVIDER=deepseek and a fake global
// fetch that keeps the body DeepSeek would get (as test/part-packs.test.js
// does). No network, no key.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
const Server = require('../backend/server.js');
const Parts  = require('../circuit3d/js/parts');

// The demo text is prompt-golden's CASES.demo.request, word for word.
const DEMO      = 'Build a single LED circuit with a current-limiting resistor.';
// The PART-meter ai-eval case's message (scripts/ai-eval-cases.js), word for word.
const METER_ASK = 'Build a divider of two 1 kΩ resistors on the 9 V battery and measure the voltage across R2 with a multimeter.';
const CAP_ASK   = 'Add a 1000 µF capacitor that charges through a 1 kΩ resistor.';

const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;

function part(type) {
  const def = Parts.get(type);
  assert.ok(def, `no ${type} part registered`);
  return def;
}
// The part, which must now be an AI part (an ai object, not ai: false).
function aiPart(type) {
  const def = part(type);
  assert.ok(def.ai && typeof def.ai === 'object',
    `the ${type} must have an ai block so the AI can place it; it has ai: ${JSON.stringify(def.ai)}`);
  return def;
}

// ── Sending a request ───────────────────────────────────────────────────────

async function firstBody(message, markdown = '') {
  const calls = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'Sure.', tool_calls: null } }] }) };
  });
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try { await Server.ask(markdown, message, []); } finally { quiet.mockRestore(); vi.unstubAllGlobals(); }
  assert.ok(calls.length >= 1, `nothing was sent to DeepSeek for "${message}"`);
  return calls[0];
}

const linesOf = body => body.messages[0].content.split('\n');
const namesOf = body => (body.tools || []).map(t => t.function.name);
const propsOf = (body, name) => {
  const t = (body.tools || []).find(x => x.function.name === name);
  assert.ok(t, `${name} is not sent: ${JSON.stringify(namesOf(body))}`);
  return (t.function.parameters && t.function.parameters.properties) || {};
};

// A part's pack lines in a system prompt (the formats server.js writes): its
// PART VALUES lines ("- place_x key: ..."), its guide line ("- place_x: "
// + ai.guide) and its recipe heading. `tagged` is every line that starts
// with its tool name (values, guide, pin role, sizing), for the demo check.
function packIn(body, def) {
  const t = toolName(def);
  const lines = linesOf(body);
  const guide = def.ai && def.ai.guide;
  return {
    values: lines.filter(l => l.startsWith(`- ${t} `)),
    guide:  lines.filter(l => guide && l === `- ${t}: ${guide}`),
    recipe: lines.filter(l => l.startsWith(`RECIPE FOR THE ${def.name.toUpperCase()} (${t}`)),
    tagged: lines.filter(l => l.startsWith(`- ${t} `) || l.startsWith(`- ${t}: `)),
  };
}

// The value and control keys only this part has (no other part shares them),
// so a schema that carries one is carrying this part.
function ownKeys(def) {
  const keysOf = d => [...Object.keys(d.values || {}), ...Object.keys(d.controls || {})];
  const others = new Set(Parts.all().filter(d => d !== def && d.ai !== false).flatMap(keysOf));
  return keysOf(def).filter(k => !others.has(k));
}

const sent = {};
beforeAll(async () => {
  sent.demo  = await firstBody(DEMO);
  sent.meter = await firstBody(METER_ASK);
  sent.cap   = await firstBody(CAP_ASK);
});

// ── The multimeter ──────────────────────────────────────────────────────────

test('the multimeter has an ai block: keywords, a guide naming its probes MM1.red and MM1.black, a recipe with a meter', () => {
  const def = aiPart('multimeter');
  assert.ok(Array.isArray(def.ai.keywords) && def.ai.keywords.includes('multimeter'),
    `ai.keywords include "multimeter": ${JSON.stringify(def.ai.keywords)}`);
  assert.match(String(def.ai.guide), /\bMM\d*\.red\b/, 'the guide names the red probe as a wire end (MM1.red)');
  assert.match(String(def.ai.guide), /\bMM\d*\.black\b/, 'the guide names the black probe as a wire end (MM1.black)');
  assert.ok(def.ai.recipe && def.ai.recipe.parts.some(p => p.type === 'multimeter'), 'the recipe places a multimeter');
});

test('the PART-meter request (a 1 kΩ / 1 kΩ divider, measure R2 with a multimeter) sends the meter\'s pack: place_multimeter, its guide, values line and recipe', () => {
  const def = aiPart('multimeter');
  const t = toolName(def);
  assert.ok(namesOf(sent.meter).includes(t), `${t} is not sent: ${JSON.stringify(namesOf(sent.meter))}`);
  const pack = packIn(sent.meter, def);
  assert.equal(pack.guide.length, 1, `the guide line "- ${t}: ${def.ai.guide}" in the system prompt`);
  assert.ok(pack.values.some(l => l.startsWith(`- ${t} mode: `)), `a PART VALUES line "- ${t} mode: ..."; got ${JSON.stringify(pack.values)}`);
  assert.equal(pack.recipe.length, 1, `the recipe "RECIPE FOR THE ${def.name.toUpperCase()} (${t}..." in the system prompt`);
});

test('with the meter named, set_value can set its mode to V, A or Ω, and place_multimeter takes a mode', () => {
  const def = aiPart('multimeter');
  const modes = Object.keys(def.values.mode.choices);
  const sv = propsOf(sent.meter, 'set_value');
  assert.ok(sv.mode, `set_value has no mode key: ${JSON.stringify(Object.keys(sv))}`);
  assert.deepEqual(modes.filter(m => !(sv.mode.enum || []).includes(m)), [], `set_value.mode.enum lacks a mode: ${JSON.stringify(sv.mode.enum)}`);
  const place = propsOf(sent.meter, toolName(def));
  assert.ok(place.mode, `${toolName(def)} has no mode param: ${JSON.stringify(Object.keys(place))}`);
});

// ── The capacitor ───────────────────────────────────────────────────────────

test('the capacitor has an ai block: keywords, a guide naming its + and − pins, a recipe with a capacitor', () => {
  const def = aiPart('capacitor');
  assert.ok(Array.isArray(def.ai.keywords) && def.ai.keywords.includes('capacitor'),
    `ai.keywords include "capacitor": ${JSON.stringify(def.ai.keywords)}`);
  assert.match(String(def.ai.guide), /\+|\bplus\b/i, 'the guide names the + pin');
  assert.match(String(def.ai.guide), /−|\bminus\b|\bnegative\b/i, 'the guide names the − pin');
  assert.ok(def.ai.recipe && def.ai.recipe.parts.some(p => p.type === 'capacitor'), 'the recipe places a capacitor');
});

test('"Add a 1000 µF capacitor that charges through a 1 kΩ resistor." sends the capacitor\'s pack and the resistor\'s tool', () => {
  const def = aiPart('capacitor');
  const t = toolName(def);
  const names = namesOf(sent.cap);
  assert.ok(names.includes(t), `${t} is not sent: ${JSON.stringify(names)}`);
  assert.ok(names.includes(toolName(part('resistor'))), `the resistor's tool is not sent: ${JSON.stringify(names)}`);
  const pack = packIn(sent.cap, def);
  assert.equal(pack.guide.length, 1, `the guide line "- ${t}: ${def.ai.guide}" in the system prompt`);
  assert.ok(pack.values.some(l => l.startsWith(`- ${t} capacitance: `)), `a PART VALUES line "- ${t} capacitance: ..."; got ${JSON.stringify(pack.values)}`);
  assert.equal(pack.recipe.length, 1, `the recipe "RECIPE FOR THE ${def.name.toUpperCase()} (${t}..." in the system prompt`);
});

test('with the capacitor named, set_value can set its capacitance to any kit value, 1000µF included', () => {
  const def = aiPart('capacitor');
  const kit = Object.keys(def.values.capacitance.choices);
  assert.ok(kit.includes('1000µF'), `sanity: 1000µF is a kit value: ${JSON.stringify(kit)}`);
  const sv = propsOf(sent.cap, 'set_value');
  assert.ok(sv.capacitance, `set_value has no capacitance key: ${JSON.stringify(Object.keys(sv))}`);
  assert.deepEqual(kit.filter(k => !(sv.capacitance.enum || []).includes(k)), [], `set_value.capacitance.enum lacks a kit value: ${JSON.stringify(sv.capacitance.enum)}`);
});

// Which words pick the capacitor. "cap" and "charge" are everyday words
// (capping a current, a cap on something, charging a battery), so they must
// not pull in place_capacitor; "capacitor", RC and time constant do.
const CAP_SELECTS = [
  [CAP_ASK, true],
  ['Build an RC circuit on the battery.', true],
  ['Show me the time constant of a resistor and a 470 µF part.', true],
  ['Cap the current at 20 mA.', false],
  ['put a cap on it', false],
  ['charge my battery circuit', false],
];

test('selectTools sends place_capacitor for capacitor / RC / time constant, but not for "cap the current", "a cap on it" or "charge my battery"', () => {
  const t = toolName(aiPart('capacitor'));
  const wrong = CAP_SELECTS
    .map(([message, want]) => [message, want, Server.selectTools(message, []).some(d => d.name === t)])
    .filter(([, want, got]) => got !== want)
    .map(([message, want]) => `"${message}" ${want ? 'does not send' : 'sends'} ${t}`);
  assert.deepEqual(wrong, [], 'requests that pick the capacitor wrongly');
});

// ── The demo LED request gets neither ───────────────────────────────────────
// Pin: both are AI parts now, and the demo still sends nothing of either.
// The demo's exact bytes and size are prompt-golden's.

test('pin: the demo LED request sends neither part\'s tool, pack lines, or set_value / set_control keys', () => {
  const names = namesOf(sent.demo);
  const sv = Object.keys(propsOf(sent.demo, 'set_value'));
  const sc = Object.keys(propsOf(sent.demo, 'set_control'));
  for (const type of ['multimeter', 'capacitor']) {
    const def = part(type);
    const t = toolName(def);
    assert.ok(!names.includes(t), `the demo sends ${t}: ${JSON.stringify(names)}`);
    const pack = packIn(sent.demo, def);
    assert.deepEqual([...pack.tagged, ...pack.recipe], [],`the demo's system prompt has ${type} pack lines`);
    const own = ownKeys(def);
    assert.ok(own.length >= 1, `sanity: the ${type} has a key no other part has: ${JSON.stringify(Object.keys(def.values || {}))}`);
    assert.deepEqual(own.filter(k => sv.includes(k) || sc.includes(k)), [],
      `the demo's set_value ${JSON.stringify(sv)} / set_control ${JSON.stringify(sc)} carry ${type}-only keys`);
  }
});

// ── Listed only when in play (catalogue, label prefixes, wiredBy) ──────────
// The three core lines of a system prompt, and what each says about a part.

function coreOf(text) {
  const lines = text.split('\n');
  const find = start => lines.find(l => l.startsWith(start)) || '';
  return {
    catalogue: find('- Every part (type: name):'),
    labels:    find('- Every part has a label'),
    wiredBy:   find('- Parts on the board ('),
  };
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Does each core line name the part? Catalogue: "type: Name"; labels: "PREFIX = "
// as a list entry; wiredBy: the prefix in its (A, B, C) list.
function namedIn(core, def) {
  const wired = (core.wiredBy.match(/^- Parts on the board \(([^)]*)\)/) || ['', ''])[1].split(', ');
  return {
    catalogue: new RegExp(`(?:: |, )${esc(def.type)}: ${esc(def.name)}(?:,|\\.$)`).test(core.catalogue),
    labels:    new RegExp(`(?:: |, )${esc(def.prefix)} = `).test(core.labels),
    wiredBy:   wired.includes(def.prefix),
  };
}

test('the demo LED request lists neither part: not in the catalogue, the label prefixes or the wiredBy line', () => {
  const core = coreOf(sent.demo.messages[0].content);
  for (const l of Object.values(core)) assert.ok(l, `sanity: the demo prompt has all three core lines: ${JSON.stringify(core)}`);
  for (const type of ['multimeter', 'capacitor']) {
    const def = part(type);
    assert.deepEqual(namedIn(core, def), { catalogue: false, labels: false, wiredBy: false },
      `the demo prompt names the ${type} (${def.type}: ${def.name}, ${def.prefix} =); it must be listed only when in play:\n${Object.values(core).join('\n')}`);
  }
});

test('pin: SYSTEM_PROMPT (every tool, Gemini / claude) lists both parts in the catalogue and the label prefixes', () => {
  const core = coreOf(Server.SYSTEM_PROMPT);
  for (const type of ['multimeter', 'capacitor']) {
    const def = aiPart(type);
    const got = namedIn(core, def);
    assert.ok(got.catalogue, `the catalogue lacks "${def.type}: ${def.name}": ${core.catalogue}`);
    assert.ok(got.labels, `the label prefixes lack "${def.prefix} = ": ${core.labels}`);
  }
});

test('pin: the meter request lists the multimeter in the catalogue and label prefixes; the multimeter is off the board, so never in wiredBy', () => {
  const def = aiPart('multimeter');
  const core = coreOf(sent.meter.messages[0].content);
  assert.deepEqual(namedIn(core, def), { catalogue: true, labels: true, wiredBy: false },
    `the meter request's core lines:\n${Object.values(core).join('\n')}`);
});

test('pin: the capacitor request lists the capacitor in the catalogue, the label prefixes and (it sits in the board) the wiredBy line', () => {
  const def = aiPart('capacitor');
  const core = coreOf(sent.cap.messages[0].content);
  assert.deepEqual(namedIn(core, def), { catalogue: true, labels: true, wiredBy: true },
    `the capacitor request's core lines:\n${Object.values(core).join('\n')}`);
});
