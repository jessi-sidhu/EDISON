// What the AI is taught about op-amp inputs and dividers (issue #5,
// TODO task 2). From the 2026-10-03 replay of the AI test set:
//   BANK-11  "a 0.5 V sine" built as amplitude 0, offset 0.5 (a steady
//            0.5 V): the TL072 guide said "offset = DC in" and every TL072
//            recipe used a DC input.
//   BANK-05/10  a 10k/1k divider into a 10 kΩ Rin sagged 1.00 → 0.917 V.
//   (BANK-12's LEDs at 4.9 mA: out of scope; the LED guide is pinned.)
//
// Run with:  npm test
//
// Seams these tests assume (from the issue; stated so the builder matches
// them):
// - parts/tl072.js ai.guide (≤ 400 chars) has a sentence that names a sine
//   input and FG1's `amplitude` (and its frequency), with offset 0; every
//   other sentence that names `offset` is the DC form: it says DC and pairs
//   the offset with amplitude 0. Sentences end at "." or ";" followed by a
//   space or the end (so "FG1.0→IN1+" stays whole).
// - The same guide has a sentence with the divider and its stiffness rule:
//   "stiff", or the resistors at most Rin/10.
// - parts/led.js ai.guide is unchanged: no 10 mA rule (it goes into the
//   demo prompt; dropped from scope).
// - The TL072's ai.recipe (the inverting −10: FG1 → Rin 10 kΩ → IN1−,
//   Rf 100 kΩ IN1− → OUT1, IN1+ on COM, ±12 V) is driven by the 0.5 V sine:
//   FG1 amplitude 0.5, offset 0, frequency 1. A plain solve reads the
//   offset (0 V), so its own `expect` reads ≈ 0 V; the peak and trough are
//   checked here with a time step,
//   Sim.analyze(components, wires, { dt: 1e-3, state: {}, t }).
// - The follower and comparator recipes (ai.recipes) stay DC: amplitude 0
//   and a nonzero offset.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');
const Board = require('../circuit3d/js/board-model.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');

function guideOf(type) {
  const def = Parts.get(type);
  assert.ok(def && def.ai && typeof def.ai.guide === 'string', `${type} has no ai.guide`);
  return def.ai.guide;
}

// "a. b; c." → ['a', 'b', 'c']. A dot with no space after it (FG1.0, 0.5)
// does not end a sentence.
const sentences = s => s.split(/[.;](?=\s|$)/).map(x => x.trim()).filter(Boolean);

// "offset 0" / "offset = 0" / "offset: 0", not "offset 0.5"; the same for amplitude.
const OFFSET_ZERO = /offset\s*[=:]?\s*0(?![.\d])/i;
const AMP_ZERO    = /amp(litude)?\s*[=:]?\s*0(?![.\d])/i;

// ── 1. The TL072 guide: a sine sets amplitude; offset only for DC ─────────

test('the TL072 guide fits 400 characters and has a sentence where a sine input sets FG1 amplitude and frequency, offset 0', () => {
  const guide = guideOf('tl072');
  assert.ok(guide.length <= 400, `the guide is ${guide.length} chars (max 400)`);
  const sine = sentences(guide).filter(s => /\bsine\b/i.test(s) && /amplitude/i.test(s));
  assert.ok(sine.length >= 1, `no sentence names a sine input and its amplitude: ${guide}`);
  assert.ok(sine.some(s => /freq|Hz/i.test(s) && OFFSET_ZERO.test(s)),
    `the sine sentence should set the frequency too, with offset 0: ${JSON.stringify(sine)}`);
});

test('the TL072 guide says "offset" only for a DC input (DC, with amplitude 0) or as the sine\'s offset 0', () => {
  const guide = guideOf('tl072');
  const all = sentences(guide).filter(s => /offset/i.test(s));
  assert.ok(all.length >= 1, `the guide never names the offset, so a DC input is never taught: ${guide}`);
  const isSine = s => /\bsine\b/i.test(s) && OFFSET_ZERO.test(s);
  const isDc   = s => /\bDC\b/.test(s) && AMP_ZERO.test(s);
  const neither = all.filter(s => !isSine(s) && !isDc(s));
  assert.deepStrictEqual(neither, [],
    'sentences that name the offset outside the DC form (DC, amplitude 0) and the sine\'s offset 0, ' +
    'e.g. "offset = DC in" teaches a DC level for every input');
  assert.ok(all.some(isDc), `no sentence teaches the DC form (DC: offset, amplitude 0): ${JSON.stringify(all)}`);
});

