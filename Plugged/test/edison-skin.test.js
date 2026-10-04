// The editor's Edison skin (issue #148, Edison E2): edison/skin.js wraps the
// measured values in Edison's chat replies so they show in B612 on
// --mask, and finds the part labels a reply names so it can draw a leader to
// that part (spec §4 "Edison's annotations", §5.4). The pure halves are tested
// here; the page half (the skin on the real editor, the value on screen, the
// leader ending on LED1, classic untouched after a switch, and ?ask=) is
// e2e/edison-skin.spec.js.
//
// Run with:  npm test
//
// API these tests are written against (plan: docs/superpowers/plans/
// 2026-10-01-edison-ui-revamp.md → Task E2), UMD like simulate.js:
// window.EdisonSkin in the page (wiring itself only when <html data-ui> is
// "edison"), module.exports in Node.
//   highlightValues(html) → html. Every value (a number, an optional sign
//                           incl. U+2212, an optional SI prefix and a unit)
//                           in the text between tags becomes
//                           <span class="ed-num ed-val">…</span>. Tags are
//                           never touched.
//   labelsIn(text, labels) → the labels that appear in text as whole words.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const Chat   = require('../circuit3d/js/chat.js');

// Loaded per test, so a module that can't load in Node fails each test by name.
function Skin() {
  let mod;
  try { mod = require('../edison/skin.js'); } catch (e) {
    assert.fail(`edison/skin.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  for (const fn of ['highlightValues', 'labelsIn'])
    assert.strictEqual(typeof mod[fn], 'function', `EdisonSkin.${fn} is a function (exports: ${Object.keys(mod).join(', ')})`);
  return mod;
}

const val = s => `<span class="ed-num ed-val">${s}</span>`;

test.each([
  ['LED1 gets 14.9 mA.', `LED1 gets ${val('14.9 mA')}.`],
  ['Vout is −5.0 V and 1.99 Vpp', `Vout is ${val('−5.0 V')} and ${val('1.99 Vpp')}`],
  ['Use 470 Ω, 10 kΩ or 1 Hz', `Use ${val('470 Ω')}, ${val('10 kΩ')} or ${val('1 Hz')}`],
  ['Step 3 of 5', 'Step 3 of 5'],
  ['<b>12 V</b>', `<b>${val('12 V')}</b>`],
  // Added beyond the plan: a value starts at a word boundary, so a part label
  // followed by a pin name is not a value. Lab 2 is op-amps, and "U1 V+" is
  // how a reply names the TL072's supply pin; "1 V" inside it is no reading.
  ['Wire U1 V+ to the 12 V rail', `Wire U1 V+ to the ${val('12 V')} rail`],
])('highlightValues(%s)', (inp, out) => {
  expect(Skin().highlightValues(inp)).toBe(out);
});

// Added beyond the plan: the html the skin really gets is what chat.js puts
// in an AI bubble, Chat.formatReply's output: escaped (&#39; &amp;) with
// **bold** as <strong>. Entities stay intact and a bold value is wrapped
// inside its <strong>.
test('highlightValues on a reply as chat.js renders it', () => {
  const html = Chat.formatReply("LED1's current is **14.9 mA** & R1 drops 7.0 V");
  expect(Skin().highlightValues(html))
    .toBe(`LED1&#39;s current is <strong>${val('14.9 mA')}</strong> &amp; R1 drops ${val('7.0 V')}`);
});

test('labelsIn finds part labels as whole words only', () => {
  expect(Skin().labelsIn('LED1 is backwards; R1 and R12 are fine', ['LED1', 'R1', 'R2'])).toEqual(['LED1', 'R1']);
});

// Added beyond the plan: the diode registry example has BAT1, D1, R1 and
// LED1 on one board. "LED1" ends in "D1", and the leader must not go to the
// diode.
test('labelsIn does not find D1 inside LED1', () => {
  expect(Skin().labelsIn('LED1 is backwards.', ['BAT1', 'D1', 'R1', 'LED1'])).toEqual(['LED1']);
});

// Page wiring Node can't run (plan Task E2, Step 3): the flag has to set
// <html data-ui> before the first paint, or the editor flashes classic and
// scene.js reads --scene-bg before it applies. So ui-flag.js is a blocking
// script in <head>, ahead of every stylesheet.
test('the editor runs ui-flag.js in <head> before any stylesheet', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'circuit3d', 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const tag = /<script\b[^>]*\bsrc="\.\.\/edison\/ui-flag\.js"[^>]*>/.exec(head);
  const firstCss = head.search(/<link[^>]+rel="stylesheet"/);
  assert.ok(tag, 'circuit3d/index.html has <script src="../edison/ui-flag.js"></script> in <head>');
  assert.doesNotMatch(tag[0], /\b(defer|async)\b|type="module"/, 'ui-flag.js blocks (no defer, async or module), so it runs before the first paint');
  assert.ok(tag.index < firstCss, 'ui-flag.js comes before the first stylesheet in <head>');
});
