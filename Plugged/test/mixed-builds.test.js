// findCircuitProblems on mixed builds (issue #27, step D1; #51).
//
// findCircuitProblems is now built from each part's `elements`: R and SW
// conduct both ways (a button counts as closed, since the user presses it),
// and D conducts one way, anode to cathode, read from the part's pin names.
// Each build below is a full action list with its exact expected problems.
//
// Shapes these tests assume (stated so the builder matches them):
// - server.js exports findCircuitProblems(actions, { labelForm }) → string[],
//   as it works today (label form BAT1.0 by default).
// - Problem wording stays as today where it exists; the #51 line names both
//   batteries and says they share the same rails.
// - Every placed part, not only LEDs, is checked for a complete path: its
//   two pins must connect one to the battery's + and the other to its −,
//   not through the part itself. For this check every part conducts both
//   ways (a button counts as pressed, and a backwards LED still joins its
//   two columns: "backwards" is its own problem). A part that fails gets one
//   generic line, with no per-type wording:
//     `The <part name> at <A>/<B> is not connected between power and ground, so no current flows through it.`
//   <part name> is the lower-cased name ("resistor", "buzzer", "push button")
//   except all-capitals words ("LED"). As before, only a full rebuild (a
//   reply with a delete_all) gets this check.
// - Every part here is placed validly (span in range, one lead per hole), so
//   finishAIReply keeps every action and, with no problems, the reply as sent.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const N = Recipes.HIGHEST_COL;

function problems(actions) {
  assert.equal(typeof Server.findCircuitProblems, 'function', 'server.js must export findCircuitProblems(actions, opts)');
  return Server.findCircuitProblems(actions.map(a => ({ ...a })));
}

// The reply comes back as sent and every action is kept.
function clean(actions) {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.equal(out.reply, 'Built it.');
  assert.deepStrictEqual(out.actions, actions);
}

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const R    = (holeA, holeB) => ({ tool: 'place_resistor', holeA, holeB });
const LED  = (cathode, anode) => ({ tool: 'place_led', holeA: cathode, holeB: anode });
const SW   = (holeA, holeB) => ({ tool: 'place_button', holeA, holeB });
const BZ   = (holeA, holeB) => ({ tool: 'place_buzzer', holeA, holeB });

// delete_all, BAT1 on the top rails at the highest column.
const START = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'),
  wire('BAT1.1', `tn_${N}`, 'black'),
];

// ── Builds with no problems ────────────────────────────────────────────────

const GOOD = {
  // Three LEDs across columns 6 and 8, one shared resistor.
  'three LEDs in parallel': [...Recipes.ONE_LED, LED('d8', 'd6'), LED('e8', 'e6')],

  'two LEDs in series (the recipe)': Recipes.SERIES_2,

  // resistor → LED1 → LED2 → LED3 → ground.
  'three LEDs in series': [
    ...START,
    R('b2', 'b6'), LED('c8', 'c6'), LED('d10', 'd8'), LED('e12', 'e10'),
    wire('tp_3', 'a2', 'red'), wire('a12', 'tn_12', 'black'),
  ],

  // + → button (col 2 to 5) → two branches, each resistor → LED → ground.
  'a button switching two LED branches': [
    ...START,
    wire('tp_3', 'a2', 'red'),
    SW('b2', 'b5'),
    R('c5', 'c9'), LED('e11', 'e9'),       // branch 1: col 5 → 9 → 11
    R('d5', 'd10'), LED('c12', 'c10'),     // branch 2: col 5 → 10 → 12
    wire('a11', 'tn_11', 'black'), wire('a12', 'tn_12', 'black'),
  ],

  // The buzzer guide's series layout at C=2: the resistor's second lead and
  // the buzzer's first lead share column 6.
  'a buzzer behind a resistor, as the buzzer guide lays it out': [
    ...START,
    R('b2', 'b6'), BZ('c6', 'c8'),
    wire('tp_3', 'a2', 'red'), wire('a8', 'tn_8', 'black'),
  ],

  // The button part's own example: released, it is still not a break.
  'a released button in series with an LED': [
    ...START,
    R('b3', 'b7'), LED('c9', 'c7'), SW('b12', 'b15'),
    wire('tp_4', 'a3', 'red'), wire('a9', 'a12'), wire('a15', 'tn_15', 'black'),
  ],

  // A buzzer straight across the rails is a complete path (loud, but not
  // "not connected").
  'a buzzer straight across the rails': [
    ...START,
    BZ('c2', 'c4'), wire('tp_3', 'a2', 'red'), wire('a4', 'tn_4', 'black'),
  ],

  // + → button → resistor → buzzer → ground.
  'a buzzer behind a button': [
    ...START,
    wire('tp_3', 'a2', 'red'),
    SW('b2', 'b5'), R('c5', 'c9'), BZ('d9', 'd11'),
    wire('a11', 'tn_11', 'black'),
  ],

  // #51: BAT1 on the top rails with an LED; BAT2 on the bottom rails with a
  // button, resistor and buzzer in rows f–j.
  'two batteries on separate rails, a circuit on each': [
    ...START,
    R('b2', 'b6'), LED('c8', 'c6'), wire('tp_3', 'a2', 'red'), wire('a8', 'tn_8', 'black'),
    { tool: 'place_battery' },
    wire('BAT2.0', `bp_${N}`, 'red'),
    wire('BAT2.1', `bn_${N}`, 'black'),
    wire('bp_3', 'j2', 'red'),
    SW('i2', 'i5'), R('h5', 'h9'), BZ('g9', 'g11'),
    wire('j11', 'bn_11', 'black'),
  ],
};

