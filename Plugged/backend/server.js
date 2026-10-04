/**
 * Sparky AI Backend — Node.js (zero npm dependencies, CommonJS)
 * Requires Node 18+
 *
 * Run from backend/:  node server.js
 *
 * POST /api/ask            { markdown, message, history }  →  { reply, actions[] }
 * GET  /api/health
 * GET  anything else       the app's static files
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { makeAsk } = require('./ai-providers');
// The board's size: the same file the 3D editor builds the board from.
const { COLS, TOTAL_HOLES, BODY_ROWS } = require('../circuit3d/js/board-geometry.js');
// The parts registry: every part's tool, prompt lines and circuit behaviour.
const Parts = require('../circuit3d/js/parts');

// ── Load .env ─────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    raw.split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq < 1) return;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    });
  } catch { /* .env optional */ }
}
loadEnv();

const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PORT         = process.env.PORT || 5001;

const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
if (AI_PROVIDER === 'gemini' && !GEMINI_KEY) {
  console.warn('Warning: GEMINI_API_KEY not set — /api/ask will fail');
}
if (AI_PROVIDER === 'deepseek' && !process.env.DEEPSEEK_API_KEY) {
  console.warn('Warning: DEEPSEEK_API_KEY not set — /api/ask will fail');
}

// The model name shown by /api/health and at startup.
const MODEL_NAME = AI_PROVIDER === 'deepseek' ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash')
                 : AI_PROVIDER === 'gemini'   ? GEMINI_MODEL
                 : AI_PROVIDER;

// ── System prompt ────────────────────────────────────────────
// The recipes, battery rules, wiring rules and board layout are hand-written.
// The part lists (GENERATED, below) come from the registry: labels, the
// catalogue, pin roles, sizing, values, and the guides of the tools sent.
const guideLines = tools => tools.map(t => PART_BY_TOOL.get(t.name)).filter(def => def && def.ai.guide)
  .map(def => `- ${toolName(def)}: ${def.ai.guide}`);

