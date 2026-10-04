// Tests for the AI tools and prompt that backend/server.js generates from the
// parts registry (issue #27, step D1). docs/API-CONTRACT.md → "AI tools".
//
// Shapes these tests assume (stated so the builder matches them):
// - server.js exports CIRCUIT_TOOLS, every tool in Gemini's shape:
//   [{ function_declarations: [{ name, description, parameters? }] }].
//   It holds delete_all, add_wire, use_parts and one place_<type> tool per
//   registered part (the part's ai.tool when it sets one). This is the list
//   the non-DeepSeek providers send, once, in full.
// - server.js exports SYSTEM_PROMPT, the full prompt: the hand-written
//   sections word for word, plus the generated sections for every part.
// - Tool params are unchanged from the hand-written tools: see TODAY below.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');
const Parts  = require('../circuit3d/js/parts');
const P      = require('../backend/ai-providers.js');
const { COLS, TOTAL_HOLES } = require('../circuit3d/js/board-geometry.js');
const { withGizmos } = require('./fixtures/gizmos.js');

function declsOf(S) {
  assert.ok(Array.isArray(S.CIRCUIT_TOOLS), 'server.js must export CIRCUIT_TOOLS, the generated tool list');
  const decls = S.CIRCUIT_TOOLS[0] && S.CIRCUIT_TOOLS[0].function_declarations;
  assert.ok(Array.isArray(decls), 'CIRCUIT_TOOLS must be [{ function_declarations: [...] }]');
  return decls;
}
const decls = () => declsOf(Server);
const tool  = (name, S = Server) => {
  const t = declsOf(S).find(d => d.name === name);
  assert.ok(t, `no ${name} tool in ${JSON.stringify(declsOf(S).map(d => d.name))}`);
  return t;
};
const promptOf = S => {
  assert.equal(typeof S.SYSTEM_PROMPT, 'string', 'server.js must export the built SYSTEM_PROMPT');
  return S.SYSTEM_PROMPT;
};
const prompt = () => promptOf(Server);
const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;

// A declaration is valid in Gemini's schema, the shape toOpenAITools reads.
const TYPES = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT'];
function checkDecl(d) {
  const at = d && d.name;
  assert.match(String(at), /^[a-z][a-z0-9_]*$/, `tool name ${JSON.stringify(at)}`);
  assert.equal(typeof d.description, 'string', `${at}: description`);
  assert.ok(d.description.trim().length > 0, `${at}: empty description`);
  if (d.parameters === undefined) return;
  assert.equal(d.parameters.type, 'OBJECT', `${at}: parameters.type`);
  const props = d.parameters.properties;
  assert.ok(props && typeof props === 'object', `${at}: parameters.properties`);
  for (const [k, p] of Object.entries(props)) {
    assert.ok(TYPES.includes(p.type), `${at}.${k}: type ${p.type} is not one of ${TYPES.join(', ')}`);
    assert.equal(typeof p.description, 'string', `${at}.${k}: description`);
    if (p.type === 'ARRAY') assert.ok(p.items && TYPES.includes(p.items.type), `${at}.${k}: an ARRAY needs items with a type`);
  }
  for (const r of d.parameters.required || []) assert.ok(r in props, `${at}: required "${r}" is not a property`);
}

// ── Generated tools ─────────────────────────────────────────────────────────

test('every registered part has a generated tool, and every tool is a valid declaration', () => {
  const got = decls();
  for (const def of Parts.all()) assert.ok(got.some(d => d.name === toolName(def)), `no tool for ${def.type}`);
  for (const d of got) checkDecl(d);
  const n = got.map(d => d.name);
  assert.deepEqual(n.filter((x, i) => n.indexOf(x) !== i), [], 'a tool name appears twice');
});

