// Explain mode on POST /api/ask (issue #169). After the photo's Build it,
// Edison was asked "What's wrong with my circuit?" with every editing tool on
// offer, so deepseek-flash treated the question as a fix request: it claimed
// the backwards LED lights and queued deletes (even a wire W5 that doesn't
// exist). The fix: a request can ask for an answer only, and then the model is
// offered no tools at all.
//
// Shapes these tests assume (the approved fix on #169, stated so the builder
// matches them):
// - POST /api/ask's body takes an optional `explain` (boolean). `explain: true`
//   means "answer in text, change nothing": the server offers no tools, so
//   EVERY DeepSeek request of that ask has no `tools` key and no `tool_choice`
//   key (not `tools: []`: the field is left out).
// - The answer comes back as { reply, actions: [] }. A tool call the model
//   returns anyway is never queued, so `actions` stays [].
// - The server logs the mode on a line with "[ask]", "explain" and "no tools",
//   e.g. `[ask] explain: no tools`, instead of the "[ask] tools: …" list.
// - The rest of the request is as today: the system prompt first, and the
//   user message carries the board markdown and the question.
// - Without `explain`, or with `explain: false`, nothing changes: the tools
//   go as today (pinned below), and the demo build prompt's golden
//   (test/prompt-golden.test.js) is untouched.
//
// How: the real HTTP server with AI_PROVIDER=deepseek, and a fake global fetch
// standing in for DeepSeek, as in test/deepseek-loop.test.js. The request is
// the one the page sends after Build it on the sample photo: the demo board
// (PhotoImport.build of the contract's mock Reading: R1 from the + rail, LED1
// backwards), its markdown with the real simulator's Simulation section, and
// the default question plus the photo's context line. No network, no key.

const assert = require('node:assert');
const fs     = require('node:fs');
const http   = require('node:http');
const path   = require('node:path');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
process.env.TRUST_PROXY = '1';         // each ask from its own X-Forwarded-For, so the 20-a-minute limit never bites
const Server      = require('../backend/server.js');
const Board       = require('../circuit3d/js/board-model.js');
const Sim         = require('../circuit3d/js/simulate.js');
const PhotoImport = require('../circuit3d/js/photo-import.js');
const Chat        = require('../circuit3d/js/chat.js');

// ── The request the page sends after Build it ──────────────────────────────

const READING = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'photo', 'demo-board.json'), 'utf8')).reading;
const BUILT   = PhotoImport.build(READING, { components: [] });
const BOARD   = Board.apply(Board.empty(), BUILT.actions).board;   // BAT1, R1, LED1 (backwards), W1…W4

// The Simulation section exportMarkdown writes, from the real simulator.
const SIMULATION = (() => {
  const { components, wires } = Board.toSim(BOARD);
  return Sim.simulationSummary(components, wires, (_, c) => c.label).join('\n');
})();
const MARKDOWN = [
  '**Board status: 3 component(s), 4 wire(s).**', '',
  '## Components',
  '| id | type | value | pin_A | pin_B |',
  '|----|------|-------|-------|-------|',
  '| BAT1 | battery | 9 V | off-board + → wire ref: BAT1.0 | off-board − → wire ref: BAT1.1 |',
  '| R1 | resistor | 470 Ω | a10 | a14 |',
  '| LED1 | led | red | c14 (cathode) | c17 (anode) |', '',
  '## Wires',
  '| id | from | to | color |',
  '|----|------|----|-----------|',
  ...BOARD.wires.map(w => `| ${w.id} | ${w.from} | ${w.to} | #ef4444 |`), '',
  '## Simulation', SIMULATION, '',
].join('\n');

const DEFAULT_Q = "What's wrong with my circuit?";             // photo.js's DEFAULT_Q
const MESSAGE   = DEFAULT_Q + '\n\n' + Chat.photoContext(BUILT);
const ANSWER    = 'LED1 is in backwards: its cathode (c14) is on the + side. Pull it out and swap its legs, so the anode is in c14 and the cathode in c17.';

