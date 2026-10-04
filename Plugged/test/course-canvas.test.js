// The Canvas dummy endpoint (issue #154): the Grades section's
// "Push grades to Canvas" posts here, and the local server answers like a
// sync that worked, marked as a demo. There is no real Canvas or LTI.
// The page side (the button, the status line and its fallback when the
// route is missing on deployed hosting) is e2e/edison-grades.spec.js.
// Its own file so the TA feed's tests (#155) don't clash with it.
//
// Shapes these tests assume (docs/API-CONTRACT.md, "Dummy endpoints"):
// - POST /api/course/canvas/sync → 200 { ok: true, demo: true, syncedAt }
//   where syncedAt is an ISO 8601 UTC timestamp (Date#toISOString) of now.
// - Any other method on that path is not a sync: 404 or 405, never 200.
// - Any other /api/course/* path is a 404.
//
// How: the real HTTP server from backend/server.js on a free port, requests
// through node:http, as test/ai-timeout.test.js does. No network, no key.

const assert = require('node:assert');
const http   = require('node:http');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
process.env.RECORD_FIXTURES = '0';
const Server = require('../backend/server.js');

const SYNC = '/api/course/canvas/sync';
const ISO  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

let port;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  port = Server.server.address().port;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));
beforeEach(() => { for (const m of ['log', 'info', 'warn', 'error']) vi.spyOn(console, m).mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

// One request; resolves { status, text, json } (json is null when the body
// isn't JSON). Destroyed after 2 s so a hung route fails here, not the runner.
function send(method, path, body) {
  return new Promise((resolve, reject) => {
    const headers = body === undefined ? {}
      : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.setTimeout(2000, () => req.destroy(new Error(`${method} ${path} had no answer in 2 s`)));
    req.on('error', reject);
    req.end(body);
  });
}

test('POST /api/course/canvas/sync answers 200 { ok: true, demo: true, syncedAt } with syncedAt an ISO time of now', async () => {
  const before = Date.now();
  const res = await send('POST', SYNC, '{}');
  const after = Date.now();

  assert.equal(res.status, 200, `POST ${SYNC} answered ${res.status}: ${res.text}`);
  assert.ok(res.json, `the answer is not JSON: ${res.text}`);
  assert.strictEqual(res.json.ok, true, `ok is ${JSON.stringify(res.json.ok)} in ${res.text}`);
  assert.strictEqual(res.json.demo, true, `demo is ${JSON.stringify(res.json.demo)} in ${res.text}`);

  const at = res.json.syncedAt;
  assert.equal(typeof at, 'string', `syncedAt is ${JSON.stringify(at)}, not an ISO string`);
  assert.match(at, ISO, 'syncedAt is an ISO 8601 UTC timestamp');
  const t = Date.parse(at);
  assert.ok(Number.isFinite(t), `syncedAt "${at}" does not parse as a date`);
  assert.ok(t >= before - 5000 && t <= after + 5000,
    `syncedAt ${at} is ${Math.round((t - before) / 1000)} s from the request; it should be within 5 s of now`);
});

test('POST /api/course/canvas/sync with no body still answers the demo sync', async () => {
  const res = await send('POST', SYNC);
  assert.equal(res.status, 200, `POST ${SYNC} with no body answered ${res.status}: ${res.text}`);
  assert.ok(res.json && res.json.ok === true && res.json.demo === true, res.text);
});

// Pin (passes today): a broad /api/course/ handler or a method-blind match
// could turn these into 200s.
test('pin: GET on the sync path is not a sync (404 or 405), and an unknown /api/course/ path is a 404', async () => {
  const get = await send('GET', SYNC);
  assert.ok([404, 405].includes(get.status), `GET ${SYNC} answered ${get.status}, expected 404 or 405: ${get.text}`);
  assert.ok(!(get.json && get.json.ok === true), `GET ${SYNC} claimed a sync: ${get.text}`);

  for (const method of ['GET', 'POST']) {
    const res = await send(method, '/api/course/x', method === 'POST' ? '{}' : undefined);
    assert.equal(res.status, 404, `${method} /api/course/x answered ${res.status}: ${res.text}`);
  }
});