// The prompt for a request that sends `tools`: only their guides go in.
const buildPrompt = tools => [
  `You are Sparky, a friendly AI electronics tutor. You help beginners build circuits on a virtual ${TOTAL_HOLES}-point breadboard.`,
  '',
  'BREADBOARD LAYOUT:',
  `- Columns 1-${COLS}. Rows a/b/c/d/e = top half. Rows f/g/h/i/j = bottom half.`,
  '- Same column + same half = electrically connected (e.g. a14 and e14 share a node).',
  '- The CENTER CHANNEL separates top from bottom. a14 and f14 are NOT connected unless you wire them.',
  '- tp_N = positive power rail at column N (+9V). tn_N = GND rail at column N.',
  '- Rails are NOT auto-connected to body holes. Always wire from tp/tn to body holes.',
  '',
  'PARTS:',
  GENERATED.catalogue,
  '- If a part\'s place_ tool is not in your tools, call use_parts with its type first.',
  '',
  'PART LABELS:',
  GENERATED.labels,
  '- The board state lists parts by label, so you can talk about them as R1, LED1 and so on.',
  '- Only a battery pin can be a wire end by label: "BAT1.0" (+) or "BAT1.1" (-).',
  GENERATED.wiredBy,
  '- A new part gets the next free number for its type. After delete_all, numbering starts again at 1, so the first place_battery is BAT1.',
  '- Without delete_all, a battery added next to BAT1 is BAT2.',
  '',
  'BATTERY (CRITICAL):',
  '- BAT1.0 = positive (+), BAT1.1 = negative (-). The battery sits off-board.',
  '- EVERY circuit needs a battery with TWO wires:',
  '  1. add_wire from "BAT1.0" to "tp_N" (red wire)',
  '  2. add_wire from "BAT1.1" to "tn_N" (black wire)',
  '- Without BOTH battery wires the circuit WILL NOT WORK. ALWAYS include them.',
  '- Never wire BAT1.0 straight to BAT1.1, or tp to tn: that is a short circuit.',
  '- Battery wires go to the rails at the highest column, the end nearest the battery, so they drop straight in. In the recipes, N = the highest column in the board description (Columns 1-N).',
  '- A second battery (two separate circuits) goes on the bottom rails, bp_N (+) and bn_N (GND), nearest row j: BAT2.0 -> bp_{N} (red) and BAT2.1 -> bn_{N} (black). Its parts go in rows f–j, with its rail wires in row j. Never wire a second battery to the tp/tn rails.',
  '',
  'COMPONENT RULES:',
  ...GENERATED.pinRoles,
  ...guideLines(tools),
  '- When the user names a value, pass it: "a 1 kΩ resistor" → place_resistor with resistance: 1000 (ohms), "a green LED" → place_led with color: "green", "a 5 V battery" → place_battery with voltage: 5. Leave it out otherwise.',
  '',
  'PART VALUES (a plain number in the unit shown, or one of the names):',
  ...GENERATED.values,
  '',
  'SIZING (columns apart, same row):',
  ...GENERATED.sizing,
  '- No column overlap between components on the same row.',
  '',
  'HOLE NAMES:',
  '- Body: "a3", "e14", "j22"',
  '- Rail: "tp_5" (positive col 5), "tn_5" (GND col 5)',
  '- Battery: "BAT1.0" (+), "BAT1.1" (-). This label form is only for battery pins.',
  '- Other parts: use the body holes they sit in, e.g. "b3", never "<label>.<k>".',
  '',
  'BUILDING BEHAVIOR:',
  '- When asked to build, fix, or create a circuit: call delete_all FIRST, then rebuild from scratch.',
  '- To change one part\'s value or control ("make the resistor 1k", "make LED1 green", "press the button"), call set_value or set_control on its label, with no delete_all.',
  '- To remove one part, call delete_part on its label.',
  '- Anything that changes wiring or adds parts: never patch. Always clear and rebuild the full correct circuit.',
  '- After building, write 2-3 sentences explaining what you built and how it works.',
  '- When you explain a build with more than one LED, say which topology you built: series, parallel, or separate branches.',
  '- When you build LEDs in series, say in your reply that they are dimmer than one LED alone, or need a lower resistor.',
  '',
  'CRITICAL WIRING RULES:',
  '- Placing a component on the board does NOT connect it to power or ground.',
  '- You MUST add_wire from a power rail (tp_N) to each component that needs +9V.',
  '- You MUST add_wire from each component that needs GND to a ground rail (tn_N).',
  '- Without these rail-to-body wires, the circuit WILL NOT WORK.',
  '- A hole holds one lead. To connect to a part, use another hole in the same column and half.',
  '- Every hole, body or rail, takes at most one part lead or wire end. Spread leads across rows a-e of a column.',
  '- Rail wires land in row a, nearest the rails. Put parts in rows b–e, so no wire passes under or through a part.',
  '',
  'COMPLETE RECIPE FOR ONE LED (starting at column C):',
  '  1. delete_all',
  '  2. place_battery',
  '  3. add_wire: BAT1.0 -> tp_{N} (red)             ← battery to + rail at the highest column',
  '  4. add_wire: BAT1.1 -> tn_{N} (black)           ← battery to - rail at the highest column',
  '  5. place_resistor: holeA=b{C}, holeB=b{C+4}',
  '  6. place_led: holeA=c{C+6} (cathode), holeB=c{C+4} (anode)',
  '  7. add_wire: tp_{C+1} -> a{C} (red)             ← rail to the resistor\'s column, row a (REQUIRED!)',
  '  8. add_wire: a{C+6} -> tn_{C+6} (black)         ← LED cathode\'s column, row a, to rail (REQUIRED!)',
  'Steps 7 and 8 are REQUIRED for EVERY LED group. Without them the LED will not light up.',
  'At C=2: resistor b2-b6, LED cathode c8 and anode c6, wires tp_3 -> a2 and a8 -> tn_8. No hole is used twice, and no wire passes under a part.',
  '',
  'SERIES vs PARALLEL:',
  '- Parallel: the parts share BOTH nodes. Every LED\'s anode sits in the same column as the other anodes, and every cathode in the same column as the other cathodes, each in a free row. One resistor can feed them all.',
  '- Series: a chain with one current path. LED1\'s cathode column is LED2\'s anode column. Each red LED drops about 2 V, so two in series are dimmer, or need a lower resistor on a low-voltage battery.',
  '- "Add a second LED in parallel" means the parallel recipe below: the new LED goes across the same two columns, NOT a second resistor and its own rail wires.',
  '- Separate branches (each LED with its own resistor and rail wires) ONLY when the user asks for independent LEDs or one resistor each.',
  '',
  'RECIPE FOR 2 LEDs IN PARALLEL (one shared resistor, starting at column C):',
  '  Steps 1-8 of the one-LED recipe, then:',
  '  9. place_led: holeA=d{C+6} (cathode), holeB=d{C+4} (anode)   ← same two columns as LED1, free row d',
  '  Total calls: 9.',
  '',
  'RECIPE FOR 2 LEDs IN SERIES (one resistor, starting at column C):',
  '  1. delete_all',
  '  2. place_battery',
  '  3. add_wire: BAT1.0 -> tp_{N} (red)',
  '  4. add_wire: BAT1.1 -> tn_{N} (black)',
  '  5. place_resistor: holeA=b{C}, holeB=b{C+4}',
  '  6. place_led: holeA=c{C+6} (cathode), holeB=c{C+4} (anode)    ← LED1',
  '  7. place_led: holeA=d{C+8} (cathode), holeB=d{C+6} (anode)    ← LED2, anode in LED1\'s cathode column',
  '  8. add_wire: tp_{C+1} -> a{C} (red)',
  '  9. add_wire: a{C+8} -> tn_{C+8} (black)                       ← LED2 cathode\'s column, row a, to rail',
  '  Total calls: 9.',
  '',
  'SEPARATE BRANCHES, ONLY WHEN ASKED (e.g. "3 LEDs, each with its own resistor", at C=2, C=10, C=18):',
  `  Battery wires once: BAT1.0 -> tp_{N} (red) and BAT1.1 -> tn_{N} (black), tp_${COLS} and tn_${COLS} on a ${COLS}-column board.`,
  '  Each group is steps 5-8 of the one-LED recipe at its own C.',
  '  Total calls: 1 delete_all + 1 place_battery + 2 battery wires + 3*(place_resistor + place_led + 2 rail wires) = 16 calls.',
  '  Every LED group needs its own pair of rail-to-body wires: tp_{C+1}->a{C} and a{C+6}->tn_{C+6}.',
  '',
  'RECIPE FOR ONE BUTTON SWITCHING SEPARATE BRANCHES (e.g. "a red and a green LED, each with its own resistor, both switched by one button", at C=2):',
  '  1. delete_all',
  '  2. place_battery',
  '  3. add_wire: BAT1.0 -> tp_{N} (red)',
  '  4. add_wire: BAT1.1 -> tn_{N} (black)',
  '  5. place_button: holeA=b2, holeB=b5',
  '  6. add_wire: tp_3 -> a2 (red)                      ← + rail into the button\'s input column',
  '  7. add_wire: a5 -> a8                              ← button output column to branch 1',
  '  8. place_resistor: holeA=b8, holeB=b12',
  '  9. place_led: holeA=c14 (cathode), holeB=c12 (anode)',
  '  10. add_wire: a14 -> tn_14 (black)',
  '  11. add_wire: c5 -> a16                            ← a second hole in the button\'s output column to branch 2',
  '  12. place_resistor: holeA=b16, holeB=b20',
  '  13. place_led: holeA=c22 (cathode), holeB=c20 (anode)',
  '  14. add_wire: a22 -> tn_22 (black)',
  '  More branches: repeat steps 11-14 at the next C (+8 columns), feeding each from another free hole (d5, e5) in column 5.',
  '',
  'Reply style: 2-5 sentences max. Be specific with hole names. Be encouraging.',
  'For pure questions (no building), just respond with helpful text. Do not call any tools.',
].join('\n');

// ── Tools, generated from the parts registry ─────────────────
// One place_<type> tool per part (its ai.tool when it sets one), plus the
// tools that aren't parts. docs/API-CONTRACT.md → "AI tools". Built once at
// startup from Parts.all(), so a new part file needs no change here.
const PARTS = Parts.all();
const toolName = def => (def.ai && def.ai.tool) || `place_${def.type}`;