for (const [name, actions] of Object.entries(GOOD)) {
  test(`${name}: no problems`, () => {
    assert.deepEqual(problems(actions), []);
    clean(actions);
  });
}

// ── Builds with a known problem ────────────────────────────────────────────

test('a backwards LED in the second of two branches: exactly that LED is flagged', () => {
  const actions = [
    ...START,
    R('b2', 'b6'), LED('c8', 'c6'), wire('tp_3', 'a2', 'red'), wire('a8', 'tn_8', 'black'),
    // Branch 2 at C=10, LED turned round: cathode c14 on the resistor side.
    R('b10', 'b14'), LED('c14', 'c16'), wire('tp_11', 'a10', 'red'), wire('a16', 'tn_16', 'black'),
  ];
  assert.deepEqual(problems(actions), [
    'The LED at c14/c16 is backwards: its cathode c14 is on the power side and its anode c16 is on the ground side. Swap holeA and holeB.',
  ]);
});

// No new "needs a resistor" check in D1: the prompt teaches it and the
// simulator warns about the short. The LED is forward across the rails, so
// findCircuitProblems has nothing to say. (Team: flag it if you want it.)
test('an LED straight across the rails with no resistor: not flagged by findCircuitProblems', () => {
  const actions = [
    ...START,
    LED('c4', 'c2'), wire('tp_3', 'a2', 'red'), wire('a4', 'tn_4', 'black'),
  ];
  assert.deepEqual(problems(actions), []);
});

// #51: batteries in parallel on one rail pair can't be solved.
test('two batteries wired to the same tp/tn rails: one problem naming both', () => {
  const actions = [
    ...START,
    R('b2', 'b6'), LED('c8', 'c6'), wire('tp_3', 'a2', 'red'), wire('a8', 'tn_8', 'black'),
    { tool: 'place_battery' },
    wire('BAT2.0', `tp_${N - 1}`, 'red'),
    wire('BAT2.1', `tn_${N - 1}`, 'black'),
    SW('b20', 'b23'), BZ('c23', 'c25'), wire('tp_21', 'a20', 'red'), wire('a25', 'tn_25', 'black'),
  ];
  const got = problems(actions);
  assert.equal(got.length, 1, JSON.stringify(got));
  assert.match(got[0], /\bBAT1\b/);
  assert.match(got[0], /\bBAT2\b/);
  assert.match(got[0], /same/i);
  assert.match(got[0], /rail/i);

  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /BAT2/);
});

// Guard: one battery and its two wires is not "two batteries on one rail".
test('one battery on tp/tn is not flagged as sharing rails', () => {
  assert.deepEqual(problems(Recipes.ONE_LED), []);
});

// ── Every part needs a complete path, not only LEDs (#27 D1 fix) ────────────

const notConnected = (name, a, b) =>
  `The ${name} at ${a}/${b} is not connected between power and ground, so no current flows through it.`;

