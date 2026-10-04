// The checker's four op-amp wiring mistakes, issue #10 (docs/TODO.md task 5):
// positive feedback, a wire into the unused half, a meter probe on nothing
// useful, and a half clipped although it has negative feedback. Each names
// the part, the pins and the holes, so the repair loop can fix it.
//
// Run with:  npm test
//
// Shapes these tests assume (the issue's design), stated so the builder
// matches them:
// - Checks 1–3 are in Server.findCircuitProblems (so checkBuild, which
//   runs it on a delete_all build, has them too); check 4 is in
//   rebuildProblems, from the simulator's plain solve (r.parts.U1.m.mode1 /
//   mode2 'high' or 'low'), so only Server.checkBuild has it.
// - Pin names as on the TL072's pinout: OUT1, IN1−, IN1+, OUT2, IN2−, IN2+
//   (− may be U+2212 or '-'). Each message names U1 (or MM1), the pins and
//   the holes, and is at most about 200 characters (MAX_CHARS).
// - Check 1: OUTn's node joined to INn+'s node by wires alone (no part
//   between them), named with the pins' own holes: "U1's OUT1 (f30) is
//   wired straight to its + input IN1+ (f32): that is positive feedback."
//   A resistor from OUT to IN+ (a Schmitt trigger) is not this mistake.
// - Check 2: both of a half's inputs reach nothing except that half's own
//   pins, yet a wire or part lead lands in its output's or inputs' strip.
//   The message names the strip (a hole in it) and says the half is unused.
// - Check 3: a multimeter probe (MM1.red / MM1.black, or MM1.0 / MM1.1)
//   in a strip whose only other occupant is an unused op-amp input, or that
//   holds nothing else at all. The message names the probe and the hole.
// - Check 4: a half's mode 'high' or 'low' while its OUT reaches its IN−
//   through resistors: "U1's OUT1 is clipped at the rail although it has
//   negative feedback". A path that only meets IN−'s side at a supply rail
//   (a load or meter to COM) is not feedback.
//
// No network and no AI: real builds (Examples turned into actions, as
// test/prompt-bank.test.js does) through the real checker and simulator.
// Every expected number is hand-computed in the comment above its build.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server = require('../backend/server.js');
const Board  = require('../circuit3d/js/board-model.js');
const Sim    = require('../circuit3d/js/simulate.js');
const Parts  = require('../circuit3d/js/parts');
const { recipeActions } = require('./fixtures/recipe-steps.js');
const N = require('../circuit3d/js/board-geometry.js').COLS;

const MAX_CHARS = 200;   // the issue: each message at most about 200 characters

const problems = actions => Server.findCircuitProblems(actions.map(a => ({ ...a })));
const checked  = actions => Server.checkBuild(actions.map(a => ({ ...a })), null);

// The problem that matches every pattern: null when one does (and is short
// enough), else what went wrong.
function missing(found, patterns) {
  const hit = found.find(p => patterns.every(re => re.test(p)));
  if (!hit) return `no problem matches ${patterns.join(' ')}; got ${JSON.stringify(found)}`;
  if (hit.length > MAX_CHARS) return `${hit.length} characters, over ${MAX_CHARS}: ${hit}`;
  return null;
}

// The plain solve's op-amp measurements (the simulator's view of the build).
function solved(actions) {
  const applied = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(applied.errors, [], 'every action applies');
  const { components, wires } = Board.toSim(applied.board);
  const r = Sim.analyze(components, wires);
  assert.strictEqual(r.status, 'ok');
  return r.parts.U1.m;
}

