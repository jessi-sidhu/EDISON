// ─────────────────────────────────────────────────────────────
//  edison/course-data.js — the ENSC 220 course hub's content and
//  sample data (contract "Edison and the course hub" → Course data).
//
//  EXPORTS
//  ───────
//  Browser: window.CourseData
//  Node:    module.exports, so a test runner can read it.
//
//  Grades, the heat-map and the feed are sample data: the names are
//  invented and the counts are made up.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const CourseData = factory();
  if (typeof module === 'object' && module.exports) module.exports = CourseData;
  if (root) root.CourseData = CourseData;
})(typeof window !== 'undefined' ? window : null, function () {

  const course = { code: 'ENSC 220', title: 'Electric Circuits I', term: 'Fall 2026', instructor: 'Instructor' };

  const announcements = [
    { date: 'Oct 3',  text: 'Midterm 1 is in class on Oct 16. It covers Ohm\'s law, KCL and KVL, and dividers.' },
    { date: 'Oct 3' , text: 'Lab 2 is open. Bring your pre-lab answers; the lab sheet checks your readings as you build.' },
    { date: 'Oct 3' , text: 'Lab 1 marks are in. The usual slip was measuring R2 across the wrong pair of holes.' },
    { date: 'Oct 3' , text: 'Office hours move to Thursday, 2–3 pm, this week.' },
  ];

  // id is what ?lab= takes in the editor.
  const labs = [
    { id: 'lab1', code: 'LAB-01', title: 'Series-parallel resistors',   due: 'Oct 3' , status: 'done' },
    { id: 'lab2', code: 'LAB-02', title: 'Op-amps and the sine source', due: 'Oct 9',  status: 'open' },
    { id: 'lab3', code: 'LAB-03', title: 'RC charging',                 due: 'Oct 23', status: 'locked', opens: 'Opens week 6' },
    { id: 'lab4', code: 'LAB-04', title: 'Thévenin equivalents',        due: 'Nov 6',  status: 'locked', opens: 'Opens week 8' },
    { id: 'lab5', code: 'LAB-05', title: 'AM radio front end',          due: 'Nov 20', status: 'locked', opens: 'Opens week 10' },
  ];

  // The textbook. A body is plain text, paragraphs split by a blank line. A
  // figure is a live circuit (a path from Plugged/) that viewer.html?circuit=
  // draws and the editor's ?open= loads; the figures and the text quote the
  // same values, so change them together.
  const para = (...ps) => ps.join('\n\n');
  const chapters = [
    { n: 1, title: 'Ohm\'s law and power', sections: [
      { n: '1.1', title: 'Voltage, current and resistance', figure: 'edison/figures/ohm.sparky', body: para(
        'Current is the flow of electric charge, measured in amperes (A). Voltage is the push that drives it: the difference in electric potential between two points, measured in volts (V). A resistor opposes the flow, and its resistance is measured in ohms (Ω).',
        'Ohm\'s law ties the three together: V = IR. The voltage across a resistor equals the current through it times its resistance. Rearranged, I = V / R gives the current when you know the voltage, and R = V / I gives the resistance from two meter readings.',
        'In Figure 1.1 a bench supply puts 10 V across a 1 kΩ resistor, so the current is I = 10 V / 1000 Ω = 10 mA. Double the voltage and the current doubles; double the resistance and it halves. Figure 1.2 plots current against voltage for 1 kΩ and 2 kΩ.') },
      { n: '1.2', title: 'Power', body: para(
        'A resistor turns electrical energy into heat. The rate is the power, P = VI, measured in watts (W). Substituting Ohm\'s law gives two more forms, P = I²R and P = V² / R, so you can use whichever needs only the values you know.',
        'The resistor in Figure 1.1 takes P = 10 V × 10 mA = 0.1 W. A common through-hole resistor is rated for 0.25 W, so it runs warm but safe. At 20 V the same resistor would take (20 V)² / 1000 Ω = 0.4 W, over its rating, and it could burn out. Choose a rating well above the power you calculate; twice is a common rule.') },
    ] },
    { n: 2, title: 'Kirchhoff\'s laws and dividers', sections: [
      { n: '2.1', title: 'Current into a node', body: para(
        'A node is a point where two or more parts connect. On a breadboard, holes a to e of one column are a single node, and so are f to j. Kirchhoff\'s current law (KCL) says the currents into a node add to zero: whatever flows in must flow out, because charge does not build up at a point.',
        'Count a current leaving the node as a negative current into it. If 6 mA flows in and one branch carries 2 mA away, the other branch must carry the remaining 4 mA. Two resistors in series share a node with nothing else attached, so KCL says they carry the same current.') },
      { n: '2.2', title: 'Voltage around a loop', body: para(
        'Kirchhoff\'s voltage law (KVL) says the voltages around any closed loop add to zero. Walk around the loop, adding each rise in potential and subtracting each drop, and you arrive back where you started at the potential you left with. It is energy conservation: a charge that goes once around gains exactly what it loses.',
        'In Figure 2.2 the supply raises the potential by 10 V, and the two resistors drop 4 V and 6 V. Around the loop, 10 − 4 − 6 = 0.') },
      { n: '2.3', title: 'The voltage divider', figure: 'edison/figures/divider.sparky', body: para(
        'Two resistors in series across a supply form a voltage divider. They carry the same current, I = Vs / (R1 + R2), so each takes a share of the supply in proportion to its resistance. The output, taken across R2, is Vout = Vs × R2 / (R1 + R2).',
        'In Figure 2.1, Vs = 10 V, R1 = 1 kΩ and R2 = 1.5 kΩ. The current is 10 V / 2.5 kΩ = 4 mA, R1 drops 4 V, and the middle node sits at 6 V, as KVL requires: 10 − 4 − 6 = 0.',
        'The formula assumes nothing draws current from the middle node. A load there is in parallel with R2, so it lowers the resistance below the node and pulls Vout down. Keep the load\'s resistance much larger than R2, or buffer the output with an op-amp (Chapter 3).') },
    ] },
    { n: 3, title: 'The op-amp', sections: [
      { n: '3.1', title: 'The ideal op-amp', body: para(
        'An operational amplifier, or op-amp, has two inputs and one output. Its symbol is a triangle with the inverting input (−) and the non-inverting input (+) on the flat side and the output at the point. It multiplies the difference between its inputs by a very large gain, about 200 000 for the TL072. Its output cannot pass its supply rails: on ±12 V, a TL072 swings to within about 1.5 V of each rail.',
        'Two rules describe an ideal op-amp. First, no current flows into either input. Second, with negative feedback (a path from the output back to the − input), the output moves until the two inputs are at the same voltage. This is the virtual short: the inputs sit at one voltage, yet no current flows between them. It works because of the gain: 10 V at the output needs only 50 µV between the inputs.') },
      { n: '3.2', title: 'The inverting amplifier', figure: 'edison/figures/inverting.sparky', body: para(
        'Figure 3.2 draws the circuit of Figure 3.1 as a schematic. The + input is tied to ground, so by the virtual short the − input also sits at 0 V. The input voltage then appears across Rin, and a current Vin / Rin flows toward the − input. None of it can enter the op-amp, so all of it continues through Rf to the output, which gives Vout = −(Rf / Rin) × Vin.',
        'The gain is Av = Vout / Vin = −Rf / Rin. On the board, R1 is Rin = 10 kΩ and R2 is Rf = 100 kΩ, so the gain is −10 and the 0.5 V input gives −5 V at the output. The minus sign means the output is inverted: a positive input gives a negative output.',
        'The gain holds only while the output stays inside its rails. A 1.2 V input would ask for −12 V, beyond the −10.5 V a TL072 can reach on ±12 V, so the output clips at about −10.5 V. The TL072 holds two op-amps; the figure uses one and wires the other as a follower with its + input grounded, the usual way to park an unused op-amp.') },
    ] },
  ];

  // Sample grades: invented names, marks out of 10, null when not yet submitted.
  const grades = {
    sample: true,
    students: [
      { name: 'Student A', lab1: 9.5, lab2: 9,    prelab1: 10 },
      { name: 'Student B', lab1: 8,   lab2: null, prelab1: 9 },
      { name: 'Student C', lab1: 7.5, lab2: 8,    prelab1: 8 },
      { name: 'Student D', lab1: 10,  lab2: 9.5,  prelab1: 10 },
      { name: 'Student E', lab1: 6,   lab2: null, prelab1: 7 },
      { name: 'Student F', lab1: 8.5, lab2: 7,    prelab1: 9 },
      { name: 'Student G', lab1: 9,   lab2: null, prelab1: 8.5 },
      { name: 'Student H', lab1: 7,   lab2: 6.5,  prelab1: 8 },
      { name: 'Student I', lab1: 9.5, lab2: 10,   prelab1: 9.5 },
      { name: 'Student J', lab1: 5.5, lab2: null, prelab1: 6 },
      { name: 'Student K', lab1: 8,   lab2: 8.5,  prelab1: 9 },
      { name: 'Student L', lab1: 9,   lab2: null, prelab1: 10 },
    ],
  };

  // Where Lab 2 goes wrong, by hole. The TL072 sits at f30–f33 and e30–e33.
  const heatmap = {
    lab: 'lab2',
    total: 82,
    cells: [
      { hole: 'e30', count: 23, note: 'V+ (pin 8) not wired' },
      { hole: 'f33', count: 17, note: 'V− (pin 4) not wired' },
      { hole: 'g32', count: 14, note: 'Rin on pin 3 instead of pin 2' },
      { hole: 'e31', count: 9,  note: 'Rf taken from pin 7 instead of pin 1' },
      { hole: 'j27', count: 6,  note: 'Generator lead one column off' },
    ],
  };

  const feed = [
    { minsAgo: 1,  lab: 'LAB-02', step: 1, label: 'U1', text: 'V+ (pin 8) not wired' },
    { minsAgo: 5,  lab: 'LAB-01', step: 3, label: 'R2', text: 'R2 is 220 Ω, expected 2.2 kΩ' },
    { minsAgo: 9,  lab: 'LAB-02', step: 5, label: 'U1', text: 'Output clipping at +10.5 V' },
    { minsAgo: 13, lab: 'LAB-02', step: 2, label: 'R1', text: 'Rin wired to pin 3 instead of pin 2' },
    { minsAgo: 17, lab: 'LAB-01', step: 7, label: 'R3', text: 'Measured across the wrong pair of holes' },
  ];

  return { course, announcements, labs, chapters, grades, heatmap, feed };
});
