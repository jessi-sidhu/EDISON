// ─────────────────────────────────────────────────────────────
//  parts/battery.js — the 9 V battery, a registry part (issue #26).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Off the board. Pins in today's order: '0' = + (BAT1.0), '1' = −
//  (BAT1.1), and '1' is the ref: the earliest-placed source in each
//  connected circuit is that circuit's ground. One V element.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx. An
//  off-board part is drawn around (0, 0, 0); the page moves the group
//  to where the record sits.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./battery.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // The can, a 9 V block: W wide (x), D deep (z), H to the top plate. Its
  // print faces +z, towards the camera; the terminals stand on top.
  const W = 2.0, H = 2.85, D = 1.3;
  const BAND  = 0.86;                    // the copper top band's height
  const R     = 0.09;                    // the can's corner radius
  const POS_X = -0.5, NEG_X = 0.5;       // the + stud (left) and the − socket (right)
  const PLATE = H + 0.02;                // the black top plate's face, where both terminals stand
  const STUD_H = 0.3, SOCKET_H = 0.22;   // their heights above the plate

  // A rounded-rectangle outline w × d, corners r, as a closed Path (or Shape).
  function roundRect(Kind, w, d, r) {
    const p = new Kind(), x = w / 2, z = d / 2;
    p.moveTo(-x + r, -z);
    p.lineTo(x - r, -z);
    p.quadraticCurveTo(x, -z, x, -z + r);
    p.lineTo(x, z - r);
    p.quadraticCurveTo(x, z, x - r, z);
    p.lineTo(-x + r, z);
    p.quadraticCurveTo(-x, z, -x, z - r);
    p.lineTo(-x, -z + r);
    p.quadraticCurveTo(-x, -z, -x + r, -z);
    return p;
  }

  // ── The model: a 9 V alkaline block ───────────────────────────
  //  A satin black can under a copper band whose rim stands round a black
  //  top plate; on the plate the chrome + stud (left) and the hex − socket
  //  (right) the wires snap to. "9V ALKALINE" (the set voltage) is printed
  //  on the can and + / − on the band, front and back.
  function build(ctx, values) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const black  = ctx.mat.surface(0x121214, { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.28 });
    const copper = ctx.mat.surface(0xbb5c1b, { metalness: 0.5, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const chrome = ctx.mat.surface(0xd2d4d8, { metalness: 1, roughness: 0.2 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      group.add(m);
      return m;
    };

    // The black can, up to the top plate
    const low = H - BAND;
    add(ctx.roundBox(W, PLATE, D, R), black, 0, PLATE / 2, 0);

    // The copper band: a sleeve a hair proud of the can, its rounded rim
    // standing LIP over the plate
    const BEV = 0.02, LIP = 0.06;
    const sleeve = roundRect(THREE.Shape, W + 0.012 - 2 * BEV, D + 0.012 - 2 * BEV, R);
    sleeve.holes.push(roundRect(THREE.Path, W - 0.16, D - 0.16, 0.05));
    const sleeveGeo = new THREE.ExtrudeGeometry(sleeve, { depth: BAND + LIP - 2 * BEV, bevelEnabled: true, bevelThickness: BEV,
                                                          bevelSize: BEV, bevelSegments: 3, curveSegments: 6 });
    sleeveGeo.rotateX(-Math.PI / 2);
    add(sleeveGeo, copper, 0, low + BEV, 0);

    // + : the male stud, a chrome post on a flange with a waist the snap
    // grips, its crown dished
    add(ctx.lathe([[0, 0], [0.21, 0], [0.21, 0.025], [0.17, 0.05], [0.14, 0.06], [0.135, 0.14], [0.12, 0.16],
                   [0.12, 0.18], [0.155, 0.21], [0.165, 0.25], [0.15, 0.285], [0.12, STUD_H], [0.09, 0.292],
                   [0.07, 0.27], [0, 0.265]], 40), chrome, POS_X, PLATE, 0);

    // − : the female socket, a satin hex nut with a rolled lip round its dark mouth
    const nickel = ctx.mat.surface(0xc4c7cc, { metalness: 0.85, roughness: 0.34 });
    const hex = add(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 6), nickel, NEG_X, PLATE + 0.06, 0);
    hex.rotation.y = Math.PI / 6;
    add(ctx.lathe([[0.12, 0], [0.21, 0], [0.22, 0.04], [0.21, 0.08], [0.18, 0.1], [0.145, 0.095],
                   [0.125, 0.07], [0.12, 0.02]], 40), chrome, NEG_X, PLATE + 0.12, 0);
    add(new THREE.CylinderGeometry(0.122, 0.122, 0.02, 28), ctx.mat.surface(0x2a2b2e, { metalness: 0.6, roughness: 0.5 }),
        NEG_X, PLATE + 0.13, 0);

    // The print, on both broad faces: the turn puts the back one's + under the stud too
    if (!ctx.ghost) {
      const volts = `${+Number(values && values.voltage != null ? values.voltage : 9).toFixed(1)}V`;
      for (const back of [false, true]) {
        const z = back ? -(D / 2 + 0.004) : D / 2 + 0.004, turn = back ? Math.PI : 0;
        const can = ctx.print(W - 0.3, low - 0.3, (g, w, h) => {
          g.fillStyle = '#eef0f2';
          g.textAlign = 'center';
          g.textBaseline = 'alphabetic';
          g.font = `700 ${Math.round(h * 0.34)}px "Helvetica Neue", Arial, sans-serif`;
          g.fillText(volts, w / 2, h * 0.5);
          g.font = `600 ${Math.round(h * 0.085)}px "Helvetica Neue", Arial, sans-serif`;
          g.letterSpacing = `${Math.round(h * 0.012)}px`;
          g.fillText('ALKALINE', w / 2, h * 0.66);
        }, 400);
        can.rotation.set(0, turn, 0);
        can.position.set(0, low / 2 + 0.06, z);
        group.add(can);
        const band = ctx.print(W - 0.2, BAND - 0.2, (g, w, h) => {
          g.fillStyle = '#1a1410';
          const at = x => (back ? -x : x) / (W - 0.2) * w + w / 2;
          const t = h * 0.1, l = h * 0.42;
          g.fillRect(at(POS_X) - l / 2, h * 0.55 - t / 2, l, t);
          g.fillRect(at(POS_X) - t / 2, h * 0.55 - l / 2, t, l);
          g.fillRect(at(NEG_X) - l / 2, h * 0.55 - t / 2, l, t);
        }, 400);
        band.rotation.set(0, turn, 0);
        band.position.set(0, H - BAND / 2 - 0.02, back ? z - 0.006 : z + 0.006);
        group.add(band);
      }
    }

    return {
      group,
      pinPositions: [new THREE.Vector3(POS_X, PLATE + STUD_H, 0),     // '0', + (the stud's crown)
                     new THREE.Vector3(NEG_X, PLATE + SOCKET_H, 0)],  // '1', − (the socket's lip)
    };
  }

  // Amps through the one V element, in mA, as a positive magnitude.
  const supplying = r => Math.abs(Object.values(r.current)[0] || 0);
  const number = label => String(label || '').replace(/^\D+/, '');

  return {
    type:     'battery',
    name:     'Battery',
    sub:      '9V · snap connector',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="3" width="8" height="4" rx="1"/>' +
              '<rect x="5" y="7" width="18" height="17" rx="2" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="5" y="7" width="18" height="17" rx="2"/>' +
              '<line x1="9" y1="14" x2="12" y2="14" stroke-width="1.5"/>' +
              '<line x1="10.5" y1="12.5" x2="10.5" y2="15.5" stroke-width="1.5"/>' +
              '<line x1="16" y1="14" x2="19" y2="14" stroke-width="1.5"/></svg>',
    prefix:   'BAT',
    pins:     ['0', '1'],
    ref:      '1',
    place:    { kind: 'offboard' },
    values:   { voltage: { unit: 'V', default: 9, min: 1, max: 24 } },

    elements: v => [{ kind: 'V', pins: ['0', '1'], volts: v.voltage }],
    measure:  r => ({ current: supplying(r) }),
    report:   (r, m) => `${Number(r.values.voltage).toFixed(2)} V battery, supplying ${m.current.toFixed(1)} mA`,
    headline: r => ({ text: `Battery ${number(r.label)}: ${r.values.voltage}V`, cls: 'sim-info' }),

    ai: {
      about:    'A battery beside the board, 9 V unless given a voltage. Wire BAT1.0 (+) to a + rail and ' +
                'BAT1.1 (−) to a − rail.',
      keywords: ['battery', 'power', 'supply', 'volts', 'voltage', 'source'],
    },

    view: { build },

    examples: [
      {
        name:  'A 9 V battery across 470 Ω supplies 19.1 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'] }],
        wires: [['BAT1.0', 'tp_10'], ['BAT1.1', 'tn_14'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { BAT1: { current: [19.1, 19.2] } },
      },
      {
        name:  'A 6 V battery across 1 kΩ supplies 6.0 mA',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 6 } },
                { type: 'resistor', label: 'R1', holes: ['a20', 'a24'], values: { resistance: 1000 } }],
        wires: [['BAT1.0', 'tp_20'], ['BAT1.1', 'tn_24'], ['tp_19', 'b20'], ['b24', 'tn_25']],
        expect: { BAT1: { current: [5.95, 6.05] } },
      },
    ],
  };
});
