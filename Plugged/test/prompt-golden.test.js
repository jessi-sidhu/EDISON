// Golden files for what the server sends DeepSeek (issue #70). Any change to
// the demo request's system prompt or tools fails here with the first
// differing lines, so a prompt change can't slip through unseen. Today's
// prompt (after #34, real-AI demo check 3/3) is the intentional baseline.
//
// How it works: each request goes through the real path, as in
// test/deepseek-loop.test.js: AI_PROVIDER=deepseek, the real server on a
// free port, POST /api/ask on an empty board, and a fake global fetch that
// keeps the first body it is sent. messages[0].content (the system prompt)
// and tools are recorded exactly as sent, in sent order.
//
// Golden layout (test/fixtures/prompts/<name>.txt):
//   request: <the user's message>
//   --- system prompt ---
//   <the system prompt>
//   --- tools ---
//   <one JSON tool per line, in the order sent>
//
// UPDATE_GOLDEN=1 npm test rewrites the golden files instead of comparing.

const assert = require('node:assert');
const fs     = require('node:fs');
const http   = require('node:http');
const path   = require('node:path');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here
const Server = require('../backend/server.js');

const GOLDEN_DIR = path.join(__dirname, 'fixtures', 'prompts');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const CASES = {
  demo:  { file: 'demo-led.txt',     request: 'Build a single LED circuit with a current-limiting resistor.' },
  bench: { file: 'bench-supply.txt', request: 'Power an LED from the bench supply at 5 V with a series resistor.' },
};

// The demo request's system prompt + JSON tools, in characters. Today's size
// is 14,934 (10,066 prompt + 4,868 tools; × 1.15 = 17,174.1, rounded up).
// Raise it only on purpose.
const DEMO_BUDGET = 17175;

const CHANGED = 'The AI prompt changed. If this is intended, run UPDATE_GOLDEN=1 npm test, '
  + 'review the diff in the commit, and run the real-AI demo check (3 runs) before /ship.';

let base;
const sent = {};   // case key → the first body sent to DeepSeek

// POST /api/ask with node:http, so the fake global fetch only sees DeepSeek.
function ask(message, markdown = '') {
  const body = JSON.stringify({ message, markdown, history: [] });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: base, path: '/api/ask', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(text) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Send one request and keep the first body DeepSeek would get. The fake
// answers with plain text, so there is only one round.
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
    for (const [key, c] of Object.entries(CASES)) sent[key] = await capture(c.request);
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
const toolsOf = body => body.tools || [];
const toolNames = body => toolsOf(body).map(t => t.function.name);

function render(request, body) {
  return [
    `request: ${request}`,
    '--- system prompt ---',
    systemOf(body),
    '--- tools ---',
    ...toolsOf(body).map(t => JSON.stringify(t)),
  ].join('\n') + '\n';
}

// A long line (the tools are one JSON object each) is cut to a window around
// `col`, so the report stays readable.
function clip(line, col = 0, width = 160) {
  if (line === undefined) return '<no line>';
  if (line.length <= width) return line;
  const start = Math.max(0, Math.min(col - width / 2, line.length - width));
  return (start > 0 ? '…' : '') + line.slice(start, start + width) + (start + width < line.length ? '…' : '');
}

// The first differing line, with 2 lines of context each side, from both.
function firstDiff(expected, actual, file) {
  const exp = expected.split('\n');
  const act = actual.split('\n');
  let i = 0;
  while (i < exp.length && i < act.length && exp[i] === act[i]) i++;
  const e = exp[i] || '';
  const a = act[i] || '';
  let col = 0;
  while (col < e.length && col < a.length && e[col] === a[col]) col++;
  const show = (lines, tag) => {
    const out = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(Math.max(lines.length - 1, i), i + 2); k++) {
      const mark = k === i ? '>' : ' ';
      out.push(`${mark} ${String(k + 1).padStart(4)} | ${clip(lines[k], k === i ? col : 0)}`);
    }
    return [`${tag}:`, ...out].join('\n');
  };
  return [
    CHANGED,
    '',
    `${file}: first difference at line ${i + 1}, column ${col + 1}.`
      + ` Golden has ${exp.length} lines, the server now sends ${act.length}.`,
    show(exp, `golden (${file})`),
    show(act, 'sent now'),
  ].join('\n');
}

// Compare what is sent with the golden file, or write it with UPDATE_GOLDEN=1.
function checkGolden(key) {
  const { file, request } = CASES[key];
  const goldenPath = path.join(GOLDEN_DIR, file);
  const actual = render(request, sent[key]);
  if (UPDATE) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(goldenPath, actual);
    return;
  }
  if (!fs.existsSync(goldenPath)) {
    assert.fail(`The golden file ${path.relative(process.cwd(), goldenPath)} is missing. `
      + 'Run UPDATE_GOLDEN=1 npm test to create it, review it, and commit it.');
  }
  const expected = fs.readFileSync(goldenPath, 'utf8');
  if (expected !== actual) assert.fail(firstDiff(expected, actual, `test/fixtures/prompts/${file}`));
}

test('the demo request sends exactly the golden prompt and tools (demo-led.txt)', () => {
  checkGolden('demo');
});

test('the bench supply request sends exactly the golden prompt and tools (bench-supply.txt)', () => {
  checkGolden('bench');
});

test('the demo request stays inside its size budget (system prompt + tools)', () => {
  const body = sent.demo;
  const size = systemOf(body).length + JSON.stringify(toolsOf(body)).length;
  assert.ok(size <= DEMO_BUDGET,
    `The demo request's system prompt + tools is ${size} characters, over the budget of ${DEMO_BUDGET}. `
    + 'Every part of the prompt and every tool is sent with every request, so growth here makes every '
    + 'request slower and costlier and gives the model more to get wrong. Trim it, or raise DEMO_BUDGET '
    + 'on purpose (agreed on the issue) and run the real-AI demo check (3 runs) before /ship.');
});

test('the demo sends place_led and place_resistor but not place_bench_supply; the bench request sends place_bench_supply', () => {
  const demo = toolNames(sent.demo);
  assert.ok(demo.includes('place_led'), `the demo sends place_led: ${JSON.stringify(demo)}`);
  assert.ok(demo.includes('place_resistor'), `the demo sends place_resistor: ${JSON.stringify(demo)}`);
  assert.ok(!demo.includes('place_bench_supply'), `the demo should not send place_bench_supply: ${JSON.stringify(demo)}`);
  const bench = toolNames(sent.bench);
  assert.ok(bench.includes('place_bench_supply'), `the bench request sends place_bench_supply: ${JSON.stringify(bench)}`);
});