// "resistor", "LED", "push button": a part's name inside a sentence.
const partName = def => def.name.split(' ').map(w => (/^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');

// The value keys the AI may set (its tool params): ai.values, or all of them.
const aiValues = def => (def.ai.values || Object.keys(def.values || {})).filter(k => def.values && def.values[k]);

// A part's elements at its defaults. Only their kinds and pins are read here,
// so the values don't matter.
const elementCache = new Map();
function elementsOf(def) {
  if (elementCache.has(def)) return elementCache.get(def);
  const values = {}, controls = {};
  for (const [k, spec] of Object.entries(def.values || {})) {
    values[k] = spec.default;
    if (spec.choices && spec.choices[spec.default]) Object.assign(values, spec.choices[spec.default]);
  }
  for (const [k, c] of Object.entries(def.controls || {})) controls[k] = c.default;
  let els = [];
  try { els = def.elements(values, controls) || []; } catch { els = []; }
  elementCache.set(def, els);
  return els;
}

const UNIT_WORDS = { 'Ω': 'ohms', V: 'volts', A: 'amps', F: 'farads', H: 'henries', '%': 'percent', '°C': 'degrees C', lux: 'lux' };
const rangeOf = spec => `${Parts.withUnit(spec.min, spec.unit)}–${Parts.withUnit(spec.max, spec.unit)}`;
const spanText = s => (s.min === s.max ? `exactly ${s.min}` : `${s.min}–${s.max}`);

function valueParam(key, spec) {
  if (spec.choices) {
    const names = Object.keys(spec.choices);
    return { type: 'STRING', enum: names, description: `Optional. ${key}: ${names.join(', ')}. Only when the user names one.` };
  }
  return { type: 'NUMBER', description: `Optional. ${key} in ${UNIT_WORDS[spec.unit] || spec.unit}, ${rangeOf(spec)}. Only when the user names one.` };
}

function partTool(def) {
  const props = {}, required = [];
  if (def.place.kind === 'span') {
    const s = def.place.span;
    props.holeA = { type: 'STRING', description: `Hole for the ${def.pins[0]} pin, e.g. "b3"` };
    props.holeB = { type: 'STRING', description: `Hole for the ${def.pins[1]} pin, ${spanText(s)} columns from holeA on the same row, e.g. "b${3 + s.default}"` };
    required.push('holeA', 'holeB');
  } else if (def.place.kind === 'footprint') {
    props.hole      = { type: 'STRING', description: `Hole for the ${def.pins[0]} pin, e.g. "e10"` };
    props.direction = { type: 'STRING', enum: ['right', 'left', 'up', 'down'], description: 'Which way the part runs from hole' };
    required.push('hole', 'direction');
  }
  const ranges = [];
  for (const key of aiValues(def)) {
    const spec = def.values[key];
    props[key] = valueParam(key, spec);
    if (!spec.choices) ranges.push(`${key} ${rangeOf(spec)}${spec.series ? ` (${spec.series} kit values)` : ''}`);
  }
  const decl = { name: toolName(def), description: def.ai.about + (ranges.length ? ` ${ranges.join('; ')}.` : '') };
  if (Object.keys(props).length) {
    decl.parameters = { type: 'OBJECT', properties: props };
    if (required.length) decl.parameters.required = required;
  }
  return decl;
}

const DELETE_ALL = {
  name: 'delete_all',
  description: 'Clear all components and wires from the board. Call this FIRST when building or fixing a circuit.',
};
const ADD_WIRE = {
  name: 'add_wire',
  description: 'Add a wire between two points. Points can be body holes (e.g. "a3"), rails (e.g. "tp_5", "tn_5"), or battery pins by label ("BAT1.0" for battery +, "BAT1.1" for battery -). Other parts are wired through the body holes they sit in.',
  parameters: {
    type: 'OBJECT',
    properties: {
      from:  { type: 'STRING', description: 'Start point' },
      to:    { type: 'STRING', description: 'End point' },
      color: { type: 'STRING', description: 'Wire color: red, yellow, green, blue, black, or white' },
    },
    required: ['from', 'to', 'color'],
  },
};
const USE_PARTS = {
  name: 'use_parts',
  description: 'Ask for the place_ tools of parts you need but do not have yet. Pass their part types from the part list; the tools are added for your next call.',
  parameters: {
    type: 'OBJECT',
    properties: {
      types: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Part types, e.g. ["led"]' },
    },
    required: ['types'],
  },
};

// The edit tools change a part already on the board, found by its label.
// Their params are every part's AI values (typed as in its place_ tool) or
// every part's controls; only `part` is required.
const PART_PARAM = { type: 'STRING', description: 'The part\'s label from the Components table, e.g. "R1"' };
function editTool(name, description, params) {
  return { name, description, parameters: { type: 'OBJECT', properties: { part: PART_PARAM, ...params }, required: ['part'] } };
}
const whose = key => PARTS.filter(d => d.values && aiValues(d).includes(key)).map(partName).join(', ');
const valueParams = {};
for (const def of PARTS) {
  for (const key of aiValues(def)) {
    const p = valueParam(key, def.values[key]);
    const had = valueParams[key];
    if (had && had.enum && p.enum) had.enum = [...new Set([...had.enum, ...p.enum])];
    if (had) continue;
    valueParams[key] = { ...p, description: `New ${key} (${whose(key)}). ${p.description.replace(/^Optional\. /, '').replace(/ Only when the user names one\.$/, '')}` };
  }
}
const controlParams = {};
for (const def of PARTS) {
  for (const [key, c] of Object.entries(def.controls || {})) {
    if (controlParams[key]) continue;
    controlParams[key] = c.type === 'slider'
      ? { type: 'NUMBER', description: `${key}, ${c.min}–${c.max}${c.unit ? ' ' + c.unit : ''}` }
      : { type: 'BOOLEAN', description: `${key}: true or false` };
  }
}
const SET_VALUE = editTool('set_value',
  'Change a value of one part already on the board, e.g. "make the resistor 1k" → part: "R1", resistance: 1000. Pass only the values that change; the part keeps its holes and wires.',
  valueParams);
const SET_CONTROL = editTool('set_control',
  'Set a control of one part already on the board, e.g. press a button: part: "SW1", pressed: true.',
  controlParams);
const DELETE_PART = editTool('delete_part',
  'Remove one part from the board by its label, with the wires on its pins. The rest of the circuit stays.',
  {});

// Every tool, in Gemini's shape. The providers that send their tools once
// (Gemini, claude) send all of them.
const CIRCUIT_TOOLS = [{ function_declarations: [DELETE_ALL, ...PARTS.map(partTool), ADD_WIRE, USE_PARTS,
                                                 SET_VALUE, SET_CONTROL, DELETE_PART] }];
const TOOL_BY_NAME  = new Map(CIRCUIT_TOOLS[0].function_declarations.map(d => [d.name, d]));
const PART_BY_TOOL  = new Map(PARTS.map(def => [toolName(def), def]));

// ── Tool selection (DeepSeek, per request) ───────────────────
const BATTERY_TOOL = 'place_battery';
const ALWAYS_SENT  = ['delete_all', 'add_wire', BATTERY_TOOL, 'use_parts', 'set_value', 'set_control', 'delete_part'];
const EVERYDAY     = PARTS.filter(def => def.ai.everyday);   // sent when nothing else matched
const MAX_TOOLS    = 12;

// The other tools a tool's part guide names, e.g. the LED's "(place_resistor)".
function relatedTools(decl) {
  const def = PART_BY_TOOL.get(decl.name);
  const guide = def && def.ai.guide;
  if (!guide) return [];
  return [...guide.matchAll(/[a-z][a-z0-9_]*/g)].map(m => TOOL_BY_NAME.get(m[0])).filter(d => d && d !== decl);
}

// A keyword as a whole word, any case, with a simple plural "s".
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namedIn = (def, text) => def.ai.keywords.some(k => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}s?(?![a-z0-9])`).test(text));

// The tools one request sends, in order: the always-sent tools, the tools of
// the parts on the board, keyword matches, and the everyday set when nothing
// else matched. Each tool brings the tools its guide names. At most 12.
function selectTools(message, boardTypes) {
  const out = [];
  const add = decl => {
    if (!decl || out.includes(decl)) return;
    out.push(decl);
    relatedTools(decl).forEach(add);
  };
  const partDecl = def => def && TOOL_BY_NAME.get(toolName(def));

  ALWAYS_SENT.forEach(n => add(TOOL_BY_NAME.get(n)));
  const before = out.length;
  for (const t of boardTypes || []) add(partDecl(Parts.get(String(t))));
  const text = String(message || '').toLowerCase();
  for (const def of PARTS) if (namedIn(def, text)) add(partDecl(def));
  if (out.length === before) EVERYDAY.forEach(def => add(partDecl(def)));
  return out.slice(0, MAX_TOOLS);
}

// The part types in the board markdown's Components table ("| BZ1 | buzzer | ...").
function boardTypes(markdown) {
  const lines = String(markdown || '').split('\n');
  const start = lines.findIndex(l => /^##\s*Components\b/i.test(l.trim()));
  if (start < 0) return [];
  const types = [];
  let col = -1;
  for (const line of lines.slice(start + 1)) {
    const l = line.trim();
    if (l.startsWith('#')) break;
    if (!l.startsWith('|')) continue;
    const cells = l.split('|').slice(1, -1).map(c => c.trim());
    if (col < 0) { col = cells.findIndex(c => c.toLowerCase() === 'type'); continue; }
    if (cells.every(c => /^:?-+:?$/.test(c))) continue;
    if (cells[col]) types.push(cells[col].toLowerCase());
  }
  return types;
}

// use_parts: the tools for those types (and the tools their guides name)
// that the model doesn't have yet, and the tool result that says so.
function partTools(types, sentNames) {
  const added = [], unknown = [];
  for (const t of Array.isArray(types) ? types : [types]) {
    const def = Parts.get(String(t).toLowerCase());
    const decl = def && TOOL_BY_NAME.get(toolName(def));
    if (!decl) { unknown.push(JSON.stringify(t)); continue; }
    for (const d of [decl, ...relatedTools(decl)]) {
      if (!sentNames.includes(d.name) && !added.includes(d)) added.push(d);
    }
  }
  const said = [added.length ? `Added ${added.map(d => d.name).join(', ')}. You can call them now.` : 'You already have those tools.'];
  for (const d of added) {
    const def = PART_BY_TOOL.get(d.name);
    if (def && def.ai.guide) said.push(`${d.name}: ${def.ai.guide}`);
  }
  if (unknown.length) said.push(`No part type ${unknown.join(', ')}. Part types: ${PARTS.map(d => d.type).join(', ')}.`);
  return { added, text: said.join(' ') };
}


// ── Generated prompt sections ────────────────────────────────
const onBoard = PARTS.filter(def => def.place.kind !== 'offboard');

// Pin roles matter for a part whose elements have a direction (a diode, a
// source), e.g. "place_led: holeA = cathode, holeB = anode".
function directional(def) {
  return elementsOf(def).some(el => !['R', 'SW'].includes(el.kind));
}

const GENERATED = {
  labels:     `- Every part has a label that never changes: its prefix and a number, e.g. R1, R2. Prefixes: ${PARTS.map(d => `${d.prefix} = ${partName(d)}`).join(', ')}.`,
  wiredBy:    `- Parts on the board (${onBoard.map(d => d.prefix).join(', ')}) are wired through the breadboard holes they sit in, which the Components table lists. Never use "R1.0" or "LED1.1" as a wire end.`,
  catalogue:  `- Every part (type: name): ${PARTS.map(d => `${d.type}: ${d.name}`).join(', ')}.`,
  pinRoles:   onBoard.filter(d => d.place.kind === 'span' && directional(d))
                .map(d => `- ${toolName(d)}: holeA = ${d.pins[0]}, holeB = ${d.pins[1]}`),
  sizing:     onBoard.filter(d => d.place.kind === 'span').map(d => {
                const s = d.place.span;
                return `- ${toolName(d)}: ${spanText(s)} columns apart on one row${s.min === s.max ? '' : ` (${s.default} is typical)`}`;
              }),
  values:     PARTS.flatMap(d => aiValues(d).map(key => {
                const spec = d.values[key];
                return spec.choices
                  ? `- ${toolName(d)} ${key}: ${Object.keys(spec.choices).join(', ')} (default ${spec.default})`
                  : `- ${toolName(d)} ${key}: ${rangeOf(spec)}, in ${UNIT_WORDS[spec.unit] || spec.unit} (default ${Parts.withUnit(spec.default, spec.unit)})`;
              })),
};

// ── Placement: Parts.checkPlacement on the actions so far ────
// Each place_* is checked against a hole map built from the actions before
// it (since the last delete_all). A refused part holds no holes.
const BOARD = { cols: COLS, bodyRows: BODY_ROWS };
const HOLE  = /^(?:(tp|tn|bp|bn)_(-?\d+)|([a-j])(-?\d+))$/i;

// A leg in the shape checkPlacement reads: { pin, col (0-based), row, hole }.
// Anything that isn't a hole name gets row '', which checkPlacement refuses.
function legAt(pin, hole) {
  const m = HOLE.exec(String(hole == null ? '' : hole).trim());
  if (!m) return { pin, col: 0, row: '', hole: String(hole) };
  const row = (m[1] || m[3]).toLowerCase(), n = +(m[2] || m[4]);
  return { pin, col: n - 1, row, hole: m[1] ? `${row}_${n}` : `${row}${n}` };
}
const spanLegs = (def, a) => [legAt(def.pins[0], a.holeA), legAt(def.pins[1], a.holeB)];

// A footprint part's direction as its rotation (docs/API-CONTRACT.md → AI tools).
const ROTATION = { right: 0, down: 90, left: 180, up: 270 };

// A footprint action's legs from { hole, direction } (Parts.footprintLegs),
// as { legs }, or { why } it has none.
function footprintLegsOf(def, a) {
  const dir = String(a.direction == null ? '' : a.direction).toLowerCase();
  if (!(dir in ROTATION)) return { why: `direction must be right, left, up or down; got ${JSON.stringify(a.direction)}.` };
  if (!def.place.rotations.includes(ROTATION[dir])) {
    const can = Object.keys(ROTATION).filter(d => def.place.rotations.includes(ROTATION[d]));
    return { why: `the ${partName(def)} can't face ${dir}; use ${can.join(' or ')}.` };
  }
  const legs = Parts.footprintLegs(def.type, String(a.hole == null ? '' : a.hole).trim(), ROTATION[dir]);
  return legs ? { legs } : { why: `${JSON.stringify(a.hole)} is not a body hole (a1–j${COLS}).` };
}