// ── Parts and wiring, as Examples (test/prompt-bank.test.js's) ─────────────
// The chip at f30 facing right: OUT1 f30, IN1− f31, IN1+ f32, V− f33 (the
// bottom strips 30–33), IN2+ e33, IN2− e32, OUT2 e31, V+ e30 (the top ones).
const CHIP = ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'];
const PS1  = volts => ({ type: 'bench_supply', label: 'PS1', values: { voltage: volts } });
const FG1  = (amp, frequency = 1) => ({ type: 'function_generator', label: 'FG1', values: { amplitude: amp, offset: 0, frequency } });
const DC   = volts => ({ type: 'function_generator', label: 'FG1', values: { amplitude: 0, offset: volts, frequency: 1 } });
const U1   = { type: 'tl072', label: 'U1', holes: CHIP };
const MM1  = (mode = 'V') => ({ type: 'multimeter', label: 'MM1', values: { mode } });
const R    = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
const LED  = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });          // [cathode, anode]
const D    = (label, holes, model = '1N4148') => ({ type: 'diode', label, holes, values: { model } });   // [cathode, anode]
const SW   = (label, holes) => ({ type: 'button', label, holes });
const DUAL   = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['PS1.3', `tn_${N - 1}`], ['PS1.2', `bn_${N}`],
                ['tp_30', 'a30'], ['bn_33', 'j33']];                                       // V+ +12, V− −12
