// ─────────────────────────────────────────────────────────────
//  parts/multimeter.js — the multimeter, a registry part (issue #96).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Off the board, like the battery. Two probes, 'red' (MM1.red) and
//  'black' (MM1.black), each a wire end, so a probe goes in any hole.
//  A mode value picks what it is to the circuit:
//    V  one R of 10 MΩ red–black: reads V(red) − V(black)
//    A  one R of 0.1 Ω: reads mA red → black; FUSE above 10 A, so an
//       ammeter wired in parallel (across the battery) blows it
//    Ω  nothing: the main solve doesn't read ohms. ohms() does, on a copy
//       of the board, and only with the probes' circuit unpowered.
//  ai: false: the AI is never sent a tool or a prompt line for it.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser; #97 draws the real meter.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts,
//           and ohms() is window.Multimeter.ohms.
//  Node:    require('./multimeter.js') (parts/index.js does it) gives the
//           definition's fields plus ohms().
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const { def, ohms } = factory();
  Parts.define(def);
  if (node) module.exports = Object.assign({ ohms }, def);
  else root.Multimeter = { ohms };
})(typeof window !== 'undefined' ? window : null, function () {

  const V_OHMS    = 10e6;    // V mode: the meter's input resistance
  const A_OHMS    = 0.1;     // A mode: the shunt
  const FUSE_MA   = 10000;   // A mode: the fuse blows above 10 A
  const TEST_AMPS = 0.001;   // Ω mode: the test current ohms() pushes

  const UNIT = { V: 'V', A: 'mA', 'Ω': 'Ω' };

  function elements(v) {
    if (v.mode === 'A') return [{ kind: 'R', pins: ['red', 'black'], ohms: A_OHMS }];
    if (v.mode === 'Ω') return [];
    return [{ kind: 'R', pins: ['red', 'black'], ohms: V_OHMS }];
  }

  // V: volts red − black (a probe in no powered circuit reads 0 V).
  // A: mA through the shunt, + from red to black. Ω: '--', see ohms().
  function measure(r) {
    const mode = r.values.mode;
    if (mode === 'Ω') return { mode, reading: '--', unit: UNIT[mode], fuse: false };
    if (mode === 'A') {
      const mA = r.current[0] || 0;
      return { mode, reading: mA, unit: UNIT[mode], fuse: Math.abs(mA) > FUSE_MA };
    }
    return { mode, reading: (r.pins.red ?? 0) - (r.pins.black ?? 0), unit: UNIT[mode], fuse: false };
  }

  // The display: '4.50 V', '14.9 mA', 'FUSE', '-- Ω'.
  function shown(m) {
    if (m.fuse) return 'FUSE';
    if (m.mode === 'V') return `${m.reading.toFixed(2)} V`;
    if (m.mode === 'A') return `${m.reading.toFixed(1)} mA`;
    return '-- Ω';
  }

  const number = label => String(label || '').replace(/^\D+/, '');

  // The reading is a headline, not a line(): a headline is shown on every
  // path, the short circuit an ammeter across the battery makes included,
  // so FUSE always shows. With no solve (m is {}) it names the mode.
  const headline = (r, m) => ({
    text: `Multimeter ${number(r.label)}: ${m.mode ? shown(m) : r.values.mode + ' mode'}`,
    cls:  m.fuse ? 'sim-err' : 'sim-info',
  });

  // Ohms between the probes of meter `label`: the board copied with the
  // meter swapped for a 1 mA current source, out of red and back into
  // black, and V / I read off it. A source anywhere in the probes'
  // circuit (joined by wires or any part's elements) would spoil the
  // reading, so it refuses; a source on a separate circuit doesn't matter.
  function ohms(components, wires, label) {
    const Sim = typeof module === 'object' && module.exports ? require('../simulate.js') : window.Sim;
    const meter = components.find(c => c.label === label);

    const graph = Sim.buildGraph(components, wires);
    const uf = new Sim.UnionFind();
    graph.forEach(g => g.part && g.part.els.forEach(e => e.nodes.forEach(n => uf.union(e.nodes[0], n))));
    const probes = graph.find(g => g.comp === meter).nodes.map(n => uf.find(n));
    const powered = graph.some(g => g.part && g.part.def.ref !== undefined && g.nodes.some(n => probes.includes(uf.find(n))));
    if (powered) return { reading: '--', unit: 'Ω', why: 'Ω mode reads with the power off: turn the power off first' };

    // current_source pins are [from, to] and its current leaves `to`: so
    // pin 0 (from) takes the meter's black wires and pin 1 (to) its red.
    const probe = { type: 'current_source', label, pins: meter.pins, values: { current: TEST_AMPS } };
    const swap = c => (c === meter ? probe : c);
    const flip = (c, i) => (c === meter ? 1 - i : i);
    const copy = wires.map(w => Object.assign({}, w, {
      startComp: swap(w.startComp), startPinIdx: flip(w.startComp, w.startPinIdx),
      endComp:   swap(w.endComp),   endPinIdx:   flip(w.endComp, w.endPinIdx),
    }));
    const result = Sim.analyze(components.map(swap), copy);
    const m = result.status === 'ok' && result.parts[label] ? result.parts[label].m : null;
    if (!m || m.voltage == null) return { reading: 'OL', unit: 'Ω' };   // no path between the probes
    return { reading: m.voltage / TEST_AMPS, unit: 'Ω' };
  }

  // ── The model: a placeholder body with a red and a black probe socket ──
  //  #97 builds the real meter (dial and display).
  function build(ctx) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const W = 1.6, H = 0.5, D = 2.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), ctx.mat.label(0xf2b400));
    body.position.y = H / 2;
    body.castShadow = true;
    group.add(body);
    const sockets = [[-0.35, 0xdd2222], [0.35, 0x111111]];   // red, black
    for (const [x, hex] of sockets) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 14), ctx.mat.label(hex));
      s.position.set(x, H + 0.1, D * 0.3);
      group.add(s);
    }
    return { group, pinPositions: sockets.map(([x]) => new THREE.Vector3(x, H + 0.2, D * 0.3)) };
  }

  const def = {
    type:     'multimeter',
    name:     'Multimeter',
    sub:      'V · A · Ω · red and black probes',
    category: 'Instruments',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="16" height="24" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="6" y="2" width="16" height="24" rx="2"/>' +
              '<rect x="9" y="5" width="10" height="5" rx="1"/><circle cx="14" cy="16" r="3"/>' +
              '<circle cx="10.5" cy="22.5" r="1"/><circle cx="17.5" cy="22.5" r="1"/></svg>',
    prefix:   'MM',
    pins:     ['red', 'black'],
    place:    { kind: 'offboard' },
    values:   { mode: { choices: { V: {}, A: {}, 'Ω': {} }, default: 'V' } },

    elements,
    measure,
    report:   (r, m) => `${m.mode} mode, reading ${shown(m)}`,
    headline,

    ai: false,

    view: { build },

    examples: [
      {
        name:  'V mode across R2 of a 1 kΩ / 1 kΩ divider on 9 V reads 4.50 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } },
                { type: 'resistor', label: 'R2', holes: ['b14', 'b18'], values: { resistance: 1000 } },
                { type: 'multimeter', label: 'MM1' }],
        wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c18', 'tn_18'],
                ['MM1.red', 'd14'], ['MM1.black', 'd18']],
        expect: { MM1: { mode: 'V', reading: [4.49, 4.51], fuse: false } },
      },
      {
        name:  'A mode in series with a 470 Ω red LED loop on 9 V reads 14.9 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['b18', 'b14'] },
                { type: 'multimeter', label: 'MM1', values: { mode: 'A' } }],
        wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c18', 'MM1.red'], ['MM1.black', 'tn_18']],
        expect: { MM1: { mode: 'A', reading: [14.85, 14.95], fuse: false } },
      },
    ],
  };

  return { def, ohms };
});