// Where an action's part sits, for messages: "b3/b7", or "e20" for a footprint part.
const placedAt = (def, a) => (def.place.kind === 'footprint' ? String(a.hole) : `${a.holeA}/${a.holeB}`);

// An action's legs that sit in holes: a span part's, or a footprint part's
// on the board. [] for anything else.
function actionLegs(def, a) {
  if (!def) return [];
  if (def.place.kind === 'span') return spanLegs(def, a).filter(l => l.row);
  if (def.place.kind === 'footprint') return (footprintLegsOf(def, a).legs || []).filter(l => l.hole && l.col < COLS);
  return [];
}

// The hole map and the label counts after `prior`. Labels are only known
// after a delete_all in the same reply; before one, the board may already
// hold parts, so a part is "the resistor" instead of a guessed R1.
function boardSoFar(prior) {
  let map = new Map(), counts = {}, cleared = false;
  (prior || []).forEach((a, i) => {
    if (!a) return;
    if (a.tool === 'delete_all') { map = new Map(); counts = {}; cleared = true; return; }
    if (a.tool === 'add_wire') {
      for (const [end, h] of [['from', a.from], ['to', a.to]]) {
        const leg = legAt(null, h);
        if (leg.row && !map.has(leg.hole)) map.set(leg.hole, { wire: i, end });
      }
      return;
    }
    const def = PART_BY_TOOL.get(a.tool);
    if (!def) return;
    counts[def.prefix] = (counts[def.prefix] || 0) + 1;
    const label = cleared ? def.prefix + counts[def.prefix] : `the ${partName(def)}`;
    for (const leg of actionLegs(def, a)) if (!map.has(leg.hole)) map.set(leg.hole, { label, pin: leg.pin });
  });
  return { map, counts, cleared };
}

