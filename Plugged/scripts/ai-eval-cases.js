// ─────────────────────────────────────────────────────────────
//  ai-eval-cases.js — the docs/QA.md AI-xx cases scripts/ai-eval.js can
//  grade in Node (issue #82). Each starts from a fresh board, or its
//  `board` and `markdown` (the edit cases, captured from the app with
//  scripts/capture-board.js), sends `message`, applies the reply's actions,
//  then `after` (a press or a click the QA row does), simulates, and checks:
//    keep        { parts: { LABEL: [holes…] }, wires: ['W1', …] }: each part
//                still has exactly those holes, each wire id the ends it
//                started with (an edit, not a rebuild; issue #85)
//    noDeleteAll the reply's actions have no delete_all (a rebuild in the
//                recipe's own order lands every id back where it was, so
//                keep alone can't catch it)
//    noHeadsUp   the reply has no "Heads up, this build has a problem:"
//    parts       { type: count } on the board
//    expect      { LABEL: { field: value | [lo, hi] } }, field of the part's
//                simulator reading (PartResult m)
//    expectAll   { type: { field: … } }, every part of that type
//    status      'ok' and not shorted
//  `states: [{ name, after, checks }]` grade the same built board in another
//  state (the button released, the switch clicked), each with its own
//  `after` and checks; their failures read '<name>.<check>'.
//  A case or state may carry `t` (and optionally `dt`, default 1 ms): its
//  board is solved as one time step at t seconds, so a wave source reads
//  its value then, not just its offset (#120).
//  Readings are the ones a correct build gives (test/ai-eval.test.js proves
//  each against one). What code can't see (the preview, hover and scroll,
//  3D glow, reply wording, console errors) stays with /qa-pass.
//
//  Left out: AI-03 (asks about a hand build), AI-05 (a question with no
//  build). AI-04 and AI-07 are the EDIT- cases, from a captured board.
// ─────────────────────────────────────────────────────────────

const fs   = require('node:fs');
const path = require('node:path');

const LED_OK = { on: true, current: [10, 20] };

// A board captured by scripts/capture-board.js: { board, markdown }.
const captured = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'ai-eval-boards', `${name}.json`), 'utf8'));
const ONE_LED   = captured('one-led');
const BACKWARDS = captured('backwards-led');
// The one-LED build's resistor and wire ids, kept by every edit.
const KEEP_R1 = { R1: ['b2', 'b6'] };
const WIRES = ['W1', 'W2', 'W3', 'W4'];