const SINGLE = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['tp_30', 'a30'], ['j33', 'tn_33']];   // V+ +12, V− COM
const ONE_RAIL = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`]];
const FG_COM = ['FG1.1', `tn_${N - 2}`];
const build = (parts, wires) => recipeActions({ name: 'opamp-checks', parts, wires, expect: {} });

// ── The mistakes ───────────────────────────────────────────────────────────

// 1. Positive feedback. An inverting amp on ±12 V (DC 1 V: FG1.0 → h27, Rin
//    10 kΩ g27–g31 into IN1−, Rf 20 kΩ h31–h35, i35 → i30) whose IN1+ goes
//    to OUT1 (g30 → g32) instead of COM. `via` routes that tie through an
//    empty strip (g30 → a50, b50 → g32): still wires alone.
const invertingTiedToPlus = ({ via = false } = {}) => build(
  [PS1(12), DC(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ...(via ? [['g30', 'a50'], ['b50', 'g32']] : [['g30', 'g32']])]);
// BANK-09's two halves (below) with OUT2 tied to IN2+ (b31 → c33) instead of
// IN2+ to COM (a33 → tn_33).
const secondHalfTiedToPlus = () => twoHalves({ in2p: ['b31', 'c33'] });

// The op-amp-1 follower on ±12 V, DC 3 V: FG1.0 → j32 (IN1+), g30 → g31
// (OUT1 → IN1−): OUT1 3.000 V. Op-amp 2 untouched, plus `extra`.
const followerWith = ({ parts = [], wires = [] } = {}) => build(
  [PS1(12), DC(3), U1, ...parts], [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g30', 'g31'], ...wires]);

// 2. A wire into the unused half.
//    a. The follower's load (1 kΩ b36–b40, a40 → COM) wired from OUT2's
//       strip (a31 → a36), not OUT1's.
//    b. The meter's red probe in OUT2's strip (b31), black on COM: the row
//       mistake the test set saw (docs/TODO.md task 6).
//    c. The follower's feedback wired on the other half: FG1.0 → j32 (IN1+)
//       but OUT2 → IN2− (b31 → b32). IN2− reaches only OUT2 (its own
//       half's pin) and IN2+ nothing: half 2 is still unused.
const loadOnOut2    = () => followerWith({ parts: [R('R1', ['b36', 'b40'], 1000)], wires: [['a31', 'a36'], ['a40', 'tn_40']] });
const redOnOut2     = () => followerWith({ parts: [MM1()], wires: [['MM1.0', 'b31'], ['MM1.1', 'tn_50']] });
const feedbackOnTwo = () => build([PS1(12), DC(3), U1], [...DUAL, FG_COM, ['FG1.0', 'j32'], ['b31', 'b32']]);
//    d. A wire from OUT2's strip straight to COM (a31 → tn_31): its other
//       end is a rail, so OUT1 is no place to move it.
const out2ToCom     = () => followerWith({ wires: [['a31', 'tn_31']] });

// 3. A meter probe on nothing useful (red on OUT1, h30, unless said):
//    a. black on IN2+ (a33) of the unused half;
//    b. black (named MM1.black) on an empty strip (a45);
//    c. red (MM1.red) on an empty strip (c45), black on COM.
const blackOnIn2p   = () => followerWith({ parts: [MM1()], wires: [['MM1.0', 'h30'], ['MM1.1', 'a33']] });
const blackOnEmpty  = () => followerWith({ parts: [MM1()], wires: [['MM1.0', 'h30'], ['MM1.black', 'a45']] });
const redOnEmpty    = () => followerWith({ parts: [MM1()], wires: [['MM1.red', 'c45'], ['MM1.black', 'tn_50']] });

// 4. Clipped with negative feedback. An inverting amp on ±12 V with Rin 1 kΩ
//    (g27–g31) and Rf 100 kΩ (h31–h35, i35 → i30), IN1+ j32 → COM, DC
//    `volts` in: −100k/(1k + 50 Ω) × 1 V = −95.2 V, so OUT1 sits at its low
//    clip, −12 + 1.5 = −10.5 V (mode1 'low'); −1 V in, +10.5 V ('high').
const tooMuchGain = volts => build(
  [PS1(12), DC(volts), U1, R('R1', ['g27', 'g31'], 1000), R('R2', ['h31', 'h35'], 100000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32']]);

// ── The clean builds (test/prompt-bank.test.js's, the TL072 ones and the
//    meter's), and two more that only look like the mistakes ──────────────
// BANK-01 inverting −2; BANK-02 non-inverting ×3; BANK-03 a follower of a
// 6 V divider, the meter on OUT1; BANK-04 a comparator with a button;
// BANK-05 summing; BANK-06 difference; BANK-07 the superdiode; BANK-08 a
// follower into an LED; BANK-09 both halves; BANK-10 inverting −5 from a
// divider, the meter on OUT1; BANK-11 lab 2 (−10), the meter on OUT1;
// BANK-13 a capacitor charged through a button, the meter across it. Their
// numbers are hand-computed there.
const inverting = () => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32']]);
const nonInverting = () => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['i35', 'i30'], ['j27', 'tn_27']]);
const follower = () => build(
  [PS1(12), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), MM1()],
  [...SINGLE, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'j32'], ['g30', 'g31'], ['MM1.0', 'h30'], ['MM1.1', 'tn_50']]);
const comparator = () => build(
  [PS1(12), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), R('R3', ['h32', 'h36'], 10000),
   SW('SW1', ['i32', 'i35']), R('R4', ['h26', 'h30'], 1000), LED('LED1', ['i24', 'i26'])],
  [...SINGLE, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g31'], ['j36', 'tn_36'], ['j35', 'tp_35'], ['j24', 'tn_24']]);
const summing = () => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 100000), R('R2', ['h31', 'h35'], 100000), R('R3', ['j31', 'j34'], 100000),
   R('R4', ['b40', 'b44'], 11000), R('R5', ['c44', 'c48'], 1000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g34']]);
const difference = () => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 10000), R('R3', ['i32', 'i36'], 10000),
   R('R4', ['j28', 'j32'], 10000), R('R5', ['b40', 'b44'], 500), R('R6', ['c44', 'c48'], 100)],
  [...DUAL, FG_COM, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'h27'], ['i35', 'i30'], ['FG1.0', 'j36'], ['i28', 'tn_28']]);
const rectifier = () => build(
  [PS1(12), FG1(1), U1, D('D1', ['h26', 'h30']), R('R1', ['i22', 'i26'], 10000)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g26', 'g31'], ['j22', 'tn_22']]);
const buffer = () => build(
  [PS1(12), FG1(5), U1, R('R1', ['h26', 'h30'], 470), LED('LED1', ['i24', 'i26'])],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g30', 'g31'], ['j24', 'tn_24']]);
// BANK-09; `r4` and `in2p` (IN2+'s wire) vary it for the mistakes. DC `volts`
// replaces the sine when given.
function twoHalves({ r4 = 10000, in2p = ['a33', 'tn_33'], volts } = {}) {
  return build(
    [PS1(12), volts === undefined ? FG1(1) : DC(volts), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000),
     R('R3', ['c32', 'c36'], 10000), R('R4', ['b28', 'b32'], r4)],
    [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['j30', 'b36'], ['a28', 'a31'], in2p]);
}
const gainFive = () => build(
  [PS1(12), U1, R('R1', ['g27', 'g31'], 100000), R('R2', ['h31', 'h35'], 500000),
   R('R3', ['b40', 'b44'], 11000), R('R4', ['c44', 'c48'], 1000), MM1()],
  [...DUAL, ['i35', 'i30'], ['j32', 'tn_32'], ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'h27'], ['MM1.0', 'g30'], ['MM1.1', 'tn_50']]);
const lab2 = () => build(
  [PS1(12), FG1(0.5), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 100000), MM1()],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['MM1.0', 'g30'], ['MM1.1', 'tn_50']]);
const charge = () => build(
  [PS1(9), SW('SW1', ['b2', 'b5']), R('R1', ['c5', 'c9'], 10000),
   { type: 'capacitor', label: 'C1', holes: ['d9', 'd12'], values: { capacitance: '100µF' } }, MM1()],
  [...ONE_RAIL, ['tp_2', 'a2'], ['a12', 'tn_12'], ['MM1.0', 'e9'], ['MM1.1', 'e12']]);

// A Schmitt trigger on one 12 V rail: IN1− = FG1.0 (g31, DC 8 V); IN1+ from
// a 10k/10k divider (6 V, 5 kΩ behind it; d44 → g32) and 100 kΩ h32–h36
// back from OUT1 (i36 → i30): positive feedback through a resistor, on
// purpose. 8 V > 6 V, so OUT1 sits low at 1.5 V and the red LED (OUT1 →
// 1 kΩ h26–h30 → anode i26, cathode i24 → COM) stays dark. IN1+ =
// (6 × 100k + 1.5 × 5k)/105k = 5.79 V, still under 8 V.
const schmitt = () => build(
  [PS1(12), DC(8), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), R('R3', ['h32', 'h36'], 100000),
   R('R4', ['h26', 'h30'], 1000), LED('LED1', ['i24', 'i26'])],
  [...SINGLE, FG_COM, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g32'], ['FG1.0', 'g31'], ['i36', 'i30'], ['j24', 'tn_24']]);

// The TL072's comparator recipe (6 V in over its 5 V divider: OUT1 high,
// mode1 'high') with a 10 kΩ load g30–g34 to COM (j34 → tn_34) and the
// meter across OUT1 (j30) and COM. OUT1 and IN1−'s divider meet only at
// COM, a supply rail: no feedback, so a clip here is just a comparator.
const tl = () => Parts.get('tl072');
const comparatorRecipe = () => tl().ai.recipes.find(ex => /comparator/i.test(ex.name));
function comparatorLoaded() {
  const ex = comparatorRecipe();
  return recipeActions({ ...ex, parts: [...ex.parts, R('R9', ['g30', 'g34'], 10000), MM1()],
                         wires: [...ex.wires, ['j34', 'tn_34'], ['MM1.0', 'j30'], ['MM1.1', 'tn_50']] });
}

// A comparator on one 12 V rail whose divider and load share ONE ground
// strip: IN1+ = FG1.0 (j32, DC 8 V); IN1− from 10k/10k, tp (j25 → tp_25) →
// R1 g25–g31 → IN1− → R2 h31–h35 → bot 35; the 10 kΩ load i30–i35 from
// OUT1 into the same bot 35, grounded by one wire (j35 → tn_35). IN1− =
// 12 × 10k/20k = 6 V < 8 V, so OUT1 is high: 10.5 × 10k/10.05k = 10.448 V
// (mode1 'high'). OUT1 → R3 → R2 → IN1− runs through COM (bot 35 is tn by
// a wire): no feedback, a correct comparator.
const sharedGroundStrip = () => build(
  [PS1(12), DC(8), U1, R('R1', ['g25', 'g31'], 10000), R('R2', ['h31', 'h35'], 10000), R('R3', ['i30', 'i35'], 10000)],
  [...SINGLE, FG_COM, ['j25', 'tp_25'], ['FG1.0', 'j32'], ['j35', 'tn_35']]);

// BANK-01's inverting amp (DC 1 V in) with the Rf/OUT1 strip 35 also wired
// to COM (j35 → tn_35), IN1+ on COM as it should be (j32 → tn_32): OUT1 is
// shorted to COM, at 0 V sinking its 20 mA limit (mode1 'isrc−'). OUT1 and
// IN1+ meet only at COM, a supply rail; there is no OUT1 → IN1+ wire.
const outputOnCom = () => build(
  [PS1(12), DC(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['j35', 'tn_35']]);

// ── Sanity: the builds do what their comments say ─────────────────────────

test('sanity: the mistakes simulate as their comments say (too much gain clips OUT1 low and high; the second half clips with OUT1 linear)', () => {
  assert.strictEqual(solved(tooMuchGain(1)).mode1, 'low', '1 V into a gain of −95');
  assert.strictEqual(solved(tooMuchGain(-1)).mode1, 'high', '−1 V into a gain of −95');
  const two = solved(twoHalves({ r4: 1000000, volts: 1 }));
  assert.strictEqual(two.mode1, 'linear', 'op-amp 1 at −1.99 V');
  assert.strictEqual(two.mode2, 'high', 'op-amp 2 at −100 × −1.99 V');
  assert.strictEqual(solved(comparatorLoaded()).mode1, 'high', 'the loaded comparator, 6 V in');
  assert.strictEqual(solved(sharedGroundStrip()).mode1, 'high', 'the shared-ground comparator, 8 V over 6 V');
  assert.strictEqual(solved(outputOnCom()).mode1, 'isrc−', 'OUT1 shorted to COM, at its current limit');
  assert.strictEqual(solved(schmitt()).mode1, 'low', 'the Schmitt trigger, 8 V in');
});

// ── 1. Positive feedback ──────────────────────────────────────────────────

test('check 1: an output wired straight to its own + input is positive feedback, named with the part, both pins and their holes', () => {
  const bad = [];
  for (const [what, actions, patterns] of [
    ['OUT1 → IN1+ by one wire (g30 → g32)',
     invertingTiedToPlus(),              [/\bU1\b/, /\bOUT1\b/, /\bIN1\+/, /\bf30\b/, /\bf32\b/, /positive feedback/i]],
    ['OUT1 → IN1+ by two wires through an empty strip (g30 → a50, b50 → g32)',
     invertingTiedToPlus({ via: true }), [/\bU1\b/, /\bOUT1\b/, /\bIN1\+/, /\bf30\b/, /\bf32\b/, /positive feedback/i]],
    ['OUT2 → IN2+ on the second half (b31 → c33)',
     secondHalfTiedToPlus(),             [/\bU1\b/, /\bOUT2\b/, /\bIN2\+/, /\be31\b/, /\be33\b/, /positive feedback/i]],
  ]) {
    const why = missing(problems(actions), patterns);
    if (why) bad.push(`${what}: ${why}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── 2. A wire into the unused half ────────────────────────────────────────