// Today's hand-written tools: names, params and required, unchanged.
const TODAY = {
  place_resistor: { props: ['holeA', 'holeB', 'resistance'], required: ['holeA', 'holeB'] },
  place_led:      { props: ['color', 'holeA', 'holeB'],      required: ['holeA', 'holeB'] },
  place_battery:  { props: ['voltage'],                      required: [] },
  place_buzzer:   { props: ['holeA', 'holeB'],               required: ['holeA', 'holeB'] },
  place_button:   { props: ['holeA', 'holeB'],               required: ['holeA', 'holeB'] },
  add_wire:       { props: ['color', 'from', 'to'],          required: ['from', 'to', 'color'] },
};

for (const [name, want] of Object.entries(TODAY)) {
  test(`${name} keeps today's params: {${want.props.join(', ')}}, required [${want.required.join(', ')}]`, () => {
    const p = tool(name).parameters || { properties: {} };
    assert.deepEqual(Object.keys(p.properties).sort(), want.props);
    assert.deepEqual([...(p.required || [])].sort(), [...want.required].sort());
  });
}

test('the value params keep their types: resistance and voltage are numbers, color a string', () => {
  assert.equal(tool('place_resistor').parameters.properties.resistance.type, 'NUMBER');
  assert.equal(tool('place_battery').parameters.properties.voltage.type, 'NUMBER');
  assert.equal(tool('place_led').parameters.properties.color.type, 'STRING');
});

test("place_led's color offers exactly the LED's values.color choices", () => {
  const choices = Object.keys(Parts.get('led').values.color.choices);
  const color = tool('place_led').parameters.properties.color;
  const said = JSON.stringify(color);
  assert.deepEqual(choices.filter(c => !said.includes(c)), [], `choices missing from ${said}`);
  if (color.enum) assert.deepEqual([...color.enum].sort(), [...choices].sort());
});

test('delete_all and use_parts are there; use_parts takes a list of part types', () => {
  checkDecl(tool('delete_all'));
  const u = tool('use_parts');
  checkDecl(u);
  assert.ok(u.parameters && u.parameters.properties.types, 'use_parts needs a "types" param');
  assert.equal(u.parameters.properties.types.type, 'ARRAY');
  assert.equal(u.parameters.properties.types.items.type, 'STRING');
  assert.deepEqual(u.parameters.required, ['types']);
});

