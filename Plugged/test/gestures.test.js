// The gesture dispatcher, circuit3d/js/gestures.js (issue #26). A click or
// a scroll on a part's mesh maps to one of its controls (PartDefinition
// `gestures`); this module decides when to re-simulate and when to record an
// undo step. It is pure: the clock, the timers, the simulation and the undo
// history are all handed in, so it runs here with a fake clock.
//
// Rules (docs/API-CONTRACT.md → PartDefinition `gestures`):
//   - While a gesture continues, re-simulate at most once per 100 ms, plus
//     one final run when it stops.
//   - A scroll ends 300 ms after its last tick; a click ends on release().
//   - One gesture = one undo step: pushHistory once, before its first change.
//
// The API the builder matches (chosen here):
//   Gestures.create({ now, setTimeout, clearTimeout, simulate, pushHistory,
//                     throttleMs = 100, scrollEndMs = 300 })
//     → { tick(kind, apply), release() }
//   tick(kind, apply)  kind 'click' | 'scroll'. Starts a gesture if none is
//                      running (pushHistory() first), then calls apply() (the
//                      control change), then simulate() unless the last run
//                      of this gesture was under throttleMs ago. A scroll
//                      tick (re)arms the scrollEndMs timer.
//   release()          ends the gesture: one final simulate() and nothing
//                      pending. A release with no gesture running does nothing.
// Loading: Node module.exports = Gestures; browser window.Gestures.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const FILE = path.join(__dirname, '..', 'circuit3d', 'js', 'gestures.js');

let Gestures = null;
let loadError = null;
try { Gestures = require('../circuit3d/js/gestures.js'); } catch (e) { loadError = e; }

