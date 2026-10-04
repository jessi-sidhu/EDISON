// Issue #66 (QA AI-11): when the AI builds with a part the user controls,
// its reply says how to control it. The night-light reply said "Scroll the
// LDR darker" without saying how, and the user couldn't make it night.
//
// Shapes these tests assume (stated so the builder matches them):
// - SYSTEM_PROMPT's BUILDING BEHAVIOR section gets one hand-written
//   reply-style line, e.g. "- When a build uses a part you can adjust (a
//   slider or switch), tell the user how: click the part and use its slider
//   in the panel on the right, or scroll over it (or click it, for buttons
//   and switches) while the simulation runs." No existing line changes (the
//   verbatim guard in test/ai-tools.test.js still holds).
// - The prompt has a generated line per part with a `slider` control, built
//   from the registry (the part's controls and gestures), naming its tool,
//   the control key and its unit as "<key> (<unit>)", and saying slider and
//   scroll, e.g.
//     "- place_ldr: the user adjusts light (lux) with a slider or by scrolling over it"
//   It sits with the part's guide, so a request that sends the tool gets it.
// - A part with no controls (the resistor) gets no such line.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');
const Parts  = require('../circuit3d/js/parts');

const prompt = () => {
  assert.equal(typeof Server.SYSTEM_PROMPT, 'string', 'server.js must export the built SYSTEM_PROMPT');
  return Server.SYSTEM_PROMPT;
};
const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The BUILDING BEHAVIOR section's lines, up to the next blank line.
function buildingBehavior(text) {
  const lines = text.split('\n');
  const at = lines.indexOf('BUILDING BEHAVIOR:');
  assert.ok(at >= 0, 'the prompt has a BUILDING BEHAVIOR: section');
  const end = lines.findIndex((l, i) => i > at && l.trim() === '');
  return lines.slice(at + 1, end < 0 ? undefined : end);
}

// The generated control line for one tool: names the tool, "<key> (<unit>)",
// a slider and scrolling.
function controlLine(text, tool, key, unit) {
  return text.split('\n').find(l =>
    new RegExp(`\\b${esc(tool)}\\b`).test(l) &&
    l.includes(`${key} (${unit})`) &&
    /\bslider\b/i.test(l) &&
    /\bscroll/i.test(l));
}

// ── 1. The hand-written reply-style rule ───────────────────────────────────

test('BUILDING BEHAVIOR tells the AI to say how to control an adjustable part: slider, scroll, simulation', () => {
  const lines = buildingBehavior(prompt());
  const line = lines.find(l => /\bslider\b/i.test(l) && /\bscroll/i.test(l) && /\bsimulat/i.test(l));
  assert.ok(line,
    `expected a BUILDING BEHAVIOR line mentioning "slider", "scroll" and "simulation", got none in: ${JSON.stringify(lines)}`);
  assert.match(line, /\b(tell|say|reply|explain)\b/i, `the control line should be about what the reply says: "${line}"`);
});

// ── 2. Generated per-part control lines ────────────────────────────────────

const SLIDERS = [
  ['ldr',           'place_ldr',           'light',       'lux'],
  ['thermistor',    'place_thermistor',    'temperature', '°C'],
  ['potentiometer', 'place_potentiometer', 'position',    '%'],
];

for (const [type, tool, key, unit] of SLIDERS) {
  test(`the prompt has a generated line for ${tool}: the user adjusts ${key} (${unit}) with a slider or by scrolling`, () => {
    // The registry is the source: the key and unit come from the part.
    const c = Parts.get(type).controls[key];
    assert.equal(c.type, 'slider');
    assert.equal(c.unit, unit);
    const p = prompt();
    const line = controlLine(p, tool, key, unit);
    const near = p.split('\n').filter(l => new RegExp(`\\b${tool}\\b`).test(l));
    assert.ok(line,
      `expected a line naming ${tool}, "${key} (${unit})", "slider" and "scroll", got none among the ${tool} lines: ${JSON.stringify(near)}`);
  });
}

test('every registered part with a slider control gets its control line', () => {
  const p = prompt();
  const missing = [];
  for (const def of Parts.all()) {
    for (const [key, c] of Object.entries(def.controls || {})) {
      if (c.type === 'slider' && !controlLine(p, toolName(def), key, c.unit)) missing.push(`${toolName(def)} ${key} (${c.unit})`);
    }
  }
  assert.deepEqual(missing, [], 'slider controls with no generated control line');
});

test('a part without controls (the resistor) gets no control line', () => {
  assert.equal(Parts.get('resistor').controls, undefined, 'the resistor has no controls');
  const bad = prompt().split('\n').filter(l => /\bplace_resistor\b/.test(l) && (/\bslider\b/i.test(l) || /\bscroll/i.test(l)));
  assert.deepEqual(bad, [], 'a place_resistor line talks about a slider or scrolling');
});

// ── Generated, not hand-written: a new slider part gets its line ───────────
// Registers a test-only part with a slider control in the shared registry and
// reloads server.js, so keep these the last tests in the file.

describe('a new part with a slider control (test-only)', () => {
  let S;
  beforeAll(() => {
    const d = require('./fixtures/parts/test_span.js')();
    Object.assign(d, { type: 'hint_dial', name: 'Hint dial', prefix: 'HD' });
    d.controls = { spin: { type: 'slider', default: 5, min: 0, max: 10, step: 1, unit: 'V', saved: true } };
    d.gestures = { scroll: 'spin' };
    d.elements = values => [{ kind: 'R', id: 'r', pins: ['a', 'b'], ohms: values.resistance }];
    d.ai = { about: 'A test-only dial.', keywords: ['hint dial'] };
    d.examples[0].parts[1] = { type: d.type, label: 'HD1', holes: ['a3', 'a7'] };
    d.examples[0].expect = { HD1: { current: [8.5, 9.5] } };
    if (!Parts.get(d.type)) Parts.define(d);
    const file = require.resolve('../backend/server.js');
    delete require.cache[file];
    S = require(file);
  });

  test('place_hint_dial gets "spin (V)" with a slider or scrolling, with no hand edit in server.js', () => {
    const p = S.SYSTEM_PROMPT;
    const line = controlLine(p, 'place_hint_dial', 'spin', 'V');
    const near = p.split('\n').filter(l => /\bplace_hint_dial\b/.test(l));
    assert.ok(line, `expected a generated line naming place_hint_dial and "spin (V)", got: ${JSON.stringify(near)}`);
  });
});