// Why this action can't be placed after `prior`, or null if it can. The
// reason is Parts.checkPlacement's, e.g. "R1 not placed: a resistor's leads
// must be 3–5 columns apart; b2 to b32 is 30."
function placementRefusal(a, prior) {
  const def = a && PART_BY_TOOL.get(a.tool);
  if (!def || def.place.kind === 'offboard') return null;
  const { map, counts, cleared } = boardSoFar(prior);
  const who = cleared ? def.prefix + ((counts[def.prefix] || 0) + 1) : `The ${partName(def)} at ${placedAt(def, a)}`;
  let legs;
  if (def.place.kind === 'span') {
    if (!a.holeA || !a.holeB) return `${who} not placed: it needs both holeA and holeB.`;
    legs = spanLegs(def, a);
  } else {
    if (!a.hole || !a.direction) return `${who} not placed: it needs a hole and a direction.`;
    const f = footprintLegsOf(def, a);
    if (!f.legs) return `${who} not placed: ${f.why}`;
    legs = f.legs;
  }
  const check = Parts.checkPlacement(def.type, legs, map, BOARD);
  return check.ok ? null : `${who} not placed: ${check.reason}`;
}

// ── Part values: Parts.checkValue ────────────────────────────
// Drops a value the board can't use from its action, keeping the part at its
// default, with a note. A kit hint (350 Ω → 330 Ω) keeps the value and adds a
// note. A null or missing value is not a value, so it goes without a note.
// Choice names match without regard to case ("Green" → "green").
function checkValues(a) {
  const notes = [];
  const def = a && PART_BY_TOOL.get(a.tool);
  if (!def || !def.values) return { action: a, notes };
  const shown = v => (typeof v === 'string' ? `"${v}"` : String(v));
  const part = `the ${partName(def)}${def.place.kind !== 'offboard' ? ` at ${placedAt(def, a)}` : ''}`;
  for (const [key, spec] of Object.entries(def.values)) {
    if (!(key in a)) continue;
    const { [key]: raw, ...rest } = a;
    if (raw == null) { a = rest; continue; }
    const v = spec.choices && typeof raw === 'string'
      ? (Object.keys(spec.choices).find(c => c.toLowerCase() === raw.toLowerCase()) || raw) : raw;
    const check = Parts.checkValue(def.type, key, v);
    if (!check.ok) {
      notes.push(`The ${key} ${shown(raw)} isn't a usable value (${check.reason}), so ${part} uses the default ${key}.`);
      a = rest;
      continue;
    }
    if (v !== raw) a = { ...a, [key]: v };
    if (check.hint) notes.push(`${part[0].toUpperCase()}${part.slice(1)} keeps ${key} ${shown(v)} (${check.hint}).`);
  }
  return { action: a, notes };
}

// ── Validate actions ─ report problems, never rewrite ────────
// Reports what is wrong with the proposed circuit and returns the actions
// untouched. Patching them silently hides the model's mistake and can turn a
// backwards LED into a guaranteed-dead one, or short past a component the
// model deliberately put in series.

// The old form of a battery pin, "battery_0_pin1".
const OLD_BATTERY_PIN = /^battery_(\d+)_pin(\d+)$/i;

// A battery pin in either form, as { n, pin } with n counting from 0:
// "battery_0_pin1" and "BAT1.1" are both { n: 0, pin: 1 }. The i-th
// place_battery in a build is battery_<i> and BAT<i+1>.
function batteryPin(ref) {
  const s = String(ref);
  let m = OLD_BATTERY_PIN.exec(s);
  if (m) return { n: +m[1], pin: +m[2] };
  m = /^bat(\d+)\.(\d+)$/i.exec(s);
  return m && +m[1] > 0 ? { n: +m[1] - 1, pin: +m[2] } : null;
}

// Holes in the same column and same half share a node. Each power rail is one
// node along its whole length. Both forms of a battery pin are one node.
function nodeKey(hole) {
  if (!hole) return null;
  const rail = /^(tp|tn|bp|bn)_\d+$/.exec(hole);
  if (rail) return rail[1];
  const body = /^([a-j])(\d+)$/i.exec(hole);
  if (body) return (body[1].toLowerCase() <= 'e' ? 'top' : 'bot') + body[2];
  const bat = batteryPin(hole);
  if (bat) return `battery_${bat.n}_pin${bat.pin}`;
  return hole;   // other part pins and anything unrecognised stay as themselves
}

