// Lab 2's finishing work (issue #152, Edison E6): what the student adds to
// the starter (circuit3d/labs/lab2.sparky: the TL072 U1 across the centre
// gap, the bench supply PS1 and the function generator FG1 off the board,
// nothing wired) to build the lab's inverting amplifier. One source for
// test/lab-sheets.test.js (added to the loaded starter, then time-stepped
// with the real simulator) and e2e/lab-sheet.spec.js (added through
// App.placePart and App.finishWire).
//
// The circuit (issue #152): FG1 1 Vp at 1 Hz → Rin R1 10 kΩ → IN1− (pin 2);
// Rf R2 100 kΩ from OUT1 (pin 1) to IN1−; IN1+ (pin 3) to COM; PS1 in
// series at ±12 V, + to V+ (pin 8) and − to V− (pin 4). The generator is
// 50 Ω behind its EMF and IN1− is a virtual ground, so the output peak is
// 1 V × 100 kΩ / (10 kΩ + 50 Ω) = 9.950 V (gain −10, under the ±10.5 V clip).
//
// Layout, by the chip's own columns. With U1 at f30 (OUT1 f30, IN1− f31,
// IN1+ f32, V− f33 along row f; V+ e30 across the gap) it is the layout of
// e2e/tl072.spec.js:
//   supply    PS1 + → tp_63, COM → tn_63, − → bn_63; tn_1 → bp_1 (bp is
//             COM too); V+ tp_30 → a30; V− bn_33 → j33.
//   input     IN1+ j32 → bp_32; R1 10 kΩ i35–i31 (IN1−); FG1 OUT → g35,
//             COM → tn_62.
//   feedback  R2 100 kΩ j30 (OUT1)–j34; h34 → h31 joins it to IN1−.
// Nothing else crosses OUT1's column, and half 2 of the chip stays unused.
//
// lab2Finish(holes) takes the chip's holes by pin name ({ out1: 'f30',
// in1n: 'f31', in1p: 'f32', vneg: 'f33', vpos: 'e30', … }) and returns
// { supply, input, feedback }, each { parts, wires }: parts as Example parts
// ({ type, label, holes, values }), wires as [from, to] (a hole, or
// LABEL.k for a pin by index: PS1.0 is +, PS1.1 COM, PS1.2 −; FG1.0 OUT,
// FG1.1 COM).

const colOf = hole => Number(String(hole).slice(1));

function lab2Finish(holes) {
  const need = ['out1', 'in1n', 'in1p', 'vneg', 'vpos'];
  for (const pin of need) {
    if (!holes || !/^[a-j]\d+$/.test(String(holes[pin]))) {
      throw new Error(`lab2Finish needs the chip's ${pin} hole; got ${JSON.stringify(holes)}`);
    }
  }
  // The layout puts the resistors below the chip (rows g–j) and V+'s wire
  // above it (row a): pins 1–4 in row f, V+ in row e (the chip at f30, as
  // the plan's starter has it).
  const rowsOk = ['out1', 'in1n', 'in1p', 'vneg'].every(p => holes[p][0] === 'f') && holes.vpos[0] === 'e';
  if (!rowsOk) throw new Error(`lab2Finish expects pins 1–4 in row f and V+ in row e (U1 at f30); got ${JSON.stringify(holes)}`);

  const c = Object.fromEntries(need.map(p => [p, colOf(holes[p])]));
  return {
    supply: {
      parts: [],
      wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'], ['tn_1', 'bp_1'],
              ['tp_' + c.vpos, 'a' + c.vpos], ['bn_' + c.vneg, 'j' + c.vneg]],
    },
    input: {
      parts: [{ type: 'resistor', label: 'R1', holes: ['i' + (c.in1n + 4), 'i' + c.in1n], values: { resistance: 10000 } }],
      wires: [['j' + c.in1p, 'bp_' + c.in1p], ['FG1.0', 'g' + (c.in1n + 4)], ['FG1.1', 'tn_62']],
    },
    feedback: {
      parts: [{ type: 'resistor', label: 'R2', holes: ['j' + c.out1, 'j' + (c.out1 + 4)], values: { resistance: 100000 } }],
      wires: [['h' + (c.out1 + 4), 'h' + c.in1n]],
    },
  };
}

// Every stage at once: the finished board's additions.
function lab2FinishAll(holes) {
  const s = lab2Finish(holes);
  const stages = [s.supply, s.input, s.feedback];
  return { parts: stages.flatMap(x => x.parts), wires: stages.flatMap(x => x.wires) };
}

module.exports = { lab2Finish, lab2FinishAll };
