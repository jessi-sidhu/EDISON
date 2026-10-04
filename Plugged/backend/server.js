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
const { COLS, TOTAL_HOLES } = require('../circuit3d/js/board-geometry.js');

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

// ── Gemini system prompt ─────────────────────────────────────
const SYSTEM_PROMPT = [
  `You are Sparky, a friendly AI electronics tutor. You help beginners build circuits on a virtual ${TOTAL_HOLES}-point breadboard.`,
  '',
  'BREADBOARD LAYOUT:',
  `- Columns 1-${COLS}. Rows a/b/c/d/e = top half. Rows f/g/h/i/j = bottom half.`,
  '- Same column + same half = electrically connected (e.g. a14 and e14 share a node).',
  '- The CENTER CHANNEL separates top from bottom. a14 and f14 are NOT connected unless you wire them.',
  '- tp_N = positive power rail at column N (+9V). tn_N = GND rail at column N.',
  '- Rails are NOT auto-connected to body holes. Always wire from tp/tn to body holes.',
  '',
  'PART LABELS:',
  '- Every part has a label that never changes: R1, R2 (resistors), LED1 (LEDs), BAT1 (batteries), BZ1 (buzzers), SW1 (buttons).',
  '- The board state lists parts by label, so you can talk about them as R1, LED1 and so on.',
  '- Only a battery pin can be a wire end by label: "BAT1.0" (+) or "BAT1.1" (-).',
  '- Parts on the board (R, LED, BZ, SW) are wired through the breadboard holes they sit in, which the Components table lists. Never use "R1.0" or "LED1.1" as a wire end.',
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
  '',
  'COMPONENT RULES:',
  '- LED: holeA = cathode (-) goes toward GND. holeB = anode (+) goes toward resistor/power.',
  '- Every LED needs a resistor in series to limit current.',
  '- When the user names a value, pass it: "a 1 kΩ resistor" → place_resistor with resistance: 1000 (ohms), "a green LED" → place_led with color: "green", "a 5 V battery" → place_battery with voltage: 5. Leave it out otherwise.',
  '',
  'SIZING (columns apart, same row):',
  '- place_resistor: exactly 4 columns apart (e.g. b3 and b7)',
  '- place_led: exactly 2 columns apart (e.g. cathode c9, anode c7)',
  '- place_button: exactly 3 columns apart (e.g. b12 and b15)',
  '- place_buzzer: exactly 2 columns apart',
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
  '- Never patch an existing circuit. Always clear and rebuild the full correct circuit.',
  '- After building, write 2-3 sentences explaining what you built and how it works.',
  '- When you explain a build with more than one LED, say which topology you built: series, parallel, or separate branches.',
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
  'Reply style: 2-5 sentences max. Be specific with hole names. Be encouraging.',
  'For pure questions (no building), just respond with helpful text. Do not call any tools.',
].join('\n');

// ── Gemini function declarations ─────────────────────────────
const CIRCUIT_TOOLS = [{
  function_declarations: [
    {
      name: 'delete_all',
      description: 'Clear all components and wires from the board. Call this FIRST when building or fixing a circuit.',
    },
    {
      name: 'place_battery',
      description: 'Place a battery off-board, 9V unless you pass voltage. It gets the next battery label (BAT1 after delete_all). You MUST follow this with add_wire calls to connect BAT1.0 (+) to a positive rail (tp_N) and BAT1.1 (-) to a negative rail (tn_N).',
      parameters: {
        type: 'OBJECT',
        properties: {
          voltage: { type: 'NUMBER', description: 'Optional. Battery voltage in volts, e.g. 5. Only when the user names one.' },
        },
      },
    },
    {
      name: 'place_resistor',
      description: 'Place a resistor. holeA and holeB must be exactly 4 columns apart on the same row.',
      parameters: {
        type: 'OBJECT',
        properties: {
          holeA: { type: 'STRING', description: 'Start hole, e.g. "b3"' },
          holeB: { type: 'STRING', description: 'End hole, 4 columns from holeA, e.g. "b7"' },
          resistance: { type: 'NUMBER', description: 'Optional. Resistance in ohms, e.g. 1000 for 1 kΩ. Only when the user names one.' },
        },
        required: ['holeA', 'holeB'],
      },
    },
    {
      name: 'place_led',
      description: 'Place an LED. holeA = cathode (-), holeB = anode (+). Must be exactly 2 columns apart on the same row.',
      parameters: {
        type: 'OBJECT',
        properties: {
          holeA: { type: 'STRING', description: 'Cathode (-) hole, e.g. "c9"' },
          holeB: { type: 'STRING', description: 'Anode (+) hole, e.g. "c7"' },
          // The names are LED_COLORS below. This literal can't reference it.
          color: { type: 'STRING', description: 'Optional. LED colour: red, yellow, green, blue, or white. Only when the user names one.' },
        },
        required: ['holeA', 'holeB'],
      },
    },
    {
      name: 'place_buzzer',
      description: 'Place a buzzer. holeA and holeB must be exactly 2 columns apart on the same row.',
      parameters: {
        type: 'OBJECT',
        properties: {
          holeA: { type: 'STRING', description: 'First hole, e.g. "b3"' },
          holeB: { type: 'STRING', description: 'Second hole, e.g. "b5"' },
        },
        required: ['holeA', 'holeB'],
      },
    },
    {
      name: 'place_button',
      description: 'Place a push button. holeA and holeB must be exactly 3 columns apart on the same row.',
      parameters: {
        type: 'OBJECT',
        properties: {
          holeA: { type: 'STRING', description: 'First hole, e.g. "b12"' },
          holeB: { type: 'STRING', description: 'Second hole, e.g. "b15"' },
        },
        required: ['holeA', 'holeB'],
      },
    },
    {
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
    },
  ],
}];