// ── 2. The stiff divider; the LED guide stays put ────────────────────────

test('the TL072 guide states the stiff-divider rule: a divider into Rin is stiff (its resistors at most Rin/10)', () => {
  const guide = guideOf('tl072');
  const rule = sentences(guide).filter(s => /divider/i.test(s) && /stiff|Rin\s*\/\s*10\b/i.test(s));
  assert.ok(rule.length >= 1, `no sentence pairs the divider with "stiff" or Rin/10: ${guide}`);
});

// Pin: the LED guide goes into the demo prompt; a 10 mA rule there would
// move the demo LED off the 470 Ω default AI-01/06/08 rely on (dropped from
// issue #5's scope).
test('pin: the LED guide does not name 10 mA (the demo prompt stays put)', () => {
  const guide = guideOf('led');
  assert.doesNotMatch(guide, /\b10\s*mA\b/i, `the LED guide names 10 mA: ${guide}`);
});

// ── 3. A recipe with a sine input; a DC recipe remains ────────────────────

const fg1Of = ex => {
  const fg = (ex.parts || []).find(p => p.type === 'function_generator');
  return fg ? { amplitude: 0, offset: 0, frequency: 1, ...(fg.values || {}) } : null;
};

function tlRecipes() {
  const ai = Parts.get('tl072').ai || {};
  return [ai.recipe, ...(Array.isArray(ai.recipes) ? ai.recipes : [])].filter(Boolean);
}

// The recipe as the AI would build it (its actions through the board
// model), solved as one time step at t seconds.
function solveAt(ex, t) {
  const applied = Board.apply(Board.empty(), recipeActions(ex));
  assert.deepStrictEqual(applied.errors, [], `${ex.name}: every action applies to the board model`);
  const { components, wires } = Board.toSim(applied.board);
  const r = Sim.analyze(components, wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(r.status, 'ok', `${ex.name} at t = ${t} s: status ${r.status}`);
  assert.strictEqual(r.shorted, false, `${ex.name} at t = ${t} s: shorted`);
  return r;
}

test('the TL072 ai.recipe (the inverting −10) is driven by the 0.5 V sine: FG1 amplitude 0.5, offset 0', () => {
  const ex = Parts.get('tl072').ai.recipe;
  const fg = fg1Of(ex);
  assert.ok(fg, `the recipe has no function generator: ${ex.name}`);
  assert.ok(fg.amplitude > 0, `FG1 amplitude expected > 0 (a sine), got ${fg.amplitude} (offset ${fg.offset}): ${ex.name}`);
  assert.strictEqual(fg.amplitude, 0.5, 'FG1 amplitude, the 0.5 V sine');
  assert.strictEqual(fg.offset, 0, 'FG1 offset, 0 for a sine input');
  assert.ok(fg.frequency > 0, `FG1 frequency expected > 0, got ${fg.frequency}`);
});

// Vout1 = −(Rf/(Rin + 50 Ω))·Vin = −(100k/10.05k)·(±0.5 V) = ∓4.975 V (the
// generator's 50 Ω; finite gain: < 1 mV off), inside the ±10.5 V rails.
test('the sine recipe, solved at its peak and trough (t = 1/(4f), 3/(4f)), reads OUT1 −4.975 V and +4.975 V, linear', () => {
  const ex = Parts.get('tl072').ai.recipe;
  const fg = fg1Of(ex);
  const f = fg && fg.frequency > 0 ? fg.frequency : 1;
  const got = [[1 / (4 * f), -4.975], [3 / (4 * f), 4.975]].map(([t, want]) => {
    const m = solveAt(ex, t).parts.U1.m;
    return { t, want, vout1: m.vout1, mode1: m.mode1 };
  });
  const off = got.filter(g => !(typeof g.vout1 === 'number' && Math.abs(g.vout1 - g.want) <= 0.05 && g.mode1 === 'linear'));
  assert.deepStrictEqual(off, [], 'OUT1 at the peak and trough (expected vout1 within ±0.05 V of want, mode1 linear)');
});

// Pin: the change could make every recipe a sine; the model must still see
// the DC form (amplitude 0, an offset).
test('pin: at least one TL072 recipe keeps a DC input (FG1 amplitude 0, offset ≠ 0)', () => {
  const dc = tlRecipes().filter(ex => { const fg = fg1Of(ex); return fg && fg.amplitude === 0 && fg.offset !== 0; });
  assert.ok(dc.length >= 1, `no TL072 recipe with a DC input; recipes: ${tlRecipes().map(ex => ex.name).join(' | ')}`);
});
