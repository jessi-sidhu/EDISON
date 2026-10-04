// Tests for backend/server.js.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');

test('finishAIReply drops malformed actions, fills an empty reply and flags an unwired battery', () => {
  const out = Server.finishAIReply({ reply: '', actions: [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'battery_0_pin0' },              // no "to": malformed
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a7' },
  ] });
  assert.deepEqual(out.actions.map(a => a.tool), ['place_battery', 'place_resistor']);
  assert.match(out.reply, /built the circuit/);
  assert.match(out.reply, /battery_0_pin0 is not wired/);
});

// ── Battery by label form (BAT1.0), issue #8 ───────────────────────────────

// The recorded single-LED build, with the battery wired as ref(pin).
const ledBuild = ref => [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: ref(0), to: 'tp_2', color: 'red' },
  { tool: 'add_wire', from: ref(1), to: 'tn_8', color: 'black' },
  { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
  { tool: 'place_led', holeA: 'a8', holeB: 'a6' },
  { tool: 'add_wire', from: 'tp_2', to: 'a2', color: 'red' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
];

test('findCircuitProblems flags a short across BAT1.0 and BAT1.1', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'BAT1.1', color: 'red' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /short/i);
  assert.doesNotMatch(out.reply, /not wired/, 'both battery pins are wired; the problem is the short');
});

test('a single LED wired from BAT1.0 and BAT1.1 has no problems', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: ledBuild(k => `BAT1.${k}`) });
  assert.equal(out.reply, 'Built it.');
});

test('the same LED wired from battery_0_pin0 and battery_0_pin1 still has no problems', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: ledBuild(k => `battery_0_pin${k}`) });
  assert.equal(out.reply, 'Built it.');
});

test('a battery with only BAT1.0 wired is flagged for its unwired negative pin', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /(BAT1\.1|battery_0_pin1) is not wired/);
  assert.doesNotMatch(out.reply, /(BAT1\.0|battery_0_pin0) is not wired/, 'BAT1.0 is wired to tp_2');
});

test('the system prompt teaches the label form for battery pins', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  const prompt = src.slice(src.indexOf('const SYSTEM_PROMPT'), src.indexOf("].join('\\n');", src.indexOf('const SYSTEM_PROMPT')));
  assert.match(prompt, /BAT1\.0/);
  assert.match(prompt, /BAT1\.1/);
  assert.doesNotMatch(prompt, /battery_0_pin/);
});

test('requiring the server does not start it listening', () => {
  assert.ok(Server.server, 'server.js should export its http server');
  assert.equal(Server.server.listening, false);
});

describe('over HTTP', () => {
  let base;
  beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${Server.server.address().port}`;
    r();
  })));
  afterAll(() => new Promise(r => Server.server.close(r)));

  test('rejects a body over 256 KB with 413 and keeps serving', async () => {
    const res = await fetch(base + '/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(300 * 1024),
    });
    assert.equal(res.status, 413);
    assert.equal((await fetch(base + '/api/health')).status, 200);
  });

  test('the unused OAuth and Cloudant routes are gone', async () => {
    assert.equal((await fetch(base + '/api/auth/google', { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(base + '/api/auth/callback?code=x')).status, 404);
    assert.equal((await fetch(base + '/api/circuits')).status, 404);
  });
});

// The proxy appends the address it saw to whatever X-Forwarded-For the client
// sent, so only the rightmost entry can be trusted: a client can put anything
// to its left to dodge the rate limit.
test('clientKey trusts only the proxy-added X-Forwarded-For entry, and only when TRUST_PROXY=1', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, socket: { remoteAddress: '10.0.0.9' } };
  delete process.env.TRUST_PROXY;
  assert.equal(Server.clientKey(req), '10.0.0.9');
  process.env.TRUST_PROXY = '1';
  assert.equal(Server.clientKey(req), '1.2.3.4');
  delete process.env.TRUST_PROXY;
});
