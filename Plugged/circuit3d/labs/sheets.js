// ─────────────────────────────────────────────────────────────
//  labs/sheets.js — the lab sheets' steps and checks (issue #151).
//  The shape is docs/API-CONTRACT.md → "Edison and the course hub" →
//  "Lab sheets". tools/lab-sheet.js draws a sheet in the editor.
//
//    LabSheets.get(id)   → { id, code, title, week, starter, steps[{ n,
//                          text, hint, check }] }, or null
//    LabSheets.ids()     → every sheet id
//    LabSheets.evaluate(check, readings, board, memo, answers?)
//                        → 'passed' | 'failed' | 'pending'. Never throws.
//                          readings from Readings.from, board the page's
//                          App.state, memo one object per run (for peak),
//                          answers the paper's written answers by number.
//      check kinds: part (one label, or labels[] all placed), measure, peak,
//      manual, set (a part's set value, from the board), probes (a meter's
//      red and black probes on the nets of the pins they read), flows (current
//      through a part: its loop is closed), supply (a chip's
//      supply pins at their rails: floating waits, a wrong rail fails) and
//      answer (a written answer of at least four words, LabSheets.written).
//    LabSheets.checkAnswer(item, text)
//                        → 'correct' | 'not yet' | 'empty', a pre-lab answer.
//    LabSheets.giveStep(step, holes, seat?)
//                        → a step's "Give me" build, its holes filled in from
//                          the chip's, each piece with a sentence saying where.
//    LabSheets.readData(row, rows, readings, board, memo)
//                        → { value, ok }, a data row from the simulator;
//                          value null until it can be read. Never throws.
//
//  A sheet may carry its lab manual too (Lab 2 does): due, objective,
//  reading, equipment[], prelab[], data[] and questions[]. The editor's
//  lab paper draws them around the steps; a sheet without them is steps only.
//
//  A half-built circuit is 'pending', never 'failed': a measure or peak
//  check waits while a part in its needs[] is missing from the board, while
//  the part it reads is floating (its V is null), and, for measure, while
//  that part carries no current (|I| < 1e-6 mA: the loop isn't closed).
//  A peak check counts only samples where the op-amp is linear (a reading
//  with no mode counts as linear): a clipped output is not the peak.
//
//  EXPORTS
//  ───────
//  Browser: window.LabSheets
//  Node:    module.exports
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L;
  if (root) root.LabSheets = L;
})(typeof window !== 'undefined' ? window : null, function () {

  // Lab 1's measure checks wait for the whole circuit; so does Lab 2's peak.
  const LAB1_PARTS = ['PS1', 'R1', 'R2', 'R3'];
  const LAB2_PARTS = ['U1', 'R1', 'R2', 'PS1', 'FG1'];

  const COLS = 63;   // the board's columns (board-geometry.js)
  const holeName = h => (/^[a-j]$/.test(h.row) ? h.row + (h.col + 1) : `${h.row}_${h.col + 1}`);
  const ALL_HOLES = [];
  for (let c = 1; c <= COLS; c++) {
    for (const r of 'abcdefghij') ALL_HOLES.push(r + c);
    for (const r of ['tp', 'tn', 'bp', 'bn']) ALL_HOLES.push(`${r}_${c}`);
  }
  // The net a part's pin is on: through the part's own holes first, then any
  // hole (an instrument's pin reaches the board only by its wire).
  function netWith(readings, board, label, pin) {
    const has = n => n && n.pins.some(p => p.label === label && p.pin === pin);
    const c = ((board && board.components) || []).find(x => x.label === label);
    const own = c && Array.isArray(c.holeRefs) ? c.holeRefs.filter(Boolean).map(holeName) : [];
    for (const h of own.concat(ALL_HOLES)) { const n = readings.netOf(h); if (has(n)) return n; }
    return null;
  }

  const SHEETS = {
    // Lab 1 starts from the bench supply alone (at 0 V): the student sets it,
    // places the three resistors, wires them, then measures. labs/lab1.sparky
    // is the finished circuit (the tests' reference): Give me on steps 1–4
    // builds exactly it.
    lab1: { id: 'lab1', code: 'LAB-01', title: 'Series-parallel resistors', week: 'Week 2', starter: 'labs/lab1-start.sparky', steps: [
      { n: 1, text: 'Set the bench supply to 10 V.', hint: 'Select PS1 and set its voltage in the inspector.',
        check: { kind: 'set', label: 'PS1', key: 'voltage', expect: 10, tol: 0.01 },
        give: { set: [{ label: 'PS1', values: { voltage: 10 }, says: 'PS1 set to 10 V' }] } },
      { n: 2, text: 'Place R1 (1 kΩ) from a10 to a14.', hint: 'Pick the resistor, click a10 then a14, and set it to 1 kΩ in the inspector.',
        check: { kind: 'part', label: 'R1' },
        give: { parts: [{ type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 }, says: 'R1 (1 kΩ) from a10 to a14' }] } },
      { n: 3, text: 'Place R2 (2.2 kΩ) and R3 (3.3 kΩ) side by side, from column 14 to column 18.', hint: 'R2 from c14 to c18 and R3 from e14 to e18. Both ends share a column, so they are in parallel.',
        check: { kind: 'part', labels: ['R2', 'R3'] },
        give: { parts: [
          { type: 'resistor', label: 'R2', holes: ['c14', 'c18'], values: { resistance: 2200 }, says: 'R2 (2.2 kΩ) from c14 to c18' },
          { type: 'resistor', label: 'R3', holes: ['e14', 'e18'], values: { resistance: 3300 }, says: 'R3 (3.3 kΩ) from e14 to e18, beside R2: in parallel' },
        ] } },
      { n: 4, text: 'Wire the supply: + to column 10, column 18 to ground.', hint: 'PS1 + to the top + rail and COM to the top − rail, then a jumper from the + rail to b10 and one from a18 to the − rail.',
        check: { kind: 'flows', label: 'R1' },
        give: { wires: [
          ['PS1.0', 'tp_50', 'PS1 + to the top + rail'],
          ['PS1.1', 'tn_50', 'PS1 COM (ground) to the top − rail'],
          ['tp_10', 'b10', 'The + rail to column 10, R1\'s free end (b10)'],
          ['a18', 'tn_18', 'Column 18, where R2 and R3 meet, to ground (a18 to the − rail)'],
        ] } },
      { n: 5, text: 'Run, and measure the current through R1.', hint: 'R1 carries the whole circuit current. Compare R1 with R2 and R3 in parallel.',
        check: { kind: 'measure', label: 'R1', quantity: 'I', expect: 4.31, unit: 'mA', tol: 0.03, needs: LAB1_PARTS },
        give: { run: true, says: 'Started the simulation. Hover R1 to read its current, or put the multimeter in series with it.' } },
      { n: 6, text: 'Measure the voltage across R2.', hint: 'R2 and R3 share the same two nodes.',
        check: { kind: 'measure', label: 'R2', quantity: 'V', expect: 5.69, unit: 'V', tol: 0.03, needs: LAB1_PARTS } },
      { n: 7, text: 'Measure the current through R3.', hint: 'Use KCL at the node where R2 and R3 meet.',
        check: { kind: 'measure', label: 'R3', quantity: 'I', expect: 1.72, unit: 'mA', tol: 0.03, needs: LAB1_PARTS } },
      { n: 8, text: 'Explain why R2 and R3 have the same voltage but different currents.', hint: 'They share both nodes. What does Ohm\'s law say about the current through each?',
        check: { kind: 'answer', q: '6.1' } },
    ],
    due: 'Oct 3',
    objective: 'Build a series-parallel circuit on the 10 V bench supply, predict its currents and voltages with Ohm\'s law and KCL, and check them against the simulator.',
    reading: 'Read first: textbook chapter 2, Kirchhoff\'s laws and dividers.',
    equipment: [
      { label: 'PS1', text: 'Bench supply, set to 10 V' },
      { label: 'R1',  text: 'Resistor, 1 kΩ' },
      { label: 'R2',  text: 'Resistor, 2.2 kΩ' },
      { label: 'R3',  text: 'Resistor, 3.3 kΩ' },
    ],
    prelab: [
      { n: '3.1', q: 'What is R2 in parallel with R3, in kΩ?', answer: 1.32, tol: 0.03, unit: 'kΩ' },
      { n: '3.2', q: 'What current flows through R1, in mA?', answer: 4.31, tol: 0.03, unit: 'mA' },
      { n: '3.3', q: 'What voltage is across R2, in V?', answer: 5.69, tol: 0.03, unit: 'V' },
      { n: '3.4', q: 'What current flows through R3, in mA?', answer: 1.72, tol: 0.03, unit: 'mA' },
    ],
    data: [
      { name: 'I(R1)', expect: 4.31, unit: 'mA', prelab: '3.2', read: { kind: 'reading', label: 'R1', quantity: 'I', needs: LAB1_PARTS } },
      { name: 'V(R2)', expect: 5.69, unit: 'V',  prelab: '3.3', read: { kind: 'reading', label: 'R2', quantity: 'V', needs: LAB1_PARTS } },
      { name: 'I(R3)', expect: 1.72, unit: 'mA', prelab: '3.4', read: { kind: 'reading', label: 'R3', quantity: 'I', needs: LAB1_PARTS } },
    ],
    questions: [
      { n: '6.1', q: 'R2 and R3 share both nodes. Why do they have the same voltage but different currents?' },
      { n: '6.2', q: 'Use KCL at column 14: does the current into the node equal the current out?' },
    ] },
    lab2: { id: 'lab2', code: 'LAB-02', title: 'Op-amps and the sine source', week: 'Week 4', starter: 'labs/lab2.sparky', steps: [
      { n: 1, text: 'Wire the ±12 V supply to pins 8 and 4.', hint: 'U1 starts seated across the centre gap, pin 1 at f30 and pin 8 at e30. Pin 8 is V+ and goes to the supply\'s +. Pin 4 (f33) is V− and goes to its −. The supply\'s COM is ground.',
        check: { kind: 'supply', label: 'U1', pins: { vpos: 12, vneg: -12 }, tol: 0.05 },
        give: { wires: [
          ['PS1.0', 'tp_63', 'PS1 + (+12 V) to the top + rail'],
          ['PS1.1', 'tn_63', 'PS1 COM (ground) to the top − rail'],
          ['PS1.2', 'bn_63', 'PS1 − (−12 V) to the bottom − rail'],
          ['tn_1', 'bp_1', 'A jumper from the top − rail to the bottom + rail, so both are ground'],
          ['tp_{vpos}', 'a{vpos}', 'The +12 V rail to pin 8 (V+), hole a{vpos}'],
          ['bn_{vneg}', 'j{vneg}', 'The −12 V rail to pin 4 (V−), hole j{vneg}'],
        ] } },
      { n: 2, text: 'Connect the generator through Rin (10 kΩ) to pin 2.', hint: 'Rin is 10 kΩ, from the generator\'s OUT to pin 2 (the − input). Wire pin 3 (the + input) and the generator\'s COM to ground.',
        check: { kind: 'part', label: 'R1' },
        give: {
          parts: [{ type: 'resistor', label: 'R1', holes: ['i{in1n+4}', 'i{in1n}'], values: { resistance: 10000 }, says: 'R1 (Rin, 10 kΩ) from i{in1n+4} to i{in1n}, pin 2\'s column' }],
          wires: [
            ['j{in1p}', 'bp_{in1p}', 'Pin 3 (+ input) to ground, j{in1p} to the bottom + rail'],
            ['FG1.0', 'g{in1n+4}', 'FG1 OUT to R1\'s far end, hole g{in1n+4}'],
            ['FG1.1', 'tn_62', 'FG1 COM to ground, the top − rail'],
          ] } },
      { n: 3, text: 'Add Rf (100 kΩ) from pin 1 to pin 2.', hint: 'Rf is 100 kΩ, from the output (pin 1) back to the − input (pin 2). The gain is −Rf / Rin.',
        check: { kind: 'part', label: 'R2' },
        give: {
          parts: [{ type: 'resistor', label: 'R2', holes: ['j{out1}', 'j{out1+4}'], values: { resistance: 100000 }, says: 'R2 (Rf, 100 kΩ) from j{out1}, pin 1\'s column, to j{out1+4}' }],
          wires: [['h{out1+4}', 'h{in1n}', 'A jumper from R2\'s far end (h{out1+4}) back to pin 2 (h{in1n})']] } },
      { n: 4, text: 'Put the multimeter on the output: red probe to pin 1, black probe to ground.', hint: 'Place the multimeter in V mode. Wire its red probe to a free hole in pin 1\'s column (g to i) and its black probe to the top − rail, which is ground.',
        check: { kind: 'probes', label: 'MM1', red: { label: 'U1', pin: 'out1' }, black: { label: 'PS1', pin: 'com' } },
        give: {
          parts: [{ type: 'multimeter', label: 'MM1', holes: null, values: { mode: 'V' }, says: 'MM1, the multimeter, on the bench in V mode' }],
          wires: [
            ['MM1.0', 'g{out1}', 'MM1 red probe to pin 1\'s column (g{out1}): the output'],
            ['MM1.1', 'tn_59', 'MM1 black probe to ground, the top − rail (tn_59)'],
          ] } },
      { n: 5, text: 'Run, and read the output on the scope and the meter.', hint: 'Click Probe, then a hole in pin 1\'s column. The scope shows Vpp; the peak is half of it. With a gain of −10 it is ten times the input\'s peak, and the meter follows the output as it swings. A flat top means the output is clipping.',
        check: { kind: 'peak', label: 'U1', pin: 'out1', expect: 5, unit: 'V', tol: 0.03, needs: LAB2_PARTS },
        give: { run: true, says: 'Started the simulation. Click Probe, then a hole in column {out1} (pin 1) to put the output on the scope; the meter already reads it.' } },
      { n: 6, text: 'Explain the phase flip in one sentence.', hint: 'The input goes into pin 2, the − input. When the input rises, which way must the output move to keep pin 2 at 0 V?',
        check: { kind: 'answer', q: '6.1' } },
    ],
    // The lab manual around the steps (the lab paper). Lab 2 is the AI test
    // set's case 11 (docs/AI-TEST-SET.md): gain −10 on ±12 V, a 0.5 V sine
    // from FG1 (labs/lab2.sparky), the multimeter on the output; about
    // −5.0 V at the input's peak and +5.0 V at its trough, linear.
    // A data row with prelab shows the student's own answer as its expected
    // value, never the key, so the paper doesn't give the answers away.
    // How Give me expects U1 seated (its starter place, rotation 0): pins 1–4
    // in row f, pin 8 in row e. Any other seat gives nothing.
    seat: { f: ['out1', 'in1n', 'in1p', 'vneg'], e: ['vpos'] },
    due: 'Oct 9',
    objective: 'Build an inverting amplifier with a gain of −10 on the ±12 V supply, drive it with a 0.5 V sine from the function generator, and read its output on the scope and the multimeter.',
    reading: 'Read first: textbook §1.4, the inverting op-amp. The TL072 (U1) starts seated across the centre gap at f30; you wire the rest.',
    equipment: [
      { label: 'U1',  text: 'TL072 dual op-amp, across the centre gap' },
      { label: 'R1',  text: 'Rin, 10 kΩ' },
      { label: 'R2',  text: 'Rf, 100 kΩ' },
      { label: 'PS1', text: 'Bench supply, series ±12 V' },
      { label: 'FG1', text: 'Function generator, 0.5 V peak sine at 1 Hz' },
      { label: 'MM1', text: 'Multimeter, V mode, on the output' },
    ],
    prelab: [
      { n: '3.1', q: 'What gain do Rin = 10 kΩ and Rf = 100 kΩ give?', answer: -10, tol: 0.03 },
      { n: '3.2', q: 'FG1 gives a 0.5 V peak sine. What output peak do you expect?', answer: 5, tol: 0.03, unit: 'V' },
      { n: '3.3', q: 'When the input is at its +0.5 V peak, what does the meter on the output read?', answer: -5, tol: 0.03, unit: 'V' },
      { n: '3.4', q: 'On ±12 V the TL072 swings to about ±10.5 V. Above what input peak will the output clip?', answer: 1.05, tol: 0.03, unit: 'V' },
    ],
    data: [
      { name: 'Vin peak',  expect: 0.5, unit: 'V', read: { kind: 'value', label: 'FG1', key: 'amplitude' } },
      { name: 'Vout peak', expect: 5,   unit: 'V', prelab: '3.2', read: { kind: 'peak',  label: 'U1',  pin: 'out1', needs: LAB2_PARTS } },
      { name: 'Gain',      expect: -10,            prelab: '3.1', read: { kind: 'gain',  out: 1, in: 0, sign: -1 } },
      { name: 'Meter at the input\'s peak', expect: -5, unit: 'V', prelab: '3.3', read: { kind: 'atPeak', of: 'MM1', when: 'FG1' } },
      { name: 'Phase',     expect: 'inverted',     read: { kind: 'phase', in: { label: 'FG1' }, out: { label: 'U1', pin: 'out1' }, needs: LAB2_PARTS } },
    ],
    questions: [
      { n: '6.1', q: 'Explain the phase flip in one sentence.' },
      { n: '6.2', q: 'What would the output peak be with Rf = 220 kΩ, and would it clip? Why?' },
    ] },
  };

  const get = id => (Object.prototype.hasOwnProperty.call(SHEETS, id) ? SHEETS[id] : null);
  const ids = () => Object.keys(SHEETS);

  const labelsOf = board => ((board && board.components) || []).map(c => c.label);
  const hasAll   = (board, needs) => !Array.isArray(needs) || needs.every(l => labelsOf(board).includes(l));
  const isNum    = v => typeof v === 'number' && Number.isFinite(v);

  // At least four words: a sentence, not a placeholder.
  const written = text => String(text == null ? '' : text).trim().split(/\s+/).filter(w => /\w/.test(w)).length >= 4;

  function evaluate(check, readings, board, memo, answers) {
    try {
      if (check && check.kind === 'answer') return answers && written(answers[check.q]) ? 'passed' : 'pending';
      if (check && check.kind === 'set') {
        // A part's set value, read from the board: no solve needed.
        const c = ((board && board.components) || []).find(x => x.label === check.label);
        const v = c && c.values ? c.values[check.key] : null;
        return isNum(v) && Math.abs(v - check.expect) <= check.tol * Math.abs(check.expect) ? 'passed' : 'pending';
      }
      if (check && check.kind === 'part' && Array.isArray(check.labels)) {
        return check.labels.every(l => labelsOf(board).includes(l)) ? 'passed' : 'pending';
      }
      if (!check || !readings) return 'pending';
      if (check.kind === 'probes') {
        // A meter's probes: red on the net of the pin it reads, black on ground's.
        const on = (probe, at) => { const n = netWith(readings, board, check.label, probe); return !!n && n.pins.some(p => p.label === at.label && p.pin === at.pin); };
        return on('red', check.red) && on('black', check.black) ? 'passed' : 'pending';
      }
      if (check.kind === 'flows') {
        // Current through the part: its loop is closed.
        const p = readings.part(check.label);
        return p && isNum(p.I) && Math.abs(p.I) >= 1e-6 ? 'passed' : 'pending';
      }
      if (check.kind === 'supply') {
        // Each supply pin's net at its rail. Floating (not wired yet) waits;
        // wired to the wrong voltage (a swapped supply) fails.
        const c = ((board && board.components) || []).find(x => x.label === check.label);
        if (!c || !Array.isArray(c.holeRefs)) return 'pending';
        const holeOf = pin => {
          for (const h of c.holeRefs) {
            if (!h || !/^[a-j]$/.test(h.row)) continue;
            const name = h.row + (h.col + 1);
            const net = readings.netOf(name);
            if (net && net.pins.some(p => p.label === check.label && p.pin === pin)) return name;
          }
          return null;
        };
        let ok = true;
        for (const [pin, want] of Object.entries(check.pins || {})) {
          const hole = holeOf(pin);
          const v = hole ? readings.voltage(hole) : null;
          if (!isNum(v)) return 'pending';
          if (Math.abs(v - want) > check.tol * Math.abs(want)) ok = false;
        }
        return ok ? 'passed' : 'failed';
      }
      if (check.kind === 'part') return labelsOf(board).includes(check.label) ? 'passed' : 'pending';
      if (check.kind === 'measure') {
        if (check.quantity !== 'I' && check.quantity !== 'V') return 'pending';
        if (!hasAll(board, check.needs)) return 'pending';
        const p = readings.part(check.label);
        // A floating part (no V) reads no current either; a part with no
        // current (|I| < 1e-6 mA) sits in a loop that isn't closed yet.
        if (!p || !isNum(p.V) || !isNum(p.I) || !isNum(p[check.quantity])) return 'pending';
        if (Math.abs(p.I) < 1e-6) return 'pending';
        const v = p[check.quantity];
        return Math.abs(Math.abs(v) - Math.abs(check.expect)) <= check.tol * Math.abs(check.expect) ? 'passed' : 'failed';
      }
      if (check.kind === 'peak') {
        if (!hasAll(board, check.needs) || !memo) return 'pending';
        const p = readings.part(check.label); const op = p && p.opamps && p.opamps.find(o => o.pin === check.pin);
        if (!op || !isNum(op.vout)) return 'pending';
        // A clipped or current-limited output isn't the amplifier's peak.
        const key = `${check.label}.${check.pin}`;
        if (op.mode == null || op.mode === 'linear') memo[key] = Math.max(memo[key] || 0, Math.abs(op.vout));
        return isNum(memo[key]) && Math.abs(memo[key] - check.expect) <= check.tol * check.expect ? 'passed' : 'pending';
      }
      return 'pending';
    } catch { return 'pending'; }
  }

  // A pre-lab answer as typed: "−10", "-10", "10 V", "1.05V".
  function checkAnswer(item, text) {
    try {
      const s = String(text == null ? '' : text).trim();
      if (!s) return 'empty';
      const m = /^([+\-−]?\d*\.?\d+)\s*[a-zA-ZΩµ]*$/.exec(s);
      if (!m) return 'not yet';
      const x = Number(m[1].replace('−', '-'));
      return Math.abs(x - item.answer) <= item.tol * Math.abs(item.answer) ? 'correct' : 'not yet';
    } catch { return 'not yet'; }
  }

  // One data row's simulated value, { value, ok }; value null while it can't
  // be read yet. ok: within 3% of expect (a phase: the same word).
  const near = (v, e) => Math.abs(v - e) <= 0.03 * Math.abs(e);
  function readData(row, rows, readings, board, memo) {
    const none = { value: null, ok: null };
    try {
      const r = row && row.read;
      if (!r || !readings) return none;
      if (r.kind === 'value') {
        const c = ((board && board.components) || []).find(x => x.label === r.label);
        const v = c && c.values ? c.values[r.key] : null;
        return isNum(v) ? { value: v, ok: near(v, row.expect) } : none;
      }
      if (r.kind === 'atPeak') {
        // What a meter reads at the source's crest: kept from the sample where
        // the source was highest so far.
        if (!memo) return none;
        const src = readings.part(r.when), m = readings.part(r.of);
        const vin = src && src.V, v = m && m.V;
        const key = `atPeak:${r.of}`;
        if (isNum(vin) && isNum(v) && (!memo[key] || vin > memo[key].vin)) memo[key] = { vin, v };
        const got = memo[key];
        return got && got.vin > 0 ? { value: got.v, ok: near(got.v, row.expect) } : none;
      }
      if (r.kind === 'reading') {
        // A part's own V or I (mA), once its loop is closed.
        if (!hasAll(board, r.needs)) return none;
        const p = readings.part(r.label);
        if (!p || !isNum(p.I) || Math.abs(p.I) < 1e-6 || !isNum(p[r.quantity])) return none;
        const v = Math.abs(p[r.quantity]);
        return { value: v, ok: near(v, row.expect) };
      }
      if (r.kind === 'peak') {
        // The peak check's own memo key, so the sheet and the data agree.
        evaluate({ kind: 'peak', label: r.label, pin: r.pin, expect: row.expect, tol: 0.03, needs: r.needs }, readings, board, memo);
        const v = memo ? memo[`${r.label}.${r.pin}`] : null;
        return isNum(v) && v > 0 ? { value: v, ok: near(v, row.expect) } : none;
      }
      if (r.kind === 'gain') {
        const out = readData(rows[r.out], rows, readings, board, memo).value;
        const inp = readData(rows[r.in], rows, readings, board, memo).value;
        if (!isNum(out) || !isNum(inp) || inp === 0) return none;
        const v = (r.sign || 1) * out / inp;
        return { value: v, ok: near(v, row.expect) };
      }
      if (r.kind === 'phase') {
        if (!hasAll(board, r.needs) || !memo) return none;
        const src = readings.part(r.in.label);
        const p = readings.part(r.out.label); const op = p && p.opamps && p.opamps.find(o => o.pin === r.out.pin);
        const vin = src && src.V, vout = op && op.vout;
        // Only clear samples: the input well off zero, the output too.
        if (isNum(vin) && isNum(vout) && Math.abs(vin) > 0.2 && Math.abs(vout) > 1) {
          memo.phase = Math.sign(vin) === Math.sign(vout) ? 'in phase' : 'inverted';
        }
        return memo.phase ? { value: memo.phase, ok: memo.phase === row.expect } : none;
      }
      return none;
    } catch { return none; }
  }

  // A step's "Give me" with its holes filled in from the chip's own: holes
  // is U1's pins by name ({ out1: 'f30', in1n: 'f31', … }); "{in1n+4}" is
  // that pin's column plus 4. seat (the sheet's) names the row each pin must
  // be in. → { parts[{ type, label, holes, values, says }], wires[{ from,
  // to, says }], run, says } or null: nothing to give, a pin the chip
  // doesn't have, the chip seated otherwise (turned round, say), or a hole
  // off the board's 63 columns. Never throws.
  function giveStep(step, holes, seat) {
    try {
      const g = step && step.give;
      if (!g) return null;
      // The chip must sit as the build expects: each pin in its row.
      for (const [row, pins] of Object.entries(seat || {})) {
        if (!pins.every(pin => holes && new RegExp(`^${row}\\d+$`).test(String(holes[pin])))) return null;
      }
      let bad = false;
      const fill = str => String(str).replace(/\{(\w+)([+-]\d+)?\}/g, (_, pin, off) => {
        const h = holes && holes[pin];
        const col = (h ? Number(String(h).replace(/^[a-z]+/, '')) : Number.NaN) + (off ? Number(off) : 0);
        if (!Number.isInteger(col) || col < 1 || col > COLS) { bad = true; return ''; }
        return String(col);
      });
      const out = {
        parts: (g.parts || []).map(p => ({ type: p.type, label: p.label, holes: p.holes ? p.holes.map(fill) : null, values: Object.assign({}, p.values), says: fill(p.says) })),
        wires: (g.wires || []).map(([from, to, says]) => ({ from: fill(from), to: fill(to), says: fill(says) })),
        set: (g.set || []).map(x => ({ label: x.label, values: Object.assign({}, x.values), says: fill(x.says) })),
        run: !!g.run,
        says: g.says ? fill(g.says) : null,
      };
      return bad ? null : out;
    } catch { return null; }
  }

  return { get, ids, evaluate, written, checkAnswer, readData, giveStep };
});