function need() {
  assert.ok(!loadError, 'circuit3d/js/gestures.js must exist and load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof Gestures.create, 'function', 'gestures.js must export Gestures.create(opts)');
  return Gestures;
}

// A fake clock with timers, and a log of every call the dispatcher makes.
function rig(extra) {
  let t = 0;
  let nextId = 1;
  const timers = new Map();   // id → { at, fn }
  const log = [];             // ['history', t] | ['apply', t, n] | ['simulate', t, n]
  let value = 0;              // the control's value: apply() bumps it; simulate() reads it

  const clock = {
    now:          () => t,
    setTimeout:   (fn, ms) => { const id = nextId++; timers.set(id, { at: t + (ms || 0), fn }); return id; },
    clearTimeout: id => { timers.delete(id); },
  };
  // Move the clock to `to`, firing every timer that falls due on the way, in order.
  function advance(to) {
    for (;;) {
      let due = null;
      for (const [id, x] of timers) if (x.at <= to && (!due || x.at < due[1].at)) due = [id, x];
      if (!due) break;
      timers.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = to;
  }
  const g = need().create(Object.assign({
    now:          clock.now,
    setTimeout:   clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    simulate:     () => log.push(['simulate', t, value]),
    pushHistory:  () => log.push(['history', t]),
    throttleMs:   100,
    scrollEndMs:  300,
  }, extra || {}));
  assert.ok(g && typeof g.tick === 'function' && typeof g.release === 'function',
    'Gestures.create(opts) must return { tick(kind, apply), release() }');

  const apply = () => { value++; log.push(['apply', t, value]); };
  const at = (ms, fn) => { advance(ms); fn(); };
  const sims = () => log.filter(e => e[0] === 'simulate');
  const histories = () => log.filter(e => e[0] === 'history');
  return { g, apply, at, advance, log, sims, histories, value: () => value };
}

test('gestures.js exists and loads in Node with Gestures.create', () => {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/gestures.js must exist');
  need();
});

test('10 scroll ticks within 100 ms: 1–2 re-simulations, one undo step, and the last run sees the final value', () => {
  const { g, apply, at, advance, sims, histories, value } = rig();
  for (let i = 0; i < 10; i++) at(i * 10, () => g.tick('scroll', apply));   // t = 0, 10 … 90
  advance(90 + 300 + 50);                                                    // the scroll has ended

  const runs = sims();
  assert.ok(runs.length >= 1 && runs.length <= 2, `expected 1–2 re-simulations, got ${runs.length}: ${JSON.stringify(runs)}`);
  assert.equal(histories().length, 1, `one pushHistory for the one gesture, got ${histories().length}`);
  assert.equal(value(), 10, 'every tick applied its change');
  assert.equal(runs[runs.length - 1][2], 10, `the last simulation must see all 10 changes: ${JSON.stringify(runs)}`);
});

test('the undo step is recorded before the first change, and each run comes after the change it shows', () => {
  const { g, apply, at, advance, log } = rig();
  at(0, () => g.tick('scroll', apply));
  at(40, () => g.tick('scroll', apply));
  advance(1000);
  const kinds = log.map(e => e[0]);
  assert.equal(kinds[0], 'history', `pushHistory comes first: ${JSON.stringify(log)}`);
  assert.equal(kinds[1], 'apply', `then the first change: ${JSON.stringify(log)}`);
  assert.equal(kinds.filter(k => k === 'history').length, 1);
});

test('a long scroll (a tick every 10 ms for 1 s) re-simulates while it goes, never twice within 100 ms', () => {
  const { g, apply, at, advance, sims } = rig();
  for (let t = 0; t < 1000; t += 10) at(t, () => g.tick('scroll', apply));
  const during = sims().map(e => e[1]);
  assert.ok(during.length >= 5, `the part should update while scrolling, not only at the end: runs at ${JSON.stringify(during)}`);
  for (let i = 1; i < during.length; i++) {
    assert.ok(during[i] - during[i - 1] >= 100, `runs at ${during[i - 1]} and ${during[i]} ms are under 100 ms apart`);
  }
  advance(990 + 300);
  const all = sims();
  assert.equal(all.length, during.length + 1, `one final run when the scroll ends: ${JSON.stringify(all.map(e => e[1]))}`);
  assert.equal(all[all.length - 1][2], 100, 'the final run sees all 100 changes');
});

test('a scroll ends 300 ms after its last tick: a tick 299 ms later is the same gesture, 300 ms later a new one', () => {
  const same = rig();
  same.at(0,   () => same.g.tick('scroll', same.apply));
  same.at(299, () => same.g.tick('scroll', same.apply));
  same.at(598, () => same.g.tick('scroll', same.apply));
  assert.equal(same.histories().length, 1, 'ticks 299 ms apart keep one gesture going');

  const next = rig();
  next.at(0,   () => next.g.tick('scroll', next.apply));
  next.at(300, () => next.g.tick('scroll', next.apply));
  assert.equal(next.histories().length, 2, 'a tick 300 ms after the last one starts a new gesture, a new undo step');
});

test('when a scroll ends (300 ms after its last tick) it simulates once more, then stays quiet', () => {
  const { g, apply, at, advance, sims } = rig();
  at(0,  () => g.tick('scroll', apply));
  at(50, () => g.tick('scroll', apply));
  advance(349);
  const before = sims().length;
  advance(350);
  const after = sims();
  assert.equal(after.length, before + 1, `the scroll ends at 350 ms (50 + 300) with one final run: ${JSON.stringify(after)}`);
  assert.equal(after[after.length - 1][2], 2, 'the final run sees both changes');
  advance(5000);
  assert.equal(sims().length, after.length, 'nothing runs after the gesture has ended');
});

test('release() after ticks simulates once more, and ends the gesture', () => {
  const { g, apply, at, advance, sims, histories } = rig();
  at(0,  () => g.tick('scroll', apply));
  at(10, () => g.tick('scroll', apply));
  const before = sims().length;
  at(20, () => g.release());
  const after = sims();
  assert.equal(after.length, before + 1, `release runs the simulation once more: ${JSON.stringify(after)}`);
  assert.equal(after[after.length - 1][2], 2, 'and that run sees the last change');
  advance(5000);
  assert.equal(sims().length, after.length, 'no scroll-end run after a release');
  assert.equal(histories().length, 1);
});

test('a click: one undo step, the change simulated; a release with no gesture running does nothing', () => {
  const { g, apply, at, sims, histories, log } = rig();
  at(0, () => g.release());
  assert.deepStrictEqual(log, [], 'release() with nothing running: no run, no undo step');

  at(10, () => { g.tick('click', apply); g.release(); });
  assert.equal(histories().length, 1);
  const runs = sims();
  assert.ok(runs.length >= 1 && runs.length <= 2, `a click runs the simulation once or twice: ${JSON.stringify(runs)}`);
  assert.equal(runs[runs.length - 1][2], 1, 'the run sees the click');
});

test('each new gesture after one has ended pushes its own undo step', () => {
  const { g, apply, at, advance, histories } = rig();
  at(0,  () => { g.tick('click', apply); g.release(); });
  at(50, () => { g.tick('click', apply); g.release(); });
  assert.equal(histories().length, 2, 'two clicks, two undo steps');
  at(100, () => g.tick('scroll', apply));
  at(120, () => g.tick('scroll', apply));
  advance(1000);
  at(1000, () => g.tick('scroll', apply));
  assert.equal(histories().length, 4, 'a scroll, then another after it ended: two more undo steps');
});

test('the throttle and scroll end come from the options (throttleMs, scrollEndMs)', () => {
  const { g, apply, at, advance, sims, histories } = rig({ throttleMs: 20, scrollEndMs: 50 });
  at(0,  () => g.tick('scroll', apply));
  at(25, () => g.tick('scroll', apply));
  assert.equal(sims().length, 2, `with throttleMs 20, ticks 25 ms apart each run: ${JSON.stringify(sims())}`);
  advance(74);
  at(74, () => g.tick('scroll', apply));
  assert.equal(histories().length, 1, '49 ms after the last tick is still the same gesture');
  advance(74 + 50);
  at(200, () => g.tick('scroll', apply));
  assert.equal(histories().length, 2, 'with scrollEndMs 50, a tick later starts a new gesture');
});

test('in the browser gestures.js attaches window.Gestures and touches no page or App', () => {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/gestures.js must exist');
  const src = fs.readFileSync(FILE, 'utf8');
  assert.match(src, /module\.exports/, 'exports for Node');
  assert.match(src, /\.Gestures\s*=/, 'attaches Gestures on window in the browser');
  assert.doesNotMatch(src, /\bdocument\b/, 'pure: no document');
  assert.doesNotMatch(src, /\bApp\b/, 'pure: no App; app.js hands in simulate and pushHistory');
});