// A breadboard hole takes one lead. Names each body hole (a-j) that holds
// more than one part lead or wire end, and what is in it. Rails are one net
// each and are left alone. Counts start again at each delete_all.
function findStackedHoles(actions) {
  let used = new Map();
  const put = (hole, what) => {
    const h = String(hole).toLowerCase();
    if (!/^[a-j]\d+$/.test(h)) return;
    if (!used.has(h)) used.set(h, []);
    used.get(h).push(what);
  };
  for (const a of actions) {
    const def = PART_BY_TOOL.get(a.tool);
    if (a.tool === 'delete_all') used = new Map();
    else if (def && def.place.kind === 'span') { put(a.holeA, partName(def)); put(a.holeB, partName(def)); }
    else if (def && def.place.kind === 'footprint') for (const leg of actionLegs(def, a)) put(leg.hole, partName(def));
    else if (a.tool === 'add_wire') { put(a.from, 'wire'); put(a.to, 'wire'); }
  }
  const problems = [];
  for (const [h, list] of used) {
    if (list.length < 2) continue;
    // "the resistor", "a wire", "2 LEDs"
    const what = [...new Set(list)].map(k => {
      const n = list.filter(x => x === k).length;
      return n > 1 ? `${n} ${k}s` : (k === 'wire' ? 'a wire' : `the ${k}`);
    });
    const said = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0];
    problems.push(`Hole ${h} holds ${list.length} leads (${said}). A hole takes one lead; use another hole in the same column.`);
  }
  return problems;
}