// Found in a real DeepSeek run, twice, for "Build a circuit where pressing a
// push button sounds a buzzer.": column 12 (the resistor's end) is never
// joined to column 14 (the buzzer's start), so pressing the button does
// nothing. Button, resistor and buzzer all sit on no complete path.
const BUZZER_GAP = [
  ...START,
  SW('b2', 'b5'), R('b8', 'b12'), BZ('b14', 'b16'),
  wire('tp_3', 'a2', 'red'), wire('a5', 'a8'), wire('a16', 'tn_16', 'black'),
];

test('the button-buzzer build with a gap at columns 12/14: every part on the open path is flagged', () => {
  assert.deepEqual(problems(BUZZER_GAP).sort(), [
    notConnected('push button', 'b2', 'b5'),
    notConnected('resistor', 'b8', 'b12'),
    notConnected('buzzer', 'b14', 'b16'),
  ].sort());
});

test('closing the gap (a12 → a14) clears every problem', () => {
  assert.deepEqual(problems([...BUZZER_GAP, wire('a12', 'a14')]), []);
});

test('a buzzer on its own beside a working LED circuit: only the buzzer is flagged', () => {
  const actions = [...Recipes.ONE_LED, BZ('e20', 'e22')];
  assert.deepEqual(problems(actions), [notConnected('buzzer', 'e20', 'e22')]);
});

test('a resistor with one lead to + and the other to nothing is flagged', () => {
  const actions = [...Recipes.ONE_LED, R('e12', 'e16'), wire('tp_13', 'a12', 'red')];
  assert.deepEqual(problems(actions), [notConnected('resistor', 'e12', 'e16')]);
});

// The LED keeps its check, in the one generic wording: "…so it cannot light."
// is gone. With the ground wire missing, the resistor feeding it is open too.
test('an LED with no ground wire gets the generic line, and so does its resistor', () => {
  const actions = Recipes.ONE_LED.filter(a => !(a.tool === 'add_wire' && a.to === 'tn_8'));
  const got = problems(actions);
  assert.deepEqual(got.sort(), [
    notConnected('resistor', 'b2', 'b6'),
    notConnected('LED', 'c8', 'c6'),
  ].sort());
  assert.ok(!got.some(p => /cannot light/.test(p)), 'the LED-only wording is gone');
});

// A reply with no delete_all adds to the board on screen, which this check
// can't see (#14), so an unconnected part is not judged there.
test('a partial reply (no delete_all) with a lone buzzer is not flagged', () => {
  assert.deepEqual(problems([BZ('e20', 'e22')]), []);
});

test('finishAIReply reports the gap build under "Heads up", naming the buzzer', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: BUZZER_GAP.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, BUZZER_GAP, 'nothing is dropped: every part is validly placed');
  assert.match(out.reply, /Heads up/);
  assert.ok(out.reply.includes(notConnected('buzzer', 'b14', 'b16')), out.reply);
});

// Reviewer's find: the series recipe with BOTH LEDs flipped. Neither LED is
// "backwards" on its own (each sits between two columns that are neither
// clearly + nor −), and the undirected path check sees a complete loop, so
// nothing was said. No current can flow forward through either LED: each
// must get a line naming it, saying it has no forward path and cannot
// light. The wording is left to the builder.
test('two LEDs in series, both flipped: each LED gets a "no forward path, cannot light" problem', () => {
  const actions = [
    ...START,
    R('b2', 'b6'), LED('c6', 'c8'), LED('d8', 'd10'),
    wire('tp_3', 'a2', 'red'), wire('a10', 'tn_10', 'black'),
  ];
  const got = problems(actions);
  assert.equal(got.length, 2, `one problem per LED: ${JSON.stringify(got)}`);
  for (const at of ['c6/c8', 'd8/d10']) {
    const line = got.find(p => p.includes(`LED at ${at}`));
    assert.ok(line, `no problem names the LED at ${at}: ${JSON.stringify(got)}`);
    assert.match(line, /cannot light/);
    assert.match(line, /forward/);
  }
});

// Guard: the same chain the right way round is fine.
test('the SERIES_2 recipe, LEDs the right way round, still has no problems', () => {
  assert.deepEqual(problems(Recipes.SERIES_2), []);
});
