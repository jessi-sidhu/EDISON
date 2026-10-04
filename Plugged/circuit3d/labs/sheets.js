// ─────────────────────────────────────────────────────────────
//  labs/sheets.js — the lab sheets' steps and checks (issue #151).
//  The shape is docs/API-CONTRACT.md → "Edison and the course hub" →
//  "Lab sheets". tools/lab-sheet.js draws a sheet in the editor.
//
//    LabSheets.get(id)   → { id, code, title, week, starter, steps[{ n,
//                          text, hint, check }] }, or null
//    LabSheets.ids()     → every sheet id
//    LabSheets.evaluate(check, readings, board, memo)
//                        → 'passed' | 'failed' | 'pending'. Never throws.
//                          readings from Readings.from, board the page's
//                          App.state, memo one object per run (for peak).
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

  const SHEETS = {
    lab1: { id: 'lab1', code: 'LAB-01', title: 'Series-parallel resistors', week: 'Week 2', starter: 'labs/lab1.sparky', steps: [
      { n: 1, text: 'Set the bench supply to 10 V.', hint: 'Select PS1 and check its voltage in the inspector.',
        check: { kind: 'part', label: 'PS1' } },
      { n: 2, text: 'Measure the current through R1.', hint: 'R1 carries the whole circuit current. Compare R1 with R2 and R3 in parallel.',
        check: { kind: 'measure', label: 'R1', quantity: 'I', expect: 4.31, unit: 'mA', tol: 0.03, needs: LAB1_PARTS } },
      { n: 3, text: 'Measure the voltage across R2.', hint: 'R2 and R3 share the same two nodes.',
        check: { kind: 'measure', label: 'R2', quantity: 'V', expect: 5.69, unit: 'V', tol: 0.03, needs: LAB1_PARTS } },
      { n: 4, text: 'Measure the current through R3.', hint: 'Use KCL at the node where R2 and R3 meet.',
        check: { kind: 'measure', label: 'R3', quantity: 'I', expect: 1.72, unit: 'mA', tol: 0.03, needs: LAB1_PARTS } },
      { n: 5, text: 'Write down your readings for the report.', hint: 'Export them with the CSV button.',
        check: { kind: 'manual' } },
    ] },
    lab2: { id: 'lab2', code: 'LAB-02', title: 'Op-amps and the sine source', week: 'Week 4', starter: 'labs/lab2.sparky', steps: [
      { n: 1, text: 'Place the TL072 across the centre gap.', hint: 'Pins 1 to 4 sit in one row and pins 5 to 8 in the row across the gap. The dot marks pin 1.',
        check: { kind: 'part', label: 'U1' } },
      { n: 2, text: 'Wire the ±12 V supply to pins 8 and 4.', hint: 'Pin 8 is V+ and goes to the supply\'s +. Pin 4 is V− and goes to its −. The supply\'s COM is ground.',
        check: { kind: 'manual' } },
      { n: 3, text: 'Connect the generator through Rin to pin 2.', hint: 'Rin is 10 kΩ, from the generator\'s OUT to pin 2 (the − input). Wire pin 3 (the + input) and the generator\'s COM to ground.',
        check: { kind: 'part', label: 'R1' } },
      { n: 4, text: 'Add Rf from pin 1 to pin 2.', hint: 'Rf is 100 kΩ, from the output (pin 1) back to the − input (pin 2). The gain is −Rf / Rin.',
        check: { kind: 'part', label: 'R2' } },
      { n: 5, text: 'Run, and read the output peak on the scope.', hint: 'Click Probe, then a hole in pin 1\'s column. The scope shows Vpp; the peak is half of it. With a gain of −10 it is ten times the input\'s peak. A flat top means the output is clipping.',
        check: { kind: 'peak', label: 'U1', pin: 'out1', expect: 10, unit: 'V', tol: 0.03, needs: LAB2_PARTS } },
      { n: 6, text: 'Explain the phase flip in one sentence.', hint: 'The input goes into pin 2, the − input. When the input rises, which way must the output move to keep pin 2 at 0 V?',
        check: { kind: 'manual' } },
    ] },
  };

  const get = id => (Object.prototype.hasOwnProperty.call(SHEETS, id) ? SHEETS[id] : null);
  const ids = () => Object.keys(SHEETS);

  const labelsOf = board => ((board && board.components) || []).map(c => c.label);
  const hasAll   = (board, needs) => !Array.isArray(needs) || needs.every(l => labelsOf(board).includes(l));
  const isNum    = v => typeof v === 'number' && Number.isFinite(v);

  function evaluate(check, readings, board, memo) {
    try {
      if (!check || !readings) return 'pending';
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

  return { get, ids, evaluate };
});