// Problems name battery pins in label form (BAT1.0), matching the board and
// the prompt, unless the AI itself wrote the old form (battery_0_pin0).
// finishAIReply decides that from the reply as sent, before malformed
// actions are dropped.
//
// The graph comes from each part's elements: R and SW conduct both ways (a
// button counts as closed, since the user presses it), and D conducts one way,
// from its first pin to its second (anode to cathode).
function findCircuitProblems(actions, { labelForm = true } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const problems = [];
  const wires = actions.filter(a => a.tool === 'add_wire');
  const ends = wires.flatMap(w => [w.from, w.to]);
  const wired = key => ends.some(e => nodeKey(e) === key);

  const pinName = (n, k) => labelForm ? `BAT${n + 1}.${k}` : `battery_${n}_pin${k}`;
  const batName = n => labelForm ? `BAT${n + 1}` : `battery_${n}`;

  const wireEdges = wires.map(w => [nodeKey(w.from), nodeKey(w.to)]);
  const edges = wireEdges.slice();
  // One-way parts: { part, def, el, anode, cathode } with anode/cathode as nodes.
  const diodes = [];
  // Every placed part, and a graph where every part element conducts both
  // ways (a released button counts as closed, a backwards LED still joins its
  // columns): the "is it on a complete path at all" check reads this one.
  const placedParts = [];
  const joins = wireEdges.map(([x, y]) => ({ x, y, part: -1 }));
  actions.forEach((a, i) => {
    const def = PART_BY_TOOL.get(a.tool);
    if (!def || (def.place.kind !== 'span' && def.place.kind !== 'footprint')) return;
    // A span part's holes are holeA / holeB; a footprint part's come from
    // its legs (a leg off the board has no hole, so its pin joins nothing).
    const holeOf = def.place.kind === 'span' ? { [def.pins[0]]: a.holeA, [def.pins[1]]: a.holeB } : {};
    if (def.place.kind === 'footprint') for (const leg of actionLegs(def, a)) holeOf[leg.pin] = leg.hole;
    const node = p => (p in holeOf ? nodeKey(holeOf[p]) : `part${i}${p}`);   // "#mid" is inside the part
    placedParts.push({ i, a, def, holeOf, pinNodes: def.pins.map(node) });
    for (const el of elementsOf(def)) {
      if (!Array.isArray(el.pins)) continue;
      const [x, y] = el.pins;
      joins.push({ x: node(x), y: node(y), part: i });
      if (el.kind === 'R' || el.kind === 'SW') edges.push([node(x), node(y)]);
      if (el.kind === 'D') diodes.push({ i, el, anode: node(x), cathode: node(y), outer: x in holeOf && y in holeOf, holeOf });
    }
  });

  // The nodes `seed` reaches in `joins`, leaving out part `skip`'s own elements.
  function joined(seed, skip) {
    const seen = new Set([seed]), queue = [seed];
    while (queue.length) {
      const at = queue.shift();
      for (const { x, y, part } of joins) {
        if (part === skip || !x || !y) continue;
        const next = x === at ? y : (y === at ? x : null);
        if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  }

  // An edge [x, y] conducts both ways; [x, y, true] only from x to y.
  // Nodes in `blocked` are never entered.
  function reach(seed, graph = edges, blocked = new Set()) {
    const seen = new Set([seed]), queue = [seed];
    while (queue.length) {
      const at = queue.shift();
      for (const [x, y, oneWay] of graph) {
        if (!x || !y) continue;
        const next = x === at ? y : (y === at && !oneWay ? x : null);
        if (next && !seen.has(next) && !blocked.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  }

  // Diodes conduct forward only: from + that is anode -> cathode, from - it
  // is cathode -> anode. So a series chain reaches both ends, and a reversed
  // LED is still no path.
  const fromPlus  = edges.concat(diodes.map(d => [d.anode, d.cathode, true]));
  const fromMinus = edges.concat(diodes.map(d => [d.cathode, d.anode, true]));

  // Every battery the build places or wires to.
  const batteries = new Set();
  let placed = 0;
  for (const a of actions) if (a.tool === BATTERY_TOOL) batteries.add(placed++);
  for (const e of ends) { const b = batteryPin(e); if (b) batteries.add(b.n); }

  const pos = new Set(), neg = new Set();
  const railPairs = new Map();   // "tp|tn" → the batteries wired to that rail pair
  for (const n of [...batteries].sort((a, b) => a - b)) {
    const plus = `battery_${n}_pin0`, minus = `battery_${n}_pin1`;   // nodeKey form
    if (n < placed) {
      if (!wired(plus))  problems.push(`${pinName(n, 0)} is not wired to a positive rail (tp_N), so nothing on the board is powered.`);
      if (!wired(minus)) problems.push(`${pinName(n, 1)} is not wired to a ground rail (tn_N), so the circuit has no return path.`);
    }
    // Wires alone joining + to − is a dead short. A resistor or buzzer in
    // the path is a load, not a short.
    const plusWires = reach(plus, wireEdges);
    if (plusWires.has(minus)) {
      problems.push(`${pinName(n, 0)} and ${pinName(n, 1)} are joined by wires alone, which is a short circuit across the battery. Put a resistor or other part between them.`);
    }
    // The rails each pin is wired to, for the two-batteries check (#51).
    const rails = set => [...set].filter(k => /^(tp|tn|bp|bn)$/.test(k)).sort().join(',');
    const pair = `${rails(plusWires)}|${rails(reach(minus, wireEdges))}`;
    if (!/^\||\|$/.test(pair)) railPairs.set(pair, [...(railPairs.get(pair) || []), n]);

    // First each side without diodes, then grown through forward diodes
    // without crossing into the other side: an LED that lit up one branch
    // must not carry + round through the ground rail and hide a reversed LED
    // elsewhere.
    const plusSide = reach(plus), minusSide = reach(minus);
    const onlyMinus = new Set([...minusSide].filter(k => !plusSide.has(k)));
    const onlyPlus  = new Set([...plusSide].filter(k => !minusSide.has(k)));
    for (const k of plusSide) pos.add(k);
    for (const k of minusSide) neg.add(k);
    for (const k of reach(plus, fromPlus, onlyMinus))  pos.add(k);
    for (const k of reach(minus, fromMinus, onlyPlus)) neg.add(k);
  }

  // #51: two batteries on one pair of rails fight each other.
  for (const [pair, ns] of railPairs) {
    if (ns.length < 2) continue;
    const names = ns.map(batName);
    const said = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const [p, m] = pair.split('|');
    problems.push(`${said} are wired to the same rails (${p} and ${m}), so they fight each other. Give the second battery the bottom rails (bp_N and bn_N), with its circuit in rows f–j.`);
  }

  // These checks see only this reply, not the board on screen. Without a
  // delete_all the LED may sit on a battery already placed, so judging it
  // here would be a false alarm (#14). Only a full rebuild is checked.
  const fullRebuild = actions.some(a => a.tool === 'delete_all');

  // Each part must sit between power and ground: without the part itself,
  // one pin reaches a battery's + and the other its −. A backwards diode is
  // its own problem. Any other complete branch makes every node reachable
  // from both terminals, so orientation is undecidable there: prefer saying
  // nothing over accusing a correctly wired LED of being backwards.
  const terminals = [...batteries].map(n => [`battery_${n}_pin0`, `battery_${n}_pin1`]);
  for (const { i, a, def, holeOf, pinNodes } of fullRebuild ? placedParts : []) {
    if (def.place.kind === 'footprint') {
      problems.push(...footprintProblems(i, a, def, holeOf, pinNodes));
      continue;
    }
    const backwards = diodes.find(d => d.i === i && d.outer
      && !(pos.has(d.anode) && neg.has(d.cathode)) && pos.has(d.cathode) && neg.has(d.anode));
    if (backwards) {
      const { el, holeOf } = backwards;
      const [ap, cp] = el.pins;
      problems.push(`The ${partName(def)} at ${a.holeA}/${a.holeB} is backwards: its ${cp} ${holeOf[cp]} is on the power side and its ${ap} ${holeOf[ap]} is on the ground side. Swap holeA and holeB.`);
      continue;
    }
    const [x, y] = pinNodes.map(e => joined(e, i));
    const onPath = terminals.some(([p, m]) => (x.has(p) && y.has(m)) || (x.has(m) && y.has(p)));
    if (!onPath) {
      problems.push(`The ${partName(def)} at ${a.holeA}/${a.holeB} is not connected between power and ground, so no current flows through it.`);
      continue;
    }
    // On a path, but a diode on it faces the wrong way (e.g. both LEDs of a
    // series pair flipped, so neither reads as backwards on its own).
    const stuck = diodes.find(d => d.i === i && d.outer && !(pos.has(d.anode) && neg.has(d.cathode)));
    if (stuck) {
      problems.push(`The ${partName(def)} at ${a.holeA}/${a.holeB} has no forward path from + to −, so it cannot light. Check each diode on its path: cathode (holeA) toward −, anode (holeB) toward +.`);
    }
  }

  // A footprint part (3+ legs) must sit between power and ground through
  // some pair of its pins. Once it does, a pin the part lists in
  // ai.mustWire (e.g. a pot's wiper) whose hole is joined to nothing else
  // does nothing, and is named. Other pins may be left unused.
  function footprintProblems(i, a, def, holeOf, pinNodes) {
    const reached = pinNodes.map(n => joined(n, i));
    const onPath = terminals.some(([p, m]) => reached.some((x, k) => x.has(p) && reached.some((y, j) => j !== k && y.has(m))));
    if (!onPath) return [`The ${partName(def)} at ${a.hole} is not connected between power and ground, so no current flows through it.`];
    const must = (def.ai && def.ai.mustWire) || [];
    return def.pins.filter((pin, k) => must.includes(pin) && holeOf[pin] && reached[k].size === 1)
      .map(pin => `The ${partName(def)} at ${a.hole} has its ${pin} pin (${holeOf[pin]}) wired to nothing, so nothing uses it. Wire ${holeOf[pin]}'s column to the part it should feed.`);
  }

  problems.push(...findStackedHoles(actions));
  return problems;
}

const SYSTEM_PROMPT = buildPrompt(CIRCUIT_TOOLS[0].function_declarations);

// ── Call Gemini ──────────────────────────────────────────────
const ask = makeAsk(
  (markdown, userMsg, history) => askGemini(markdown, userMsg, history),
  {
    SYSTEM_PROMPT, CIRCUIT_TOOLS, finish: finishAIReply,
    // DeepSeek's tool loop: the tools and prompt per request, use_parts, and
    // placement refusals it can answer as tool results.
    toolsFor:  (markdown, message) => selectTools(message, boardTypes(markdown)),
    promptFor: buildPrompt,
    partTools,
    refusal:   placementRefusal,
  }
);

async function askGemini(markdown, userMsg, history) {
  const msg = userMsg || 'Analyze my circuit and tell me what to do next.';
  const boardState = markdown || '**Board is EMPTY — no components or wires placed.**';

  // Build multi-turn contents from conversation history
  const contents = [];
  if (Array.isArray(history) && history.length) {
    for (const h of history) {
      const role = h.role === 'model' ? 'model' : 'user';
      if (h.text) contents.push({ role, parts: [{ text: h.text }] });
    }
  }

  // Current user message with board state
  contents.push({
    role: 'user',
    parts: [{ text: `BOARD STATE:\n${boardState}\n\nQUESTION: ${msg}` }],
  });

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: CIRCUIT_TOOLS,
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generation_config: { temperature: 0.3, max_output_tokens: 2048 },
  };

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];

  // Handle blocked / empty responses
  if (!candidate || candidate.finishReason === 'SAFETY') {
    return { reply: "I can't help with that request. Try asking about building a circuit!", actions: [] };
  }

  const parts = candidate.content?.parts || [];
  let reply = '';
  const actions = [];

  for (const part of parts) {
    if (part.text) reply += part.text;
    if (part.functionCall) {
      const fc = part.functionCall;
      actions.push({ tool: fc.name, ...(fc.args || {}) });
    }
  }

  return finishAIReply({ reply, actions });
}

// ── Shared reply clean-up ────────────────────────────────────
// Every model's { reply, actions } goes through this before the browser
// sees it: a default reply, JSON-in-text fallback, malformed actions
// dropped, and circuit problems reported.
function finishAIReply({ reply, actions }) {
  reply = String(reply || '').trim();
  actions = Array.isArray(actions) ? actions : [];

  // If model returned only function calls with no text, provide a default
  if (!reply && actions.length > 0) {
    reply = "Here you go! I've built the circuit for you. Hit Run Simulation to test it out!";
  } else if (!reply) {
    reply = '(no response)';
  }

  // Fallback: also check text for JSON actions block (in case model embeds JSON in text)
  if (actions.length === 0) {
    const match = reply.match(/```(?:actions|json)\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (Array.isArray(parsed)) actions = parsed;
        reply = reply.slice(0, match.index).trim();
      } catch { /* ignore parse errors */ }
    }
  }

  // Name battery pins in problems the way the AI wrote them, judged before
  // malformed actions are dropped so a half-written wire still counts.
  const usedOldForm = actions.some(a => a && a.tool === 'add_wire'
    && [a.from, a.to].some(e => OLD_BATTERY_PIN.test(String(e))));

  // Filter out malformed actions (missing required fields), and use_parts,
  // which only asks for tools and is not a board action.
  actions = actions.filter(a => {
    if (a.tool === 'use_parts') return false;
    if (a.tool === 'add_wire' && (!a.from || !a.to)) return false;
    const def = PART_BY_TOOL.get(a.tool);
    if (def && def.place.kind === 'span' && (!a.holeA || !a.holeB)) return false;
    return true;
  });

  // Drop bad part values; the parts stay, at their defaults.
  const notes = [];
  actions = actions.map(a => {
    const { action, notes: said } = checkValues(a);
    notes.push(...said);
    return action;
  });

  // Drop parts Parts.checkPlacement refuses, in order, so a refused part
  // holds no holes. The DeepSeek loop has already refused most of them.
  const kept = [];
  for (const a of actions) {
    const why = placementRefusal(a, kept);
    if (why) notes.push(why);
    else kept.push(a);
  }
  actions = kept;
  if (notes.length) reply += `\n\n${notes.join('\n')}`;

  // Report problems instead of patching them, so a wrong circuit is visible
  // rather than rewritten into a different one.
  const problems = findCircuitProblems(actions, { labelForm: !usedOldForm });
  if (problems.length) {
    console.warn('[validate] ' + problems.join(' | '));
    reply += `\n\nHeads up, this build has a problem:\n- ${problems.join('\n- ')}\n\nAsk me to fix it and I will rebuild the circuit.`;
  }

  return { reply, actions };
}

// ── HTTP server ───────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJSON(res, status, obj) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// /api/ask spends the Gemini key, so cap it per IP or it is an open proxy.
const MAX_BODY_BYTES = 256 * 1024;

const ASK_WINDOW_MS = 60000;
const ASK_MAX_PER_WINDOW = 20;
const askHits = new Map();

// Behind a proxy (Render and similar) every request arrives from the proxy,
// so the limit would be shared by every visitor. Only trust the header when
// told to, and only its last entry: the proxy appends the address it saw,
// and anything to the left of that is whatever the client chose to send.
function clientKey(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}

function askRateLimited(req) {
  const ip = clientKey(req);
  const now = Date.now();
  if (askHits.size > 5000) askHits.clear();
  const hits = (askHits.get(ip) || []).filter(t => now - t < ASK_WINDOW_MS);
  hits.push(now);
  askHits.set(ip, hits);
  return hits.length > ASK_MAX_PER_WINDOW;
}

const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/api/health') {
    return sendJSON(res, 200, { status: 'ok', model: MODEL_NAME });
  }

  if (req.method === 'POST' && req.url === '/api/ask') {
    if (askRateLimited(req)) {
      return sendJSON(res, 429, { reply: 'Too many requests. Give Sparky a moment and try again.', actions: [] });
    }
    // Stop buffering past MAX_BODY_BYTES: an unbounded body is a memory DoS.
    let body = '', size = 0, tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        sendJSON(res, 413, { reply: 'That request is too large.', actions: [] });
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const { markdown = '', message = '', history = [] } = JSON.parse(body || '{}');
        const { reply, actions } = await ask(markdown, message, history);
        console.log(`[ask] "${message.slice(0,60)}" → ${actions.length} action(s)`);
        return sendJSON(res, 200, { reply, actions });
      } catch (e) {
        // Upstream body can contain key/quota detail, so it stays in the log.
        console.error('[ask] failed:', e.message);
        return sendJSON(res, 502, { reply: 'Sparky could not reach the AI service. Please try again in a moment.', actions: [] });
      }
    });
    return;
  }

  // ── Static file serving ───────────────────────────────────
  const STATIC_ROOT = path.join(__dirname, '..');
  // Doubles as the extension allowlist: anything not listed here is never served.
  // .json is deliberately absent, every .json in this repo is build config.
  const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.glb': 'model/gltf-binary', '.sparky': 'application/octet-stream',
  };
  // Server code, build sources and tooling. Mirrors the ignore list in firebase.json.
  const DENY_DIRS = new Set(['backend', 'src', 'out', 'functions', 'node_modules']);

  if (req.method === 'GET') {
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch {
      return sendJSON(res, 400, { error: 'Bad request path' });
    }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(STATIC_ROOT, urlPath);
    const rel = path.relative(STATIC_ROOT, filePath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      return sendJSON(res, 403, { error: 'Forbidden' });
    }
    const segments = rel.split(path.sep);
    const ext = path.extname(filePath).toLowerCase();
    const servable = MIME[ext] &&
      !DENY_DIRS.has(segments[0].toLowerCase()) &&
      !segments.some(seg => seg.startsWith('.'));
    if (servable) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[ext] });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch { /* file not found — fall through to 404 */ }
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
});

// Malformed HTTP from a client must not be fatal.
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

// Last resort: log and keep serving rather than exiting on a single bad request.
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err && err.stack ? err.stack : err);
});

// Listen only when run directly (node server.js), so tests can load it.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`⚡ Sparky AI  →  http://localhost:${PORT}`);
    console.log(`   AI    : ${AI_PROVIDER}`);
    console.log(`   Model : ${MODEL_NAME}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
  });
}

module.exports = { server, clientKey, finishAIReply, SYSTEM_PROMPT, CIRCUIT_TOOLS, selectTools, findCircuitProblems };
