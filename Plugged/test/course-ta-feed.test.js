// The TA view's live feed endpoint (issue #155):
// GET /api/course/ta-feed on the local server.
//
// Contract (docs/API-CONTRACT.md → Edison and the course hub → Dummy endpoints):
//   GET /api/course/ta-feed → 200 { demo: true, events: [{ at: <ISO>, lab, step, label, text }] }
//   sample events, timestamps relative to now. Callers fall back to
//   CourseData.feed when it 404s (deployed hosting has no Node server).
//
// Shapes these tests assume (from the issue; stated so the
// builder matches them):
// - 5 to 8 events, newest first, every `at` an ISO string within the last 30
//   minutes of the server's clock.
// - `lab` names one of the course's labs (its code, LAB-02, or its id, lab2),
//   `step` is a lab step number (a positive integer), `label` is a part label
//   (U1, R2, LED1) and `text` says what went wrong.
// - The events rotate: two requests 15 s apart on the server's clock lead
//   with a different event. (The page polls every 15 s, so this is what makes
//   its feed visibly change; e2e/edison-ta.spec.js checks the page side.)
// - Only GET answers. A POST is 404 or 405.
//
// How: the real server module on a random port (as test/server.test.js and
// test/ai-timeout.test.js do), with AI_PROVIDER=fixture so nothing calls out.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
process.env.RECORD_FIXTURES = '0';
const Server     = require('../backend/server.js');
const CourseData = require('../edison/course-data.js');

const PATH        = '/api/course/ta-feed';
const HALF_HOUR   = 30 * 60 * 1000;
const CLOCK_SLACK = 2000;   // the response is read a moment after the server stamped it
const ISO         = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

let base;
beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${Server.server.address().port}`;
  r();
})));
afterAll(() => new Promise(r => Server.server.close(r)));
afterEach(() => { vi.useRealTimers(); });

async function getFeed() {
  const res = await fetch(base + PATH);
  assert.equal(res.status, 200, `GET ${PATH} answers 200 (got ${res.status})`);
  assert.match(res.headers.get('content-type') || '', /application\/json/, 'the feed is JSON');
  return res.json();
}

const LAB_NAMES = CourseData.labs.flatMap(l => [l.code, l.id]);
const sameEvent = (a, b) => a.lab === b.lab && a.step === b.step && a.label === b.label && a.text === b.text;

test('GET /api/course/ta-feed answers { demo: true, events } with 5–8 sample events', async () => {
  const body = await getFeed();
  expect(body.demo, 'the feed is marked demo').toBe(true);
  expect(Array.isArray(body.events), 'events is a list').toBe(true);
  expect(body.events.length, 'number of events').toBeGreaterThanOrEqual(5);
  expect(body.events.length, 'number of events').toBeLessThanOrEqual(8);
  for (const [i, e] of body.events.entries()) {
    expect(LAB_NAMES, `event ${i} lab`).toContain(e.lab);
    expect(Number.isInteger(e.step) && e.step > 0, `event ${i} step ${e.step} is a positive whole number`).toBe(true);
    expect(e.label, `event ${i} label`).toMatch(/^[A-Z]+\d+$/);
    expect(typeof e.text, `event ${i} text`).toBe('string');
    expect(e.text.trim().length, `event ${i} text`).toBeGreaterThan(0);
  }
});

test('every event is stamped within the last 30 minutes, as ISO, newest first', async () => {
  const body = await getFeed();
  const now = Date.now();
  const times = body.events.map((e, i) => {
    expect(typeof e.at, `event ${i} at`).toBe('string');
    expect(e.at, `event ${i} at is an ISO timestamp`).toMatch(ISO);
    const t = Date.parse(e.at);
    expect(Number.isNaN(t), `event ${i} at parses: ${e.at}`).toBe(false);
    expect(t, `event ${i} at ${e.at} is not in the future`).toBeLessThanOrEqual(now + CLOCK_SLACK);
    expect(t, `event ${i} at ${e.at} is within the last 30 minutes`).toBeGreaterThanOrEqual(now - HALF_HOUR - CLOCK_SLACK);
    return t;
  });
  const sorted = [...times].sort((a, b) => b - a);
  expect(times, 'events are newest first').toEqual(sorted);
});

test('the feed rotates: 15 s later on the server clock it leads with a different event, still stamped relative to now', async () => {
  // Only Date is faked: the HTTP server's sockets and timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  const t0 = Date.UTC(2026, 9, 2, 14, 0, 7);
  vi.setSystemTime(t0);
  const first = (await getFeed()).events;
  vi.setSystemTime(t0 + 15000);
  const later = (await getFeed()).events;

  expect(first.length, 'events at t0').toBeGreaterThan(0);
  expect(later.length, 'events 15 s later').toBeGreaterThan(0);
  expect(sameEvent(first[0], later[0]),
    `the lead event changes after 15 s (was "${first[0].text}", still "${later[0].text}")`).toBe(false);
  for (const [i, e] of later.entries()) {
    const t = Date.parse(e.at);
    expect(t <= t0 + 15000 && t >= t0 + 15000 - HALF_HOUR,
      `event ${i} at ${e.at} is within the 30 minutes before the server's now`).toBe(true);
  }
});

// Pin: today any POST falls through to the 404 at the end of the server. It
// guards the route against being written method-blind.
test('pin: POST /api/course/ta-feed is not a feed (404 or 405)', async () => {
  const res = await fetch(base + PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect([404, 405], `POST ${PATH} status`).toContain(res.status);
});