module.exports = [
  {
    // The demo request. No over-current line: the 10–20 mA range covers it.
    id: 'AI-01', tags: ['demo'],
    message: 'Build a single LED circuit with a current-limiting resistor.',
    checks: { noHeadsUp: true, parts: { resistor: 1, led: 1 }, expect: { LED1: LED_OK },
              expectAll: { led: LED_OK }, status: 'ok' },
  },
  {
    // One Ctrl+Z removing the build is page behaviour, not graded here.
    id: 'AI-02',
    message: 'Build 3 LEDs, each with its own resistor.',
    checks: { noHeadsUp: true, parts: { resistor: 3, led: 3 }, expectAll: { led: LED_OK }, status: 'ok' },
  },
  {
    // "No hole holds two leads" is the Heads-up check; the row-a layout
    // is checked by eye in /qa-pass.
    id: 'AI-06',
    message: 'Build one LED circuit.',
    checks: { noHeadsUp: true, parts: { resistor: 1, led: 1 },
              expect: { LED1: { on: true, current: [14.8, 15.0] } }, status: 'ok' },
  },
  {
    // Series: both LEDs carry the same ~10.6 mA. Reply wording not graded.
    id: 'AI-08',
    message: 'Put two LEDs in series.',
    checks: { noHeadsUp: true, parts: { resistor: 1, led: 2 },
              expectAll: { led: { on: true, current: [10.4, 10.8] } }, status: 'ok' },
  },
  {
    // The recipe's 1 kΩ pot at 50 %; the scroll-to-dim part is page behaviour.
    id: 'AI-09',
    message: 'Make an LED dimmer with a potentiometer.',
    checks: { noHeadsUp: true, parts: { potentiometer: 1, led: 1 },
              expectAll: { led: { on: true, current: [3.0, 4.0] } }, status: 'ok' },
  },
  {
    // Pressed, and released ("Circuit open": both dark).
    // Red 14.9 mA and green 14.5 mA, in whichever order the AI placed them.
    id: 'AI-10',
    message: 'Build a red LED and a green LED in parallel, each with its own resistor, both switched on and off by one push button.',
    after: [{ tool: 'set_control', part: 'SW1', pressed: true }],
    checks: { noHeadsUp: true, parts: { button: 1, resistor: 2, led: 2 },
              expectAll: { led: { on: true, current: [14.4, 15.0] } }, status: 'ok' },
    states: [{ name: 'released', after: [{ tool: 'set_control', part: 'SW1', pressed: false }],
               checks: { expectAll: { led: { on: false } } } }],
  },
  {
    // Dark (1 lux → LED on, 1.4 mA), and bright (the default 300 lux → off).
    id: 'AI-11',
    message: 'Build a night light that turns an LED on when it gets dark.',
    after: [{ tool: 'set_control', part: 'LDR1', light: 1 }],
    checks: { noHeadsUp: true, parts: { ldr: 1, resistor: 1, led: 1 },
              expect: { LED1: { on: true, current: [1.2, 1.6] } }, status: 'ok' },
    states: [{ name: 'bright', after: [{ tool: 'set_control', part: 'LDR1', light: 300 }],
               checks: { expect: { LED1: { on: false } } } }],
  },
  {
    // Hot (39 °C → buzzer on, 1.0 mA), and cool (25 °C → silent, ~0.67 mA).
    id: 'AI-12',
    message: 'Build a temperature alarm that sounds a buzzer when it gets hot',
    after: [{ tool: 'set_control', part: 'TH1', temperature: 39 }],
    checks: { noHeadsUp: true, parts: { thermistor: 1, resistor: 1, buzzer: 1 },
              expect: { BZ1: { sounding: true, current: [0.9, 1.1] } }, status: 'ok' },
    states: [{ name: 'cool', after: [{ tool: 'set_control', part: 'TH1', temperature: 25 }],
               checks: { expect: { BZ1: { sounding: false } } } }],
  },
  {
    // Any sensible resistor and colour: 470 Ω red is about 6.4 mA, 330 Ω
    // about 9.1 mA, a blue LED less. Lit, and far under the limit.
    id: 'AI-13',
    message: 'Power an LED from the bench supply at 5 V with a series resistor',
    checks: { noHeadsUp: true, parts: { bench_supply: 1, resistor: 1, led: 1 },
              expect: { PS1: { posOver: false } }, expectAll: { led: { on: true, current: [1, 20] } }, status: 'ok' },
  },
  {
    // The "over its 20 mA rating" warning can't fire at ~14.9 mA a segment.
    id: 'AI-14',
    message: 'Show the number 7 on a seven-segment display',
    checks: { noHeadsUp: true, parts: { seven_segment: 1, resistor: 3 },
              expect: { DS1: { digit: '7', segments: 'abc' } }, status: 'ok' },
  },
  {
    // 1N4148 or 1N4001: about 13.5 mA through both. The body's look is 3D.
    id: 'AI-15',
    message: 'Add a diode for reverse-polarity protection to an LED circuit',
    checks: { noHeadsUp: true, parts: { diode: 1, led: 1 },
              expect: { D1: { on: true, current: [13.0, 14.0] }, LED1: { on: true, current: [13.0, 14.0] } },
              status: 'ok' },
  },
  {
    id: 'AI-16',
    message: 'Build a 5.1 V Zener regulator from a 12 V supply',
    checks: { noHeadsUp: true, parts: { bench_supply: 1, zener: 1, resistor: 1 },
              expect: { ZD1: { mode: 'breakdown', voltage: [5.0, 5.2], current: [6.7, 7.1] } }, status: 'ok' },
  },
  {
    // As built (switch closed), and switched off (clicked open: LED dark).
    id: 'AI-17',
    message: 'Add an on/off switch to an LED circuit',
    checks: { noHeadsUp: true, parts: { toggle_switch: 1, resistor: 1, led: 1 },
              expect: { S1: { closed: true }, LED1: { on: true, current: [14.8, 15.0] } }, status: 'ok' },
    states: [{ name: 'switched off', after: [{ tool: 'set_control', part: 'S1', closed: false }],
               checks: { expect: { LED1: { on: false } } } }],
  },
  {
    // As built: common on a, the first LED lit (red 14.9 mA), the second dark.
    // Other position (clicked to b): the first dark, the second lit (green 14.5 mA).
    id: 'AI-18',
    message: 'Use a slide switch to choose between a red and a green LED',
    checks: { noHeadsUp: true, parts: { slide_switch: 1, resistor: 2, led: 2 },
              expect: { SS1: { side: 'a' }, LED1: { on: true, current: [14.4, 15.0] }, LED2: { on: false } },
              status: 'ok' },
    states: [{ name: 'other position', after: [{ tool: 'set_control', part: 'SS1', toB: true }],
               checks: { expect: { SS1: { side: 'b' }, LED1: { on: false }, LED2: { on: true, current: [14.4, 15.0] } } } }],
  },
  {
    // A bulb, not an LED, at 6 V: 0.60 W, full brightness, no burn-out.
    id: 'AI-19',
    message: 'Light a 6 V bulb from a battery',
    checks: { noHeadsUp: true, parts: { bulb: 1, led: 0 },
              expect: { LP1: { power: [0.55, 0.65], brightness: [0.95, 1] } }, status: 'ok' },
  },
  {
    // As built (switch closed, 3 V, 300 mA), and switched off (clicked open: stopped).
    id: 'AI-20',
    message: 'Make a motor spin with a switch',
    checks: { noHeadsUp: true, parts: { toggle_switch: 1, motor: 1 },
              expect: { S1: { closed: true }, M1: { spinning: true, current: [290, 310] } }, status: 'ok' },
    states: [{ name: 'switched off', after: [{ tool: 'set_control', part: 'S1', closed: false }],
               checks: { expect: { M1: { spinning: false } } } }],
  },
  {
    // 10 mA into two 1 kΩ in parallel: 5.0 V across, no battery.
    id: 'AI-21',
    message: 'Build a nodal analysis circuit with a 10 mA current source and two resistors',
    checks: { noHeadsUp: true, parts: { current_source: 1, resistor: 2, battery: 0 },
              expect: { IS1: { current: [9.9, 10.1], voltage: [4.9, 5.1] } }, status: 'ok' },
  },
  {
    // Red and blue lit, green off: purple. The dome's colour is 3D.
    id: 'AI-22',
    message: 'Make an RGB LED glow purple',
    checks: { noHeadsUp: true, parts: { rgb_led: 1, resistor: 2 },
              expect: { RGB1: { red: [14.8, 15.0], blue: [12.2, 12.5], green: [0, 0.1] } }, status: 'ok' },
  },
  {
    // ±12 V: both LEDs about 10 mA, neither rail over its limit.
    id: 'AI-23',
    message: 'Use the bench supply at ±12 V: an LED with a resistor on the + rail and another on the − rail',
    checks: { noHeadsUp: true, parts: { bench_supply: 1, led: 2, resistor: 2 },
              expect: { PS1: { posOver: false, negOver: false } },
              expectAll: { led: { on: true, current: [9.5, 10.5] } }, status: 'ok' },
  },
  // The op-amp (#118): `npm run ai-eval -- --only opamp`. One bench supply
  // (#198: never a second); the input is the function generator, FG1 (the
  // TL072's guide and recipe), its offset turned with set_value, so a build
  // that ignores its input fails the second reading.
  {
    // Gain −10 (Rf/Rin, 100k/10k) on ±12 V: 0.5 V in → −5.0 V, 0.8 V in → −8.0 V (±2 %;
    // the generator's 50 Ω makes it −4.975 and −7.96).
    id: 'OPAMP-inverting', tags: ['opamp'],
    message: 'Build an inverting amplifier with a gain of −10',
    after: [{ tool: 'set_value', part: 'FG1', offset: 0.5 }],
    checks: { noHeadsUp: true, parts: { tl072: 1, bench_supply: 1, function_generator: 1 },
              expect: { U1: { vout1: [-5.1, -4.9], mode1: 'linear' } }, status: 'ok' },
    states: [{ name: 'Vin 0.8 V', after: [{ tool: 'set_value', part: 'FG1', offset: 0.8 }],
               checks: { expect: { U1: { vout1: [-8.16, -7.84], mode1: 'linear' } } } }],
  },
  {
    // A 5 V reference on IN1−, FG1 on IN1+, the LED behind a resistor from
    // OUT1. On a single supply (V− on COM) the low output is 1.5 V, under
    // the LED's 2 V: dark, not reversed. 5.5 V in → lit; 4.5 V in → dark.
    id: 'OPAMP-comparator', tags: ['opamp'],
    message: 'Build a comparator that lights an LED when the input is above 5 V',
    after: [{ tool: 'set_value', part: 'FG1', offset: 5.5 }],
    checks: { noHeadsUp: true, parts: { tl072: 1, bench_supply: 1, function_generator: 1, led: 1 },
              expect: { LED1: { on: true } }, status: 'ok' },
    states: [{ name: 'Vin 4.5 V', after: [{ tool: 'set_value', part: 'FG1', offset: 4.5 }],
               checks: { expect: { LED1: { on: false } } } }],
  },
  {
    // OUT1 to IN1−, FG1 into IN1+: 3 V in → 3.0 V, 7 V in → 7.0 V (±2 %),
    // inside the rails on ±12 V or a single 12 V.
    id: 'OPAMP-follower', tags: ['opamp'],
    message: 'Build a voltage follower',
    after: [{ tool: 'set_value', part: 'FG1', offset: 3 }],
    checks: { noHeadsUp: true, parts: { tl072: 1, bench_supply: 1, function_generator: 1 },
              expect: { U1: { vout1: [2.94, 3.06], mode1: 'linear' } }, status: 'ok' },
    states: [{ name: 'Vin 7 V', after: [{ tool: 'set_value', part: 'FG1', offset: 7 }],
               checks: { expect: { U1: { vout1: [6.86, 7.14], mode1: 'linear' } } } }],
  },
  {
    // Aarmen's own words (#198): it once placed a second bench supply for the
    // input, five wires on one stacked box. One supply, the input from FG1.
    id: 'ASKED-follower', tags: ['opamp'],
    message: 'build me a non inverting voltage follower circuit',
    after: [{ tool: 'set_value', part: 'FG1', offset: 3 }],
    checks: { noHeadsUp: true, parts: { tl072: 1, bench_supply: 1, function_generator: 1 },
              expect: { U1: { vout1: [2.94, 3.06], mode1: 'linear' } }, status: 'ok' },
    states: [{ name: 'Vin 7 V', after: [{ tool: 'set_value', part: 'FG1', offset: 7 }],
               checks: { expect: { U1: { vout1: [6.86, 7.14], mode1: 'linear' } } } }],
  },
  {
    // AI-04: LED1 (c6/c8, backwards) turned round in place: 470 Ω at 9 V is
    // ~14.9 mA. R1 and W1–W4 stay. Any delete_all rebuild fails noDeleteAll;
    // one in another order also moves the wire ids (keep).
    id: 'EDIT-fix', tags: ['edit'],
    message: 'Fix it.', board: BACKWARDS.board, markdown: BACKWARDS.markdown,
    checks: { noHeadsUp: true, noDeleteAll: true, keep: { parts: KEEP_R1, wires: WIRES }, parts: { resistor: 1, led: 1 },
              expect: { LED1: { on: true, current: [14.8, 15.0] } }, status: 'ok' },
  },
  {
    // AI-07: one new LED across LED1's columns, sharing R1: ~7.4 mA each.
    // A second resistor and rail wires (~14.9 mA each) is not parallel.
    id: 'EDIT-add-led', tags: ['edit'],
    message: 'Add a second LED in parallel.', board: ONE_LED.board, markdown: ONE_LED.markdown,
    checks: { noHeadsUp: true, noDeleteAll: true, keep: { parts: { ...KEEP_R1, LED1: ['c8', 'c6'] }, wires: WIRES },
              parts: { resistor: 1, led: 2 }, expectAll: { led: { on: true, current: [7.2, 7.6] } }, status: 'ok' },
  },
  {
    // Only a set_value: 1 kΩ at 9 V is ~7.0 mA (470 Ω gave ~14.9 mA).
    id: 'EDIT-resistor-1k', tags: ['edit'],
    message: 'Make the resistor 1k.', board: ONE_LED.board, markdown: ONE_LED.markdown,
    checks: { noHeadsUp: true, noDeleteAll: true, keep: { parts: { ...KEEP_R1, LED1: ['c8', 'c6'] }, wires: WIRES },
              parts: { resistor: 1, led: 1 }, expect: { LED1: { on: true, current: [6.8, 7.2] } }, status: 'ok' },
  },

  // ── Part cases: one part the AI places, from a fresh board (#123) ──────
  {
    // The meter's recipe: a 1 kΩ / 1 kΩ divider on 9 V, the meter in V mode
    // across R2, 4.50 V. Other resistor values read something else.
    id: 'PART-meter', tags: ['parts'],
    message: 'Build a divider of two 1 kΩ resistors on the 9 V battery and measure the voltage across R2 with a multimeter.',
    checks: { noHeadsUp: true, parts: { multimeter: 1, resistor: 2 },
              expect: { MM1: { mode: 'V', reading: [4.4, 4.6], fuse: false } }, status: 'ok' },
  },
  {
    // Settled in a plain solve: 9 V across the capacitor (reversed reads
    // −9 V), and ½CV² of 1000 µF at 9 V is 40.5 mJ (40,500 µJ).
    id: 'PART-capacitor', tags: ['parts'],
    message: 'Add a 1000 µF capacitor that charges through a 1 kΩ resistor.',
    checks: { noHeadsUp: true, parts: { capacitor: 1, resistor: 1 },
              expect: { C1: { V: [8.9, 9.1], energy: [40000, 41000] } }, status: 'ok' },
  },
  {
    // #120: graded at two moments of the sine (a plain solve reads only the
    // offset), with the frequency pinned to 1 Hz whatever the AI picked:
    // lit on the peak (t = 0.25 s; the recipe's 0–10 V into 470 Ω is
    // 15.4 mA) and dark on the trough (t = 0.75 s). A flat output stays lit,
    // a sine around 0 V never lights, a backwards LED never lights.
    id: 'PART-generator', tags: ['parts'],
    message: 'Make an LED fade in and out with a function generator',
    after: [{ tool: 'set_value', part: 'FG1', frequency: 1 }], t: 0.25,
    checks: { noHeadsUp: true, parts: { function_generator: 1, led: 1 },
              expectAll: { led: { on: true, current: [5, 20] } }, status: 'ok' },
    states: [{ name: 'trough', after: [{ tool: 'set_value', part: 'FG1', frequency: 1 }], t: 0.75,
               checks: { expectAll: { led: { on: false } }, status: 'ok' } }],
  },
];
