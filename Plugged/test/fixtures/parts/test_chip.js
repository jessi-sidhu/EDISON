// Test-only part, never loaded by the app: a valid 8-pin `footprint` chip
// that straddles the centre gap, per docs/API-CONTRACT.md → "Placement"
// (issue #28, decision 4). Used by test/footprint.test.js and, through a
// test hook, e2e/footprint.spec.js.
//
// Exports a factory rather than calling Parts.define() (see test_span.js).
// An 8-pin DIP: pins p1–p4 along the anchor's row (e), then p5–p8 back
// along the next row (f). At e20, rotation 0: e20 e21 e22 e23 f23 f22 f21 f20.
//
// Inside, each pin is joined to the pin across the gap by 1 kΩ:
// p1–p8 ('a'), p2–p7 ('b'), p3–p6 ('c'), p4–p5 ('d'). measure() reports the
// current through 'a', so p1 on + and p8 on − of 9 V gives 9 mA.

module.exports = function testChip() {
  return {
    type:     'test_chip',
    name:     'Test chip',
    sub:      '8 pins · DIP · test only',
    category: 'Semiconductors',
    icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18"/></svg>',
    prefix:   'TC',
    pins:     ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    place:    {
      kind: 'footprint',
      legs: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [2, 1], [1, 1], [0, 1]],
      straddle: true,
      rotations: [0, 180],
    },
    elements: () => [
      { kind: 'R', id: 'a', pins: ['p1', 'p8'], ohms: 1000 },
      { kind: 'R', id: 'b', pins: ['p2', 'p7'], ohms: 1000 },
      { kind: 'R', id: 'c', pins: ['p3', 'p6'], ohms: 1000 },
      { kind: 'R', id: 'd', pins: ['p4', 'p5'], ohms: 1000 },
    ],
    measure: r => ({ current: (r && r.current && r.current.a) || 0 }),
    report:  (r, m) => 'p1–p8 ' + ((m && m.current) || 0) + ' mA',
    ai: { about: 'A test-only 8-pin chip that sits across the centre gap.', keywords: ['chip'] },
    view: { build: () => ({ group: null, pinPositions: [] }) },
    examples: [{
      name:  'test chip p1 to p8 across 9 V carries 9 mA',
      parts: [{ type: 'battery',   label: 'BAT1' },
              { type: 'test_chip', label: 'TC1', holes: ['e20', 'e21', 'e22', 'e23', 'f23', 'f22', 'f21', 'f20'] }],
      wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_2'], ['tp_20', 'a20'], ['j20', 'tn_20']],
      expect: { TC1: { current: [8.9, 9.1] } },
    }],
  };
};