// ── Part values ──────────────────────────────────────────────
// The LED colours the board knows. Keep in step with LED_TYPES in
// circuit3d/js/components.js.
const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'];

// Drops a value the board can't use from its action, keeping the part at its
// default. Returns the (possibly copied) action and a note for each drop.
// A null or missing value is not a value, so it goes without a note.
function checkPartValues(a) {
  const notes = [];
  const drop = (key, note) => {
    const { [key]: _gone, ...rest } = a;
    if (a[key] != null) notes.push(note);
    a = rest;
  };
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const shown = v => typeof v === 'string' ? `"${v}"` : String(v);

  if (a.tool === 'place_resistor' && 'resistance' in a && !positive(a.resistance)) {
    drop('resistance', `The resistance ${shown(a.resistance)} isn't a usable value, so the resistor at ${a.holeA}/${a.holeB} uses the default resistance.`);
  }
  if (a.tool === 'place_battery' && 'voltage' in a && !positive(a.voltage)) {
    drop('voltage', `The battery voltage ${shown(a.voltage)} isn't a usable value, so the battery uses the default voltage.`);
  }
  if (a.tool === 'place_led' && 'color' in a) {
    const c = typeof a.color === 'string' ? a.color.toLowerCase() : null;
    if (!LED_COLORS.includes(c)) {
      drop('color', `The LED colour ${shown(a.color)} isn't one I have (${LED_COLORS.join(', ')}), so the LED at ${a.holeA}/${a.holeB} uses the default colour.`);
    } else if (c !== a.color) a = { ...a, color: c };
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

// LEDs are left out of the plain graph below: they only conduct one way, so
// treating one as a plain connection would bridge power to ground.
const CONDUCTORS = ['place_resistor', 'place_button', 'place_buzzer'];

const PART_NAMES = { place_resistor: 'resistor', place_led: 'LED', place_buzzer: 'buzzer', place_button: 'button' };

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
    if (a.tool === 'delete_all') used = new Map();
    else if (PART_NAMES[a.tool]) { put(a.holeA, PART_NAMES[a.tool]); put(a.holeB, PART_NAMES[a.tool]); }
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
function findCircuitProblems(actions, { labelForm = true } = {}) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const problems = [];
  const wires = actions.filter(a => a.tool === 'add_wire');
  const ends = wires.flatMap(w => [w.from, w.to]);
  const wired = key => ends.some(e => nodeKey(e) === key);

  const pinName = (n, k) => labelForm ? `BAT${n + 1}.${k}` : `battery_${n}_pin${k}`;

  const wireEdges = wires.map(w => [nodeKey(w.from), nodeKey(w.to)]);
  const edges = wireEdges.slice();
  for (const c of actions) {
    if (CONDUCTORS.includes(c.tool)) edges.push([nodeKey(c.holeA), nodeKey(c.holeB)]);
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

  // LEDs conduct forward only: from + that is anode -> cathode, from - it is
  // cathode -> anode. So a series chain reaches both ends, and a reversed LED
  // is still no path.
  const leds = actions.filter(a => a.tool === 'place_led');
  const fromPlus  = edges.concat(leds.map(l => [nodeKey(l.holeB), nodeKey(l.holeA), true]));
  const fromMinus = edges.concat(leds.map(l => [nodeKey(l.holeA), nodeKey(l.holeB), true]));

  // Every battery the build places or wires to.
  const batteries = new Set();
  let placed = 0;
  for (const a of actions) if (a.tool === 'place_battery') batteries.add(placed++);
  for (const e of ends) { const b = batteryPin(e); if (b) batteries.add(b.n); }

  const pos = new Set(), neg = new Set();
  for (const n of [...batteries].sort((a, b) => a - b)) {
    const plus = `battery_${n}_pin0`, minus = `battery_${n}_pin1`;   // nodeKey form
    if (n < placed) {
      if (!wired(plus))  problems.push(`${pinName(n, 0)} is not wired to a positive rail (tp_N), so nothing on the board is powered.`);
      if (!wired(minus)) problems.push(`${pinName(n, 1)} is not wired to a ground rail (tn_N), so the circuit has no return path.`);
    }
    // Wires alone joining + to − is a dead short. A resistor or buzzer in
    // the path is a load, not a short.
    if (reach(plus, wireEdges).has(minus)) {
      problems.push(`${pinName(n, 0)} and ${pinName(n, 1)} are joined by wires alone, which is a short circuit across the battery. Put a resistor or other part between them.`);
    }
    // First each side without LEDs, then grown through forward LEDs without
    // crossing into the other side: an LED that lit up one branch must not
    // carry + round through the ground rail and hide a reversed LED elsewhere.
    const plusSide = reach(plus), minusSide = reach(minus);
    const onlyMinus = new Set([...minusSide].filter(k => !plusSide.has(k)));
    const onlyPlus  = new Set([...plusSide].filter(k => !minusSide.has(k)));
    for (const k of plusSide) pos.add(k);
    for (const k of minusSide) neg.add(k);
    for (const k of reach(plus, fromPlus, onlyMinus))  pos.add(k);
    for (const k of reach(minus, fromMinus, onlyPlus)) neg.add(k);
  }

  // These checks see only this reply, not the board on screen. Without a
  // delete_all the LED may sit on a battery already placed, so judging it
  // here would be a false alarm (#14). Only a full rebuild is checked.
  const fullRebuild = actions.some(a => a.tool === 'delete_all');

  // holeA is the cathode (-), holeB is the anode (+).
  for (const led of fullRebuild ? leds : []) {
    const cathode = nodeKey(led.holeA), anode = nodeKey(led.holeB);
    const forward  = pos.has(anode) && neg.has(cathode);
    const reversed = pos.has(cathode) && neg.has(anode);
    // Any other complete branch makes every node reachable from both terminals,
    // so orientation is undecidable there. Prefer saying nothing over accusing a
    // correctly wired LED of being backwards.
    if (!forward && reversed) {
      problems.push(`The LED at ${led.holeA}/${led.holeB} is backwards: its cathode ${led.holeA} is on the power side and its anode ${led.holeB} is on the ground side. Swap holeA and holeB.`);
    } else if (!forward) {
      problems.push(`The LED at ${led.holeA}/${led.holeB} is not connected between power and ground, so it cannot light.`);
    }
  }

  problems.push(...findStackedHoles(actions));
  return problems;
}

// ── Call Gemini ──────────────────────────────────────────────
const ask = makeAsk(
  (markdown, userMsg, history) => askGemini(markdown, userMsg, history),
  { SYSTEM_PROMPT, CIRCUIT_TOOLS, finish: finishAIReply }
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

  // Filter out malformed actions (missing required fields)
  actions = actions.filter(a => {
    if (a.tool === 'add_wire' && (!a.from || !a.to)) return false;
    if (['place_resistor','place_led','place_buzzer','place_button'].includes(a.tool)
        && (!a.holeA || !a.holeB)) return false;
    return true;
  });

  // Drop bad part values; the parts stay, at their defaults.
  const valueNotes = [];
  actions = actions.map(a => {
    const { action, notes } = checkPartValues(a);
    valueNotes.push(...notes);
    return action;
  });
  if (valueNotes.length) reply += `\n\n${valueNotes.join('\n')}`;

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

module.exports = { server, clientKey, finishAIReply, SYSTEM_PROMPT };