test('toOpenAITools converts every generated tool to a lower-case OpenAI function tool', () => {
  const out = P.toOpenAITools(Server.CIRCUIT_TOOLS);
  assert.equal(out.length, decls().length);
  for (const t of out) {
    assert.equal(t.type, 'function');
    assert.equal(t.function.parameters.type, 'object', t.function.name);
    assert.doesNotMatch(JSON.stringify(t.function.parameters), /"type":"[A-Z]/, `${t.function.name} still has upper-case types`);
  }
});

// ── Generated prompt sections ───────────────────────────────────────────────

const lineWith = (text, re) => text.split('\n').find(l => re.test(l));

test('the prompt has a sizing line per span part, built from its span', () => {
  const p = prompt();
  assert.ok(lineWith(p, /place_resistor\b.*\b3–5 columns\b.*\b4 is typical\b/),
    'no line like "place_resistor: 3–5 columns apart on one row (4 is typical)"');
  assert.ok(lineWith(p, /place_led\b.*\b1–3 columns\b.*\b2 is typical\b/),
    'no line like "place_led: 1–3 columns apart on one row (2 is typical)"');
  assert.ok(lineWith(p, /place_buzzer\b.*\b2 columns\b/), 'no sizing line for place_buzzer (2 columns)');
  assert.ok(lineWith(p, /place_button\b.*\b3 columns\b/), 'no sizing line for place_button (3 columns)');
  // The hand-written sizing list said "exactly 4" for the resistor.
  assert.doesNotMatch(p, /place_resistor:? exactly 4 columns/, 'the old hand-written resistor sizing line is still there');
});

test('the prompt names the pin roles: place_led holeA = cathode, holeB = anode', () => {
  assert.ok(lineWith(prompt(), /place_led\b.*holeA\s*=\s*cathode.*holeB\s*=\s*anode/),
    'no line like "place_led: holeA = cathode, holeB = anode"');
});

test('the prompt has the label prefixes and a one-line catalogue naming every part', () => {
  const p = prompt();
  for (const def of Parts.all()) assert.match(p, new RegExp(`\\b${def.prefix}\\d*\\b`), `label prefix ${def.prefix}`);
  const names = Parts.all().map(def => [def.type, def.name.toLowerCase()]);
  const catalogue = p.split('\n').find(l => names.every(ns => ns.some(n => l.toLowerCase().includes(n))));
  assert.ok(catalogue, `no one line names every part: ${names.map(n => n[0]).join(', ')}`);
});

test('the prompt has value lines built from each ValueSpec', () => {
  const p = prompt();
  assert.match(p, /\bresistance\b[^\n]*1 Ω\s*[–-]\s*10 MΩ/, 'resistance range 1 Ω–10 MΩ');
  assert.match(p, /\bvoltage\b[^\n]*1 V\s*[–-]\s*24 V/, 'voltage range 1 V–24 V');
  assert.ok(lineWith(p, /\bcolou?r\b.*red.*yellow.*green.*blue.*white/), 'LED colour choices on one line');
});

// Issue #51: two circuits, two batteries, on separate rails.
test('the prompt puts a second battery on the bottom rails (bp_N/bn_N) with its parts in rows f–j', () => {
  const line = lineWith(prompt(), /second battery/i);
  assert.ok(line, 'no line about a second battery');
  assert.match(line, /\bbp_/);
  assert.match(line, /\bbn_/);
  assert.match(line, /\bf\s*[–-]\s*j\b/);
});

// Guard: the recipes, battery rules, wiring rules and board layout stay
// hand-written, word for word. (These lines are today's prompt.)
const VERBATIM = [
  `You are Sparky, a friendly AI electronics tutor. You help beginners build circuits on a virtual ${TOTAL_HOLES}-point breadboard.`,
  "BREADBOARD LAYOUT:",
  `- Columns 1-${COLS}. Rows a/b/c/d/e = top half. Rows f/g/h/i/j = bottom half.`,
  "- Same column + same half = electrically connected (e.g. a14 and e14 share a node).",
  "- The CENTER CHANNEL separates top from bottom. a14 and f14 are NOT connected unless you wire them.",
  "- tp_N = positive power rail at column N (+9V). tn_N = GND rail at column N.",
  "- Rails are NOT auto-connected to body holes. Always wire from tp/tn to body holes.",
  "- The board state lists parts by label, so you can talk about them as R1, LED1 and so on.",
  "- Only a battery pin can be a wire end by label: \"BAT1.0\" (+) or \"BAT1.1\" (-).",
  "- A new part gets the next free number for its type. After delete_all, numbering starts again at 1, so the first place_battery is BAT1.",
  "- Without delete_all, a battery added next to BAT1 is BAT2.",
  "BATTERY (CRITICAL):",
  "- BAT1.0 = positive (+), BAT1.1 = negative (-). The battery sits off-board.",
  "- EVERY circuit needs a battery with TWO wires:",
  "  1. add_wire from \"BAT1.0\" to \"tp_N\" (red wire)",
  "  2. add_wire from \"BAT1.1\" to \"tn_N\" (black wire)",
  "- Without BOTH battery wires the circuit WILL NOT WORK. ALWAYS include them.",
  "- Never wire BAT1.0 straight to BAT1.1, or tp to tn: that is a short circuit.",
  "- Battery wires go to the rails at the highest column, the end nearest the battery, so they drop straight in. In the recipes, N = the highest column in the board description (Columns 1-N).",
  "HOLE NAMES:",
  "- Body: \"a3\", \"e14\", \"j22\"",
  "- Rail: \"tp_5\" (positive col 5), \"tn_5\" (GND col 5)",
  "- Battery: \"BAT1.0\" (+), \"BAT1.1\" (-). This label form is only for battery pins.",
  "- Other parts: use the body holes they sit in, e.g. \"b3\", never \"<label>.<k>\".",
  "BUILDING BEHAVIOR:",
  "- When asked to build, fix, or create a circuit: call delete_all FIRST, then rebuild from scratch.",
  "- After building, write 2-3 sentences explaining what you built and how it works.",
  "- When you explain a build with more than one LED, say which topology you built: series, parallel, or separate branches.",
  "CRITICAL WIRING RULES:",
  "- Placing a component on the board does NOT connect it to power or ground.",
  "- You MUST add_wire from a power rail (tp_N) to each component that needs +9V.",
  "- You MUST add_wire from each component that needs GND to a ground rail (tn_N).",
  "- Without these rail-to-body wires, the circuit WILL NOT WORK.",
  "- A hole holds one lead. To connect to a part, use another hole in the same column and half.",
  "- Every hole, body or rail, takes at most one part lead or wire end. Spread leads across rows a-e of a column.",
  "- Rail wires land in row a, nearest the rails. Put parts in rows b–e, so no wire passes under or through a part.",
  "COMPLETE RECIPE FOR ONE LED (starting at column C):",
  "  1. delete_all",
  "  2. place_battery",
  "  3. add_wire: BAT1.0 -> tp_{N} (red)             ← battery to + rail at the highest column",
  "  4. add_wire: BAT1.1 -> tn_{N} (black)           ← battery to - rail at the highest column",
  "  5. place_resistor: holeA=b{C}, holeB=b{C+4}",
  "  6. place_led: holeA=c{C+6} (cathode), holeB=c{C+4} (anode)",
  "  7. add_wire: tp_{C+1} -> a{C} (red)             ← rail to the resistor's column, row a (REQUIRED!)",
  "  8. add_wire: a{C+6} -> tn_{C+6} (black)         ← LED cathode's column, row a, to rail (REQUIRED!)",
  "Steps 7 and 8 are REQUIRED for EVERY LED group. Without them the LED will not light up.",
  "At C=2: resistor b2-b6, LED cathode c8 and anode c6, wires tp_3 -> a2 and a8 -> tn_8. No hole is used twice, and no wire passes under a part.",
  "SERIES vs PARALLEL:",
  "- Parallel: the parts share BOTH nodes. Every LED's anode sits in the same column as the other anodes, and every cathode in the same column as the other cathodes, each in a free row. One resistor can feed them all.",
  "- Series: a chain with one current path. LED1's cathode column is LED2's anode column. Each red LED drops about 2 V, so two in series are dimmer, or need a lower resistor on a low-voltage battery.",
  "- \"Add a second LED in parallel\" means the parallel recipe below: the new LED goes across the same two columns, NOT a second resistor and its own rail wires.",
  "- Separate branches (each LED with its own resistor and rail wires) ONLY when the user asks for independent LEDs or one resistor each.",
  "RECIPE FOR 2 LEDs IN PARALLEL (one shared resistor, starting at column C):",
  "  Steps 1-8 of the one-LED recipe, then:",
  "  9. place_led: holeA=d{C+6} (cathode), holeB=d{C+4} (anode)   ← same two columns as LED1, free row d",
  "  Total calls: 9.",
  "RECIPE FOR 2 LEDs IN SERIES (one resistor, starting at column C):",
  "  1. delete_all",
  "  2. place_battery",
  "  3. add_wire: BAT1.0 -> tp_{N} (red)",
  "  4. add_wire: BAT1.1 -> tn_{N} (black)",
  "  5. place_resistor: holeA=b{C}, holeB=b{C+4}",
  "  6. place_led: holeA=c{C+6} (cathode), holeB=c{C+4} (anode)    ← LED1",
  "  7. place_led: holeA=d{C+8} (cathode), holeB=d{C+6} (anode)    ← LED2, anode in LED1's cathode column",
  "  8. add_wire: tp_{C+1} -> a{C} (red)",
  "  9. add_wire: a{C+8} -> tn_{C+8} (black)                       ← LED2 cathode's column, row a, to rail",
  "  Total calls: 9.",
  "SEPARATE BRANCHES, ONLY WHEN ASKED (e.g. \"3 LEDs, each with its own resistor\", at C=2, C=10, C=18):",
  `  Battery wires once: BAT1.0 -> tp_{N} (red) and BAT1.1 -> tn_{N} (black), tp_${COLS} and tn_${COLS} on a ${COLS}-column board.`,
  "  Each group is steps 5-8 of the one-LED recipe at its own C.",
  "  Total calls: 1 delete_all + 1 place_battery + 2 battery wires + 3*(place_resistor + place_led + 2 rail wires) = 16 calls.",
  "  Every LED group needs its own pair of rail-to-body wires: tp_{C+1}->a{C} and a{C+6}->tn_{C+6}.",
  "Reply style: 2-5 sentences max. Be specific with hole names. Be encouraging.",
  "For pure questions (no building), just respond with helpful text. Do not call any tools.",
];

test('the hand-written sections are still in the prompt, word for word', () => {
  const lines = prompt().split('\n');
  assert.deepEqual(VERBATIM.filter(l => !lines.includes(l)), [], 'lines changed or gone');
  assert.match(prompt(), /Every LED needs a resistor in series/);
});

// #27 D2, decided on the issue: one hand-written line may change. "- Never
// patch an existing circuit. Always clear and rebuild the full correct
// circuit." gets a narrow exception, kept in BUILDING BEHAVIOR next to it:
// to change one part's value or control ("make the resistor 1k", "make LED1
// green", "press the button") use set_value / set_control on its label, with
// no delete_all; to remove one part use delete_part. Anything that changes
// wiring or adds parts still clears and rebuilds.

// The BUILDING BEHAVIOR section's lines, up to the next blank line.
function buildingBehavior() {
  const lines = prompt().split('\n');
  const at = lines.indexOf('BUILDING BEHAVIOR:');
  assert.ok(at >= 0, 'the prompt has a BUILDING BEHAVIOR: section');
  const end = lines.findIndex((l, i) => i > at && l.trim() === '');
  return lines.slice(at + 1, end < 0 ? undefined : end);
}

test('BUILDING BEHAVIOR still says "Always clear and rebuild" for changes to wiring or parts', () => {
  const line = buildingBehavior().find(l => l.includes('Always clear and rebuild'));
  assert.ok(line, `no "Always clear and rebuild" line in BUILDING BEHAVIOR: ${JSON.stringify(buildingBehavior())}`);
  assert.match(line, /\bwir(e|es|ing)\b/i, `the rebuild rule should name wiring changes: "${line}"`);
  assert.match(line, /\badd(s|ing)?\b[^.]*\bparts?\b/i, `the rebuild rule should name adding parts: "${line}"`);
});

test('BUILDING BEHAVIOR tells the AI to change one part with set_value / set_control, e.g. "make the resistor 1k", with no delete_all', () => {
  const lines = buildingBehavior();
  const line = lines.find(l => /\bset_value\b/.test(l));
  assert.ok(line, `no BUILDING BEHAVIOR line names set_value: ${JSON.stringify(lines)}`);
  assert.match(line, /make the resistor 1k/i, `the set_value line should give the example "make the resistor 1k": "${line}"`);
  assert.match(line, /\bset_control\b/, `the same line names set_control: "${line}"`);
  assert.match(line, /\bdelete_all\b/, `the same line says not to call delete_all: "${line}"`);
});

test('BUILDING BEHAVIOR tells the AI to remove one part with delete_part', () => {
  const lines = buildingBehavior();
  assert.ok(lines.some(l => /\bdelete_part\b/.test(l) && /\bremov(e|es|ing)\b/i.test(l)),
    `no BUILDING BEHAVIOR line says to remove one part with delete_part: ${JSON.stringify(lines)}`);
});

// Issue #62 (QA AI-08): a series-LED reply must say the LEDs are dimmer or
// need a lower resistor. One added reply-style line, in BUILDING BEHAVIOR.
test('BUILDING BEHAVIOR tells the AI to say series LEDs are dimmer or need a lower resistor', () => {
  const lines = buildingBehavior();
  const line = lines.find(l => /\bseries\b/i.test(l) && /\bdimmer\b/i.test(l));
  assert.ok(line, `no BUILDING BEHAVIOR line says series LEDs are dimmer: ${JSON.stringify(lines)}`);
  assert.match(line, /lower resistor/i, `the series line should mention a lower resistor: "${line}"`);
  assert.match(line, /\breply\b|\bsay\b/i, `the series line should be about what the reply says: "${line}"`);
});

// #27 D1 fix: a real DeepSeek run placed a resistor b8→b12 and a buzzer
// b14→b16 and never joined columns 12 and 14. The buzzer's guide now gives
// the series layout, mirroring the one-LED recipe: resistor b{C}–b{C+4},
// buzzer c{C+4}/c{C+6}, so the resistor's second lead and the buzzer's first
// lead share column C+4 (at C=2: resistor b2–b6, buzzer c6/c8, wires
// tp_3 -> a2 and a8 -> tn_8).
const BUZZER_LAYOUT = ['resistor b{C}–b{C+4}', 'buzzer c{C+4}', 'c{C+6}'];

test("the buzzer's guide lays out resistor and buzzer in series, sharing a column", () => {
  const guide = Parts.get('buzzer').ai.guide;
  assert.equal(typeof guide, 'string', 'the buzzer needs an ai.guide');
  assert.deepEqual(BUZZER_LAYOUT.filter(s => !guide.includes(s)), [], `missing from the guide: ${guide}`);
  assert.match(guide, /\bshar(e|es|ing)\b[^.]*\bcolumn\b|\bsame column\b/i, `the guide should say the leads share a column: ${guide}`);
});

test('the prompt carries that buzzer layout on one line', () => {
  assert.ok(lineWith(prompt(), new RegExp(BUZZER_LAYOUT.map(s => s.replace(/[{}+]/g, '\\$&')).map(s => `(?=.*${s})`).join(''))),
    `no prompt line has all of: ${BUZZER_LAYOUT.join(' | ')}`);
});

// ── #52: a hand-written recipe for one button switching separate branches ──
// Real DeepSeek runs of "a red LED and a green LED in parallel, each with its
// own resistor, both switched on and off by one push button" improvised the
// layout and got it wrong about half the time. The prompt gets a worked
// recipe next to SEPARATE BRANCHES, at C=2, with every hole named (the issue's
// pinned layout, test/fixtures/recipes.js → BUTTON_BRANCHES):
//   button b2–b5 fed by tp_3 -> a2; a5 -> a8 feeds branch 1 (resistor b8–b12,
//   LED cathode c14 / anode c12, a14 -> tn_14); c5 -> a16 feeds branch 2
//   (resistor b16–b20, LED cathode c22 / anode c20, a22 -> tn_22).
// Its heading matches /RECIPE.*BUTTON.*BRANCH/i; the section runs to the next
// blank line. Steps use the recipes' own forms: "place_x: holeA=.., holeB=.."
// and "from -> to". The button's ai.guide points to the recipe.

function buttonBranchesRecipe() {
  const lines = prompt().split('\n');
  const at = lines.findIndex(l => /RECIPE.*BUTTON.*BRANCH/i.test(l));
  assert.ok(at >= 0, 'the prompt has no recipe heading for one button switching separate branches (/RECIPE.*BUTTON.*BRANCH/i)');
  const end = lines.findIndex((l, i) => i > at && l.trim() === '');
  return lines.slice(at, end < 0 ? undefined : end);
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BRANCH_PLACES = [
  ['place_button',   'b2',  'b5'],
  ['place_resistor', 'b8',  'b12'],
  ['place_led',      'c14', 'c12'],   // holeA = cathode, holeB = anode
  ['place_resistor', 'b16', 'b20'],
  ['place_led',      'c22', 'c20'],
];
const BRANCH_WIRES = [['tp_3', 'a2'], ['a5', 'a8'], ['a14', 'tn_14'], ['c5', 'a16'], ['a22', 'tn_22']];

test('the prompt has a recipe for one button switching separate branches, placing every part at its pinned holes (#52)', () => {
  const section = buttonBranchesRecipe();
  const missing = BRANCH_PLACES.filter(([tool, a, b]) => !section.some(l =>
    new RegExp(`\\b${tool}\\b`).test(l) && new RegExp(`holeA=${a}\\b`).test(l) && new RegExp(`holeB=${b}\\b`).test(l)));
  assert.deepEqual(missing.map(([t, a, b]) => `${t}: holeA=${a}, holeB=${b}`), [], `missing steps in:\n${section.join('\n')}`);
});

test('the button-branches recipe names every wire, including a5 -> a8 and c5 -> a16 from the button\'s output column (#52)', () => {
  const text = buttonBranchesRecipe().join('\n');
  const missing = BRANCH_WIRES.filter(([f, t]) => !new RegExp(`\\b${esc(f)}\\s*->\\s*${esc(t)}\\b`).test(text));
  assert.deepEqual(missing.map(([f, t]) => `${f} -> ${t}`), [], `missing wires in:\n${text}`);
  assert.match(text, /BAT1\.0\s*->\s*tp_(\{N\}|\d+)/, 'the recipe wires BAT1.0 to the + rail');
  assert.match(text, /BAT1\.1\s*->\s*tn_(\{N\}|\d+)/, 'the recipe wires BAT1.1 to the - rail');
});

test("the button's ai.guide points to the one-button branches recipe (#52)", () => {
  const guide = Parts.get('button').ai.guide;
  assert.equal(typeof guide, 'string', 'the button needs an ai.guide');
  assert.match(guide, /one button/i, `the guide should mention one button: ${guide}`);
  assert.match(guide, /branch/i, `the guide should mention branches: ${guide}`);
  assert.match(guide, /recipe/i, `the guide should point to the recipe: ${guide}`);
  assert.ok(prompt().includes(`- place_button: ${guide}`), 'the full prompt carries the button guide');
});

// ── Source check ────────────────────────────────────────────────────────────

test('server.js builds its tools from the registry, with no per-type tables left', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  assert.match(src, /require\(\s*['"]\.\.\/circuit3d\/js\/parts(\/index(\.js)?)?\/?['"]\s*\)/, 'server.js must require ../circuit3d/js/parts');
  for (const name of ['CONDUCTORS', 'PART_NAMES', 'LED_COLORS', 'checkPartValues']) {
    assert.doesNotMatch(src, new RegExp(`\\b${name}\\b`), `${name} is still in server.js`);
  }
  assert.doesNotMatch(src, /name:\s*['"]place_/, 'a hand-written place_ tool is still in server.js');
  assert.doesNotMatch(src, /['"]place_(resistor|led|buzzer|button)['"]/, 'a per-type place_ name is still in server.js code');
});

// ── The edit tools, issue #27 (D2) ──────────────────────────────────────────
// docs/API-CONTRACT.md → "AI tools", always sent:
//   set_value   { part: 'R1', <key>: value }
//   set_control { part: 'SW1', <key>: value }
//   delete_part { part: 'R1' }
// Their params are generated from the registry: `part` (a label, required),
// plus, for set_value, every value key the AI may set on some part (each
// part's ai.values, default all), typed as in that part's place_ tool; for
// set_control, every control key of some part (BOOLEAN for toggle and
// momentary, NUMBER for slider). Nothing but `part` is required.

const aiValueKeys = def => (def.ai && def.ai.values) || Object.keys(def.values || {});

test('set_value, set_control and delete_part are generated, valid tools', () => {
  for (const name of ['set_value', 'set_control', 'delete_part']) {
    const t = tool(name);
    checkDecl(t);
    assert.ok(t.parameters && t.parameters.properties.part, `${name} needs a "part" param`);
    assert.equal(t.parameters.properties.part.type, 'STRING', `${name}.part is a label, e.g. "R1"`);
    assert.deepEqual(t.parameters.required, ['part'], `${name}: only "part" is required`);
  }
});

test('delete_part takes only the part', () => {
  assert.deepEqual(Object.keys(tool('delete_part').parameters.properties), ['part']);
});

test("set_value offers every AI value key of every part, typed as in that part's place_ tool", () => {
  const props = tool('set_value').parameters.properties;
  const want = new Set(['part']);
  for (const def of Parts.all()) {
    const place = tool(toolName(def)).parameters;
    for (const key of aiValueKeys(def)) {
      want.add(key);
      assert.ok(props[key], `set_value has no "${key}" param (a ${def.type} value)`);
      assert.equal(props[key].type, place.properties[key].type, `set_value.${key} is typed as in ${toolName(def)}`);
    }
  }
  assert.deepEqual(Object.keys(props).sort(), [...want].sort(), 'set_value offers exactly part plus the AI value keys');
  assert.equal(props.resistance.type, 'NUMBER');
  assert.equal(props.voltage.type, 'NUMBER');
  const choices = Object.keys(Parts.get('led').values.color.choices);
  assert.deepEqual(choices.filter(c => !JSON.stringify(props.color).includes(c)), [], 'set_value.color names the LED colours');
  assert.equal(props.maxCurrent, undefined, "the LED's maxCurrent is not an AI value");
});

test('set_control offers every control key of every part: the button\'s pressed is a BOOLEAN', () => {
  const props = tool('set_control').parameters.properties;
  const want = new Set(['part']);
  for (const def of Parts.all()) {
    for (const [key, spec] of Object.entries(def.controls || {})) {
      want.add(key);
      assert.ok(props[key], `set_control has no "${key}" param (a ${def.type} control)`);
      assert.equal(props[key].type, spec.type === 'slider' ? 'NUMBER' : 'BOOLEAN', `set_control.${key}`);
    }
  }
  assert.deepEqual(Object.keys(props).sort(), [...want].sort());
  assert.equal(props.pressed.type, 'BOOLEAN');
});

test('finishAIReply passes set_value, set_control and delete_part through untouched', () => {
  const actions = [
    { tool: 'set_value',   part: 'R1',  resistance: 1000 },
    { tool: 'set_control', part: 'SW1', pressed: true },
    { tool: 'delete_part', part: 'LED1' },
  ];
  const out = Server.finishAIReply({ reply: 'Done.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions);
  assert.equal(out.reply, 'Done.');
});

// ── A new part needs no server.js change (last: changes the registry) ──────

describe('with 10 extra parts in the registry', () => {
  let S, gizmos;
  beforeAll(() => { ({ Server: S, gizmos } = withGizmos(10)); });

  test('each new part gets a valid place_ tool with holeA and holeB', () => {
    for (const g of gizmos) {
      const t = tool('place_' + g.type, S);
      checkDecl(t);
      assert.ok(t.parameters.properties.holeA && t.parameters.properties.holeB, t.name);
      assert.deepEqual([...t.parameters.required].sort(), ['holeA', 'holeB'], t.name);
    }
  });

  test('each new part gets its sizing line, label prefix and a place in the catalogue', () => {
    const p = promptOf(S);
    for (const g of gizmos) {
      assert.ok(lineWith(p, new RegExp(`place_${g.type}\\b.*\\b2–6 columns\\b.*\\b3 is typical\\b`)), `sizing line for ${g.type}`);
      assert.match(p, new RegExp(`\\b${g.prefix}\\d*\\b`), `label prefix ${g.prefix}`);
    }
    const all = Parts.all().map(def => [def.type, def.name.toLowerCase()]);
    assert.ok(p.split('\n').some(l => all.every(ns => ns.some(n => l.toLowerCase().includes(n)))),
      'no one catalogue line names every part, gizmos included');
  });
});