const UNUSED = /\bunused\b|\bnot used\b|isn['’]t used|\bnot in use\b/i;

test('check 2: a wire or probe into the unused half\'s strips (its inputs reach nothing else) names U1, the pin, a hole in the strip, and that the half is unused', () => {
  const bad = [];
  for (const [what, actions, patterns] of [
    ['the follower\'s load wired from OUT2\'s strip (a31 → a36)',  loadOnOut2(),    [/\bU1\b/, /\bOUT2\b/, /\b[a-e]31\b/, UNUSED]],
    ['the meter\'s red probe in OUT2\'s strip (b31)',               redOnOut2(),     [/\bU1\b/, /\bOUT2\b/, /\b[a-e]31\b/, UNUSED]],
    ['the follower\'s feedback on the other half (OUT2 → IN2−, b31 → b32)',
     feedbackOnTwo(), [/\bU1\b/, /\bOUT2\b|\bIN2[−-]/, /\b[a-e]3[12]\b/, UNUSED]],
  ]) {
    const why = missing(problems(actions), patterns);
    if (why) bad.push(`${what}: ${why}`);
  }
  assert.deepStrictEqual(bad, []);
});

// Check 2's fix (approved on #10): "move it to a free column, or to OUT1
// (f30) only if it should connect there"; no OUT1 at all when the wire's
// other end is a rail or a source pin; never the old "move it to the used
// half's OUT1".
const CHECK2     = [/\bU1\b/, /\bOUT2\b/, /\b[a-e]31\b/, UNUSED];
const OLD_ADVICE = /move it to the used half['’]s OUT1/i;

test('check 2\'s advice: a free column, or OUT1 (f30) only if it should connect there; no OUT1 for a wire from a rail; never the old "move it to the used half\'s OUT1"', () => {
  const bad = [];
  const why = missing(problems(loadOnOut2()), [...CHECK2, /free column/i, /only if/i]);
  if (why) bad.push(`the load wired from a31 (other end a hole): ${why}`);
  const found = problems(out2ToCom());
  const why2 = missing(found, [...CHECK2, /free column/i]);
  if (why2) bad.push(`a31 → tn_31 (other end a rail): ${why2}`);
  const toOut1 = found.filter(p => CHECK2.every(re => re.test(p)) && /\bOUT1\b|\bf30\b/.test(p));
  if (toOut1.length) bad.push(`a31 → tn_31 (other end a rail) offers OUT1 / f30: ${JSON.stringify(toOut1)}`);
  for (const [what, make] of [['loadOnOut2', loadOnOut2], ['redOnOut2', redOnOut2], ['feedbackOnTwo', feedbackOnTwo], ['out2ToCom', out2ToCom]]) {
    const old = problems(make()).filter(p => OLD_ADVICE.test(p));
    if (old.length) bad.push(`${what}: the old advice ${JSON.stringify(old)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── 3. A meter probe on nothing useful ────────────────────────────────────

test('check 3: a meter probe on the unused half\'s input or on an empty strip names MM1\'s probe and its hole', () => {
  const bad = [];
  for (const [what, actions, patterns] of [
    ['black (MM1.1) on IN2+ of the unused half (a33)', blackOnIn2p(),  [/\bMM1\b/, /black|MM1\.1\b/i, /\ba33\b/]],
    ['black (MM1.black) on an empty strip (a45)',      blackOnEmpty(), [/\bMM1\b/, /black/i, /\ba45\b/]],
    ['red (MM1.red) on an empty strip (c45)',          redOnEmpty(),   [/\bMM1\b/, /\bred\b/i, /\bc45\b/]],
  ]) {
    const why = missing(problems(actions), patterns);
    if (why) bad.push(`${what}: ${why}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── 4. Clipped with negative feedback ─────────────────────────────────────

const CLIPPED = /clipped/i, NEGATIVE = /negative feedback/i;

test('check 4: checkBuild names a half clipped at the rail although Rf feeds its OUT back to IN− (low and high clip)', () => {
  const bad = [];
  for (const [what, actions] of [['1 V into a gain of −95 (OUT1 low)', tooMuchGain(1)], ['−1 V into a gain of −95 (OUT1 high)', tooMuchGain(-1)]]) {
    const why = missing(checked(actions), [/\bU1\b/, /\bOUT1\b/, CLIPPED, NEGATIVE]);
    if (why) bad.push(`${what}: ${why}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('check 4: on both halves, only the clipped one is named: OUT2 (gain −100 on −1.99 V) and not the linear OUT1', () => {
  const found = checked(twoHalves({ r4: 1000000, volts: 1 }));
  assert.strictEqual(missing(found, [/\bU1\b/, /\bOUT2\b/, CLIPPED, NEGATIVE]), null);
  assert.deepStrictEqual(found.filter(p => CLIPPED.test(p) && /\bOUT1\b/.test(p)), [], 'OUT1 is linear');
});

// ── The live mistake ──────────────────────────────────────────────────────

// BANK-03's follower (one 12 V rail, the 10k/10k divider's 6 V on d44) with
// its inputs swapped and the meter's black probe on the wrong row: the
// divider into IN1− (d44 → g31), OUT1 tied to IN1+ (g30 → g32), the meter
// red on OUT1 (h30), black on IN2+ (a33). The simulator finds the unstable
// balance (OUT1 6.000 V, linear), so only the checker can say it.
const liveMistake = () => build(
  [PS1(12), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), MM1()],
  [...SINGLE, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g31'], ['g30', 'g32'], ['MM1.0', 'h30'], ['MM1.1', 'a33']]);

test('the live mistake (divider into IN1−, OUT1 tied to IN1+, black probe on IN2+) gives checks 1 and 3, from the checker and from checkBuild', () => {
  const bad = [];
  for (const [where, found] of [['findCircuitProblems', problems(liveMistake())], ['checkBuild', checked(liveMistake())]]) {
    const one   = missing(found, [/\bU1\b/, /\bOUT1\b/, /\bIN1\+/, /\bf30\b/, /\bf32\b/, /positive feedback/i]);
    const three = missing(found, [/\bMM1\b/, /black|MM1\.1\b/i, /\ba33\b/]);
    if (one)   bad.push(`${where}, check 1: ${one}`);
    if (three) bad.push(`${where}, check 3: ${three}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── Silence on clean builds ───────────────────────────────────────────────
// The recipes, bank builds, Schmitt trigger and loaded comparator passed
// before #10 (pins). The reviewer's two (#10 FIX): a path that meets only
// at a COM strip is neither feedback (sharedGroundStrip, silent) nor an
// OUT → IN+ wire (outputOnCom: its short may be named, not as positive
// feedback).

test('silent on every TL072 recipe and example, every TL072 bank build and BANK-13\'s meter, a Schmitt trigger, a loaded comparator with the meter on OUT1, and a comparator whose divider and load share one ground strip; an output shorted to COM is not positive feedback', () => {
  const def = tl();
  const builds = [
    ...[def.ai.recipe, ...(def.ai.recipes || []), ...(def.examples || [])].map(ex => [`TL072 recipe/example: ${ex.name}`, () => recipeActions(ex)]),
    ['BANK-01 inverting', inverting], ['BANK-02 non-inverting', nonInverting], ['BANK-03 follower', follower],
    ['BANK-04 comparator', comparator], ['BANK-05 summing', summing], ['BANK-06 difference', difference],
    ['BANK-07 superdiode', rectifier], ['BANK-08 buffer', buffer], ['BANK-09 two halves', () => twoHalves()],
    ['BANK-10 gain −5', gainFive], ['BANK-11 lab 2', lab2], ['BANK-13 charge (the meter)', charge],
    ['a Schmitt trigger (OUT1 → 100 kΩ → IN1+)', schmitt],
    ['the comparator recipe with a 10 kΩ load and the meter on OUT1', comparatorLoaded],
    ['a comparator whose divider and load share one ground strip (bot 35 → tn)', sharedGroundStrip],
  ];
  assert.ok(builds.length >= 3 + 12, `sanity: the TL072's recipes and the bank builds; got ${builds.length}`);
  const bad = [];
  for (const [what, make] of builds) {
    const fcp = problems(make()), cb = checked(make());
    if (fcp.length) bad.push(`${what}: findCircuitProblems ${JSON.stringify(fcp)}`);
    if (cb.length)  bad.push(`${what}: checkBuild ${JSON.stringify(cb)}`);
  }
  // OUT1 shorted to COM through strip 35 with IN1+ on COM: whatever else is
  // named, not "positive feedback".
  for (const [where, found] of [['findCircuitProblems', problems(outputOnCom())], ['checkBuild', checked(outputOnCom())]]) {
    const wrong = found.filter(p => /positive feedback/i.test(p));
    if (wrong.length) bad.push(`OUT1 shorted to COM (j35 → tn_35), IN1+ on COM: ${where} ${JSON.stringify(wrong)}`);
  }
  assert.deepStrictEqual(bad, []);
});
