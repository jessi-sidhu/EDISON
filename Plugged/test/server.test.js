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
