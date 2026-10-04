// The Lab HUD's status line (issue #190, Lab HUD 2/4): the grey line under
// "BREADBOARD" in the canvas's title block, in Edison (?ui=edison). Mockup:
// "T 3.08 S / ■ CIRCUIT OPEN / 1 PROBLEM". The pure half is pinned here; the
// page half (the title block over the canvas, the line following a real Run
// and Stop, nothing in classic) is e2e/edison-hud-canvas.spec.js.
//
// Run with:  npm test
//
// API these tests are written against, UMD like simulate.js:
// window.EdisonHudStatus in the page, module.exports in Node.
//   statusLine({ running, t, open, problems }) → string
//     running   bool: the simulation is going (between Run and Stop)
//     t         the sim clock in seconds (a time run's plugged:sim detail.t),
//               or null on a run with no clock (a plain DC solve)
//     open      bool: the circuit is open (no complete path)
//     problems  the mistake checker's count (info rows don't count)
//   The format, segments joined by " / ":
//     "T <t to 2 dp> S"     only when t is a number
//     "● CIRCUIT OPEN" or "● CIRCUIT OK"
//     "<n> PROBLEM" / "<n> PROBLEMS"   only when n > 0
//   Stopped (running false) is just "STOPPED".

const assert = require('node:assert');

// Loaded per test, so a module that can't load in Node fails each test by name.
function Hud() {
  let mod;
  try { mod = require('../edison/hud-status.js'); } catch (e) {
    assert.fail(`edison/hud-status.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  assert.strictEqual(typeof mod.statusLine, 'function', `statusLine is a function (exports: ${Object.keys(mod).join(', ')})`);
  return mod;
}

test.each([
  // The mockup's line, at this run's clock.
  ['running, open, 1 problem',            { running: true, t: 3.11, open: true,  problems: 1 }, 'T 3.11 S / ● CIRCUIT OPEN / 1 PROBLEM'],
  ['running, ok, no problems: no count',  { running: true, t: 0.5,  open: false, problems: 0 }, 'T 0.50 S / ● CIRCUIT OK'],
  ['plural problems',                     { running: true, t: 1.2,  open: true,  problems: 2 }, 'T 1.20 S / ● CIRCUIT OPEN / 2 PROBLEMS'],
  ['ok with a problem (a backwards LED)', { running: true, t: 0.75, open: false, problems: 1 }, 'T 0.75 S / ● CIRCUIT OK / 1 PROBLEM'],
  ['open with no problem rows',           { running: true, t: 2,    open: true,  problems: 0 }, 'T 2.00 S / ● CIRCUIT OPEN'],
  ['the clock at zero',                   { running: true, t: 0,    open: false, problems: 0 }, 'T 0.00 S / ● CIRCUIT OK'],
  ['past a minute: still seconds',        { running: true, t: 65.4, open: false, problems: 0 }, 'T 65.40 S / ● CIRCUIT OK'],
  // A DC solve has no clock, so no T segment.
  ['running with no clock (a DC solve)',  { running: true, t: null, open: false, problems: 0 }, '● CIRCUIT OK'],
  ['no clock, open, 3 problems',          { running: true, t: null, open: true,  problems: 3 }, '● CIRCUIT OPEN / 3 PROBLEMS'],
])('statusLine: %s', (_, state, want) => {
  expect(Hud().statusLine(state)).toBe(want);
});

test.each([
  ['nothing has run',                    { running: false, t: null, open: false, problems: 0 }],
  // After Stop the last frame's clock and problems are gone from the line.
  ['stopped after an open run',          { running: false, t: 3.11, open: true,  problems: 1 }],
  ['stopped after an ok run',            { running: false, t: 0.5,  open: false, problems: 0 }],
])('statusLine: %s → STOPPED', (_, state) => {
  expect(Hud().statusLine(state)).toBe('STOPPED');
});