// ── The fake DeepSeek ───────────────────────────────────────────────────────

// Answers request n with replies[n] (the last one after that), keeps every body.
function scriptedDeepSeek(replies) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    const message = replies[Math.min(calls.length - 1, replies.length - 1)];
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }] }) };
  };
  fn.calls = calls;
  return fn;
}
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args || {}) } });
const says = text => ({ content: text, tool_calls: null });
const toolNames = body => (body.tools || []).map(t => t.function.name);

// ── The HTTP server ─────────────────────────────────────────────────────────

let port;
let lines;   // every console.log / console.info line of the test
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  port = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));
beforeEach(() => {
  lines = [];
  for (const m of ['log', 'info']) vi.spyOn(console, m).mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
  for (const m of ['warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// POST /api/ask with node:http, so the fake global fetch only sees DeepSeek.
// `extra` is merged into the page's body ({ explain: true } and so on). Each
// request comes from its own address (TRUST_PROXY=1 above).
let ipCount = 0;
function post(extra) {
  const body = JSON.stringify({ markdown: MARKDOWN, message: MESSAGE, history: [], board: BOARD, ...extra });
  const ip = `10.169.${Math.floor(++ipCount / 250)}.${ipCount % 250 + 1}`;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Forwarded-For': ip } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Each DeepSeek request of the ask that still offers tools, for the message.
const withTools = calls => calls.map((b, i) => ({ round: i + 1, tools: 'tools' in b ? toolNames(b) : undefined, tool_choice: b.tool_choice }))
  .filter(r => r.tools !== undefined || r.tool_choice !== undefined);

// ── Explain mode ────────────────────────────────────────────────────────────

test('precondition: the demo board the request carries has LED1 backwards in its Simulation section', () => {
  assert.deepStrictEqual(BOARD.wires.map(w => w.id), ['W1', 'W2', 'W3', 'W4']);
  assert.ok(BOARD.parts.some(p => p.label === 'LED1'), JSON.stringify(BOARD.parts));
  assert.match(SIMULATION, /LED is backwards/, SIMULATION);
});

test('explain: true sends DeepSeek no tools and no tool_choice; the answer comes back as text with actions []', async () => {
  const fetch = scriptedDeepSeek([says(ANSWER)]);
  vi.stubGlobal('fetch', fetch);
  const res = await post({ explain: true });

  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(fetch.calls.length, 1, `a text answer is one request, got ${fetch.calls.length}`);
  const body = fetch.calls[0];
  assert.ok(!('tools' in body), `explain mode must leave the tools field out, got ${body.tools ? body.tools.length : body.tools} tools: ${JSON.stringify(toolNames(body))}`);
  assert.ok(!('tool_choice' in body), `explain mode must leave tool_choice out, got ${JSON.stringify(body.tool_choice)}`);
  assert.deepStrictEqual(res.json, { reply: ANSWER, actions: [] });

  // The rest of the request is as today: the prompt, then the board and her question.
  assert.equal(body.messages[0].role, 'system');
  const user = body.messages[body.messages.length - 1];
  assert.equal(user.role, 'user');
  assert.ok(user.content.includes(MARKDOWN), 'the user message carries the board markdown, Simulation section included');
  assert.ok(user.content.includes(MESSAGE), 'the user message carries the question and the photo context');
});

test('explain: true with a model that calls tools anyway: no request offers tools, and nothing is queued', async () => {
  const fetch = scriptedDeepSeek([
    { content: 'Fixed!', tool_calls: [call('d1', 'delete_part', { part: 'LED1' }), call('d2', 'delete_wire', { wire: 'W5' })] },
    says(ANSWER),
  ]);
  vi.stubGlobal('fetch', fetch);
  const res = await post({ explain: true });

  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepStrictEqual(withTools(fetch.calls), [], 'every round of an explain ask goes without tools');
  assert.deepStrictEqual(res.json.actions, [], `no edit may come back from an explain ask: ${JSON.stringify(res.json.actions)}`);
  assert.equal(typeof res.json.reply, 'string');
  assert.ok(res.json.reply.trim(), 'the reply is not empty');
});

test('explain: true logs explain mode on an [ask] line, and no tool list', async () => {
  vi.stubGlobal('fetch', scriptedDeepSeek([says(ANSWER)]));
  await post({ explain: true });

  const ask = lines.filter(l => l.includes('[ask]'));
  assert.ok(ask.some(l => /explain/i.test(l) && /no tools/i.test(l)),
    `no [ask] line says explain mode with no tools (e.g. "[ask] explain: no tools"):\n${ask.join('\n')}`);
  const listed = ask.filter(l => Server.ALWAYS_SENT.some(n => new RegExp(`\\b${n}\\b`).test(l)));
  assert.deepStrictEqual(listed, [], 'an explain ask lists no tools in the log');
});

// Pin (passes today): without the flag, or with explain: false, the same
// request offers the tools exactly as before #169: every always-sent tool,
// with tool_choice auto, and the model's edit comes back as actions.
test.each([
  ['no explain field', {}],
  ['explain: false', { explain: false }],
])('pin: %s sends the tools as today and keeps the model\'s edit', async (_, extra) => {
  const flip = [call('f1', 'delete_part', { part: 'LED1' })];
  const fetch = scriptedDeepSeek([{ content: '', tool_calls: flip }, says('Removed LED1.')]);
  vi.stubGlobal('fetch', fetch);
  const res = await post(extra);

  assert.equal(res.status, 200, JSON.stringify(res.json));
  const sent = toolNames(fetch.calls[0]);
  for (const n of Server.ALWAYS_SENT) assert.ok(sent.includes(n), `round 1 sends ${n}: ${JSON.stringify(sent)}`);
  assert.equal(fetch.calls[0].tool_choice, 'auto');
  assert.deepStrictEqual(res.json.actions, [{ tool: 'delete_part', part: 'LED1' }]);
  assert.ok(lines.some(l => l.includes('[ask] tools:') && Server.ALWAYS_SENT.every(n => l.includes(n))),
    `the [ask] tools line is logged as today:\n${lines.join('\n')}`);
});

// ── Tool calls written as text (pins: #169's strip is in) ──────────────────
// With no tools offered, deepseek-flash still wrote its edits into the answer
// as text: a DeepSeek DSML block, or XML-style tags named after a tool. The
// server cuts that markup out of an explain reply (stripToolMarkup in
// ai-providers.js, not exported, so through the explain ask), keeps the prose
// around it, and answers the contract's fallback when no text is left. The
// replies are the ones recorded in the live runs on #169 (Mac).

const TOOL_NAMES = Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name);
const TOOL_TAG   = new RegExp(`</?(?:${TOOL_NAMES.join('|')})\\b`);
const FALLBACK   = "I couldn't explain that just now.";   // docs/API-CONTRACT.md, /api/ask explain

// Live run 2: three paragraphs, then a DSML block of three edits.
const DSML_PROSE = [
  "Your LED is in backwards — that's the main problem. LED1's cathode (pin 0, c14) is sitting at 9 V while its anode (c17) is at 0 V, so current can't flow. The LED needs its anode toward the resistor/power and cathode toward GND.",
  "Also, the resistor's left lead (a10) is wired to tp_10, but the LED's anode column (c17) is wired to tn_19 — so the resistor and LED aren't even in the same current path. Let me fix the wiring so it matches a proper one-LED circuit.",
  'Let me flip the LED and rewire it into a clean series path.',
].join('\n\n');
const DSML_CALLS = [
  '<｜｜DSML｜｜ calls>',
  '<｜｜DSML｜｜ invoke name="delete_part">',
  '<｜｜DSML｜｜ parameter name="label" string="true">LED1</｜｜DSML｜｜ parameter>',
  '</｜｜DSML｜｜ invoke>',
  '<｜｜DSML｜｜ invoke name="delete_wire">',
  '<｜｜DSML｜｜ parameter name="wire_id" string="true">W3</｜｜DSML｜｜ parameter>',
  '</｜｜DSML｜｜ invoke>',
  '<｜｜DSML｜｜ invoke name="delete_wire">',
  '<｜｜DSML｜｜ parameter name="wire_id" string="true">W4</｜｜DSML｜｜ parameter>',
  '</｜｜DSML｜｜ invoke>',
  '</｜｜DSML｜｜ calls>',
].join('\n');
// The same block cut off mid-parameter, as a reply that hits max_tokens is.
const DSML_UNCLOSED = DSML_CALLS.slice(0, DSML_CALLS.indexOf('W4'));
const AFTER = 'Then press Simulate again to check it.';

// Live run 1: prose with two runs of XML-style tool tags between it.
const TAGS_FIRST = [
  '<delete_wire id="W3" />',
  '<delete_wire id="W4" />',
  '<delete_part label="LED1" />',
  '<place_led holeA="c14" holeB="c17" color="red" />',
  '<add_wire from="tp_10" to="a10" color="#ef4444" />',
  '<add_wire from="a17" to="tn_17" color="#111111" />',
].join('\n');
const TAGS_SECOND = [
  '<delete_part label="LED1" />',
  '<place_led holeA="c16" holeB="c14" color="red" />',
  '<add_wire from="tp_10" to="a10" color="#ef4444" />',
  '<add_wire from="a16" to="tn_16" color="#111111" />',
].join('\n');
const TAGS_REPLY = [
  "Two problems, and they're both easy fixes:",
  '1. **LED1 is backwards.** Its cathode (pin 0) is at c14 and its anode (pin 1) is at c17. Current needs to flow *into* the anode and *out* of the cathode, so the anode must face the resistor (the + side) and the cathode must face GND. Right now the anode is on the ground side, so no current flows.',
  "2. **The resistor isn't connected to the LED.** R1 spans a10–a14, but LED1's anode is at c17 — column 14 vs column 17, so they're not joined. Also, R1's left lead (a10) is wired to tp_10, which is fine, but the LED's cathode wire goes to tn_19 instead of its own column.",
  "Here's the fix — I'll flip the LED and rewire so the chain is: + rail → R1 → LED1 anode → LED1 cathode → GND.",
  'Let me make those changes now.',
  TAGS_FIRST,
  "Wait — I need to check the geometry before I commit. R1 sits at a10–a14, so its right lead is in column 14. For the LED to be in series, its **anode** must be in column 14 (same node as R1's right lead), and its **cathode** in a column further right that goes to GND.",
  'So LED1 should be: anode at c14, cathode at c16 (2 columns apart). Let me redo that properly.',
  TAGS_SECOND,
  'Now the path is: BAT1.0 → tp_3 → (rail) → tp_10 → a10 → R1 → a14 → c14 (LED anode) → LED → c16 (cathode) → a16 → tn_16 → (rail) → tn_3 → BAT1.1. ',
  "**What was wrong:** LED1 was reversed (anode on the ground side) and its anode column (17) didn't line up with the resistor's right lead (column 14), so the two parts weren't in the same node.",
  "**What I changed:** Flipped LED1 so the anode is at c14 (sharing R1's column) and the cathode at c16, then wired tp_10 → a10 for power and a16 → tn_16 for ground. The LED should light up now — give it a run and let me know!",
].join('\n\n');

// A later live run's plain answer: nothing to cut.
const PLAIN = [
  'Your LED1 is backwards. The Simulation says: "LED is backwards. Current cannot flow from cathode to anode." LED1\'s cathode is in c14 and its anode is in c17, so the anode sits on the ground side (0.00 V) and the cathode on the 9 V side.',
  'To fix it by hand: pull LED1 out and turn it around, so the anode (longer leg) goes in c14 and the cathode (shorter leg, flat side) goes in c17. Then current can flow from the 9 V rail through R1 into the anode and out the cathode to ground, and the LED will light.',
].join('\n\n');

// The reply an explain ask shows for one DeepSeek message.
async function explainReply(message) {
  vi.stubGlobal('fetch', scriptedDeepSeek([message]));
  const res = await post({ explain: true });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepStrictEqual(res.json.actions, [], 'an explain ask queues nothing');
  return res.json.reply;
}

test.each([
  ['a closed DSML block at the end (live run 2)',            DSML_PROSE + '\n\n' + DSML_CALLS,                  DSML_PROSE],
  ['a DSML block cut off at the end, never closed',          DSML_PROSE + '\n\n' + DSML_UNCLOSED,               DSML_PROSE],
  ['a closed DSML block mid-reply, with prose after it',     DSML_PROSE + '\n\n' + DSML_CALLS + '\n\n' + AFTER, DSML_PROSE + '\n\n' + AFTER],
])('pin: explain reply with %s: the block is cut and the prose stays', async (_, content, want) => {
  const reply = await explainReply(says(content));
  assert.doesNotMatch(reply, /DSML/, 'no DSML markup reaches the chat');
  assert.equal(reply, want);
});

test('pin: explain reply with XML-style tool tags (live run 1): every tool tag is cut and every paragraph of prose stays', async () => {
  for (const n of ['delete_wire', 'delete_part', 'place_led', 'add_wire']) assert.ok(TOOL_NAMES.includes(n), `${n} is a tool`);
  const reply = await explainReply(says(TAGS_REPLY));
  assert.doesNotMatch(reply, TOOL_TAG, 'no tag named after a tool reaches the chat');
  const prose = TAGS_REPLY.split('\n\n').filter(p => !p.startsWith('<')).map(p => p.trim());
  assert.equal(reply, prose.join('\n\n'));
});

test.each([
  ['a plain answer (live run)',              PLAIN],
  ['an HTML tag that is no tool: <b>',       'LED1 is <b>backwards</b>: its cathode is in c14 and its anode in c17.'],
  ['a comparison, not a tag: a<b',           'An LED only conducts when its anode is above its cathode; here a<b, so LED1 stays dark.'],
  ['tool names in prose, not in a tag',      'I can only explain here, so I won\'t run delete_part or place_led: pull LED1 out and turn it around by hand.'],
])('pin: explain reply with %s comes back unchanged', async (_, content) => {
  for (const n of ['delete_part', 'place_led']) assert.ok(TOOL_NAMES.includes(n), `${n} is a tool`);
  assert.equal(await explainReply(says(content)), content);
});

test.each([
  ['only a DSML block',                     says(DSML_CALLS)],
  ['only an unclosed DSML block',           says(DSML_UNCLOSED)],
  ['only tool tags',                        says(TAGS_FIRST + '\n\n' + TAGS_SECOND)],
  ['no text at all',                        says('')],
  ['a native tool call and no text',        { content: null, tool_calls: [call('d1', 'delete_part', { part: 'LED1' })] }],
])('pin: explain reply with %s becomes the fallback answer', async (_, message) => {
  assert.equal(await explainReply(message), FALLBACK);
});

// An explain ask goes at temperature 0; any other ask keeps 0.3 on every round.
test.each([
  ['explain: true',    0,   { explain: true }],
  ['no explain field', 0.3, {}],
  ['explain: false',   0.3, { explain: false }],
])('pin: %s sends every DeepSeek request at temperature %s', async (_, want, extra) => {
  const fetch = scriptedDeepSeek([{ content: '', tool_calls: [call('f1', 'delete_part', { part: 'LED1' })] }, says('Removed LED1.')]);
  vi.stubGlobal('fetch', fetch);
  const res = await post(extra);

  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.ok(fetch.calls.length >= 1, 'DeepSeek was asked');
  assert.deepStrictEqual(fetch.calls.map(b => b.temperature), fetch.calls.map(() => want));
});
