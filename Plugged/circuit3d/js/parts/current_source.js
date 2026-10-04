// ─────────────────────────────────────────────────────────────
//  parts/current_source.js — an ideal current source, a registry part
//  (issue #38). The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  A textbook source for nodal analysis: one I element that pushes its set
//  current whatever the voltage across it. Inside it the current flows from
//  `from` to `to`, so outside it leaves `to` and comes back into `from`.
//  It is a source (ref 'from'), so `from` is 0 V when it is the earliest
//  source of its circuit. With no loop outside it the simulator reports
//  "no path for the current" instead of a reading.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./current_source.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // current: the set current in mA; voltage: V(to) − V(from), null floating.
  function measure(r) {
    const { from, to } = r.pins || {};
    const voltage = from == null || to == null ? null : to - from;
    return { current: r.values.current * 1000, voltage };
  }

  const across = m => (m.voltage == null ? 'not connected' : `${m.voltage.toFixed(1)} V across`);
  const report = (r, m) => `${+m.current.toFixed(2)} mA · ${across(m)}`;

  function line(r, m) {
    if (m.voltage == null) return null;
    return { text: '  CURRENT SOURCE ' + report(r, m), cls: 'sim-info' };
  }

  // ── The model: a little blue bench box standing over its two holes ──
  //  legs[0] = from, legs[1] = to. The box is drawn at full size (L × D ×
  //  BOX_H, on rubber feet FEET high) and scaled to the span: a short span
  //  gets a smaller box. Its front (+z along a row, +x down a column) has
  //  the black FROM jack over the from lead, the red TO jack over the to
  //  lead and, between them, the source's symbol: a circle with an arrow
  //  pointing to TO, where the current leaves. The grey knob on top sits
  //  at the set current on a log dial (0.1 mA at −135°, 1 A at +135°).
  //  A lead runs from under the box down into each hole; a hole past the
  //  box's end gets a lead out of the end wall.
  const L = 1.6, D = 0.92, BOX_H = 0.56, FEET = 0.12;
  const JACK_X = 0.56;                         // each jack's distance from the middle
  const KNOB_R = 0.2, KNOB_H = 0.24, KNOB_Z = -0.03;
  const KNOB_SWEEP = Math.PI * 1.5;
  const knobAngle = amps => {
    const t = (Math.log10(Math.min(1, Math.max(1e-4, amps || 0.01))) + 4) / 4;   // 0 at 0.1 mA, 1 at 1 A
    return -(t - 0.5) * KNOB_SWEEP;
  };

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // from
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // to
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const mid = A.clone().add(B).multiplyScalar(0.5);

    // The frame: local +x runs along the span (world +x on a row, world −z
    // down a column), so the front, local +z, faces the camera or the right.
    const alongRow = Math.abs(bx - ax) >= Math.abs(bz - az);
    const frame = new THREE.Group();
    frame.position.set(mid.x, 0, mid.z);
    frame.rotation.y = alongRow ? 0 : Math.PI / 2;
    group.add(frame);
    const localX = p => (alongRow ? p.x - mid.x : mid.z - p.z);
    const fromX = localX(A), toX = localX(B);
    const fromSide = Math.sign(fromX) || -1;           // −1: FROM on the left of the front

    // The box, at full size, scaled to the span
    const s = Math.min(1, Math.max(0.75, (A.distanceTo(B) + 0.36) / L));
    const box = new THREE.Group();
    box.scale.setScalar(s);
    frame.add(box);
    const add = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || box).add(m);
      return m;
    };
    const blue = ctx.mat.surface(0x113a94, { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 });
    const rubber = ctx.mat.surface(0x161618, { roughness: 0.85 });
    const chrome = ctx.mat.surface(0xc8cbd0, { metalness: 1, roughness: 0.25, side: THREE.DoubleSide });

    // The case: a base and a lid a hair proud of it (the seam between
    // them runs round the box), on four rubber feet
    const SPLIT = 0.42;
    add(ctx.roundBox(L - 0.014, BOX_H * SPLIT + 0.04, D - 0.014, 0.05), blue, 0, FEET + (BOX_H * SPLIT + 0.04) / 2, 0);
    add(ctx.roundBox(L, BOX_H * (1 - SPLIT), D, 0.07), blue, 0, FEET + BOX_H * (1 + SPLIT) / 2, 0);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.075, 0.085, FEET + 0.01, 20), rubber, x * (L / 2 - 0.15), (FEET + 0.01) / 2, z * (D / 2 - 0.13));
      }
    }
    const top = FEET + BOX_H;

    // The jacks: a plastic collar round a chrome socket, out of the front
    const JACK_Y = FEET + BOX_H * 0.36;
    const jack = (x, hex) => {
      const collar = add(ctx.lathe([[0.13, 0], [0.13, 0.03], [0.112, 0.045], [0.106, 0.11], [0.098, 0.126],
                                    [0.07, 0.132], [0.054, 0.126]], 36),
                         ctx.mat.surface(hex, { roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }), x, JACK_Y, D / 2 - 0.005);
      collar.rotation.x = Math.PI / 2;
      const socket = add(ctx.lathe([[0.056, 0.128], [0.046, 0.13], [0.04, 0.12], [0.038, 0.06], [0, 0.06]], 28),
                         chrome, x, JACK_Y, D / 2 - 0.005);
      socket.rotation.x = Math.PI / 2;
    };
    jack(fromSide * JACK_X, 0x18181a);    // FROM, black
    jack(-fromSide * JACK_X, 0xc41a1c);   // TO, red

    // The knob: grey, knurled, a skirt at its foot and a line on its crown
    const knob = new THREE.Group();
    knob.position.set(0, top, KNOB_Z);
    knob.rotation.y = knobAngle(values && values.current);
    box.add(knob);
    const grey = ctx.mat.surface(0x5d6166, { roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.35 });
    add(new THREE.CylinderGeometry(KNOB_R * 1.12, KNOB_R * 1.16, 0.05, 48), ctx.mat.surface(0x585b60, { roughness: 0.5 }), 0, 0.025, 0, knob);
    const knurl = new THREE.CylinderGeometry(KNOB_R, KNOB_R, KNOB_H - 0.05, 60, 1);
    const pos = knurl.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (Math.hypot(x, z) < KNOB_R * 0.99) continue;   // the caps' centres
      const k = (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 60) % 2) ? 1 : 0.95;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    knurl.computeVertexNormals();
    add(knurl, grey, 0, 0.05 + (KNOB_H - 0.05) / 2, 0, knob);
    add(ctx.lathe([[KNOB_R * 0.97, 0], [KNOB_R * 0.9, 0.025], [KNOB_R * 0.6, 0.04], [0, 0.045]], 48), grey, 0, KNOB_H, 0, knob);
    add(new THREE.BoxGeometry(0.03, 0.012, KNOB_R * 0.75), ctx.mat.surface(0x2c2d30, { roughness: 0.5 }),
        0, KNOB_H + 0.04, -KNOB_R * 0.5, knob);

    // The print: the dial's ticks round the knob, and the front's FROM, TO
    // and symbol (white on the blue)
    if (!ctx.ghost) {
      const dial = ctx.print(D - 0.1, D - 0.1, (g, w, h) => {
        const k = w / (D - 0.1), cx = w / 2, cy = h / 2 + KNOB_Z * k;
        g.strokeStyle = '#eef2f8';
        g.lineCap = 'round';
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 2 + (i / 10 - 0.5) * KNOB_SWEEP, long = i % 5 === 0;
          g.lineWidth = (long ? 0.022 : 0.016) * k;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * KNOB_R * 1.3 * k, cy + Math.sin(a) * KNOB_R * 1.3 * k);
          g.lineTo(cx + Math.cos(a) * KNOB_R * (long ? 1.78 : 1.62) * k, cy + Math.sin(a) * KNOB_R * (long ? 1.78 : 1.62) * k);
          g.stroke();
        }
      }, 600);
      dial.position.set(0, top + 0.003, 0);
      box.add(dial);

      const FW = L - 0.16, FH = BOX_H - 0.08;
      const face = ctx.print(FW, FH, (g, w, h) => {
        const k = w / FW, u = x => w / 2 + x * k, v = y => h / 2 - (y - (FEET + BOX_H / 2)) * k;
        g.fillStyle = g.strokeStyle = '#f2f5fa';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${Math.round(0.1 * k)}px "Helvetica Neue", Arial, sans-serif`;
        g.fillText('FROM', u(fromSide * JACK_X), v(top - 0.11));
        g.fillText('TO', u(-fromSide * JACK_X), v(top - 0.11));
        // The symbol: a circle with its leads' stubs, an arrow to TO
        const r = 0.17 * k, cx = u(0), cy = v(FEET + BOX_H * 0.5), dir = -fromSide;
        g.lineWidth = 0.022 * k;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(cx + side * r * 0.86, cy);
          g.lineTo(cx + side * r * 1.18, cy);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(cx - dir * r * 0.6, cy);
        g.lineTo(cx + dir * r * 0.25, cy);
        g.stroke();
        g.beginPath();
        g.moveTo(cx + dir * r * 0.62, cy);
        g.lineTo(cx + dir * r * 0.12, cy - r * 0.3);
        g.lineTo(cx + dir * r * 0.12, cy + r * 0.3);
        g.closePath();
        g.fill();
      }, 600);
      face.rotation.set(0, 0, 0);
      face.position.set(0, FEET + BOX_H / 2, D / 2 + 0.004);
      box.add(face);
    }

    // The leads: straight down from under the box, or out of its end wall
    // and down when the hole is past the box's end
    const under = FEET * s, end = (L / 2) * s;
    for (const hx of [fromX, toX]) {
      const at = new THREE.Vector3(hx, -0.05, 0);
      const pts = Math.abs(hx) <= end - 0.1
        ? [new THREE.Vector3(hx, under + 0.02, 0), at]
        : [new THREE.Vector3(Math.sign(hx) * (end - 0.05), under + 0.12 * s, 0),
           new THREE.Vector3(hx, under + 0.12 * s, 0), at];
      frame.add(ctx.bentLead(pts, 0.026, 0.06));
    }

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  // A 10 mA source into two 1 kΩ in parallel: the node sits at 5.0 V.
  const RECIPE = {
    name:  'A 10 mA current source into two 1 kΩ resistors in parallel: the node sits at 5.0 V, 5 mA through each',
    parts: [{ type: 'current_source', label: 'IS1', holes: ['b2', 'b5'] },
            { type: 'resistor', label: 'R1', holes: ['c5', 'c9'], values: { resistance: 1000 } },
            { type: 'resistor', label: 'R2', holes: ['d5', 'd10'], values: { resistance: 1000 } }],
    wires: [['a2', 'tn_2'], ['a9', 'tn_9'], ['a10', 'tn_10']],
    expect: { IS1: { current: [9.99, 10.01], voltage: [4.99, 5.01] },
              R1: { current: [4.99, 5.01] }, R2: { current: [4.99, 5.01] } },
  };

  return {
    type:     'current_source',
    name:     'Current source',
    sub:      'ideal · 0.1 mA–1 A',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="14" r="8" fill="currentColor" ' +
              'fill-opacity="0.15"/><circle cx="14" cy="14" r="8"/><line x1="10" y1="14" x2="18" y2="14"/>' +
              '<polyline points="15 11 18 14 15 17"/><line x1="1" y1="14" x2="6" y2="14"/>' +
              '<line x1="22" y1="14" x2="27" y2="14"/></svg>',
    prefix:   'IS',
    pins:     ['from', 'to'],
    ref:      'from',
    place:    { kind: 'span', span: { min: 2, max: 5, default: 3 }, rotations: ['h', 'v'] },
    values:   {
      current: { unit: 'A', default: 0.01, min: 0.0001, max: 1 },
    },

    elements: v => [{ kind: 'I', pins: ['from', 'to'], amps: v.current }],
    measure,
    line,
    report,

    ai: {
      about:    'An ideal current source: from in holeA, to in holeB, on one row 2–5 columns apart. ' +
                'It pushes its set current (default 10 mA) out of to, whatever the voltage.',
      keywords: ['current source', 'ideal source', 'constant current', 'nodal'],
      guide:    'Current leaves the to pin (holeB) and returns into from (holeA), which is ground: wire the from ' +
                'column to tn_N. It needs no battery. Load the to column with resistors to ground (place_resistor).',
      recipe:   RECIPE,
    },

    view: { build },

    examples: [
      {
        name:  '10 mA from `to` through 1 kΩ back to `from` (on the ground rail): 10.0 V across',
        parts: [{ type: 'current_source', label: 'IS1', holes: ['b2', 'b5'] },
                { type: 'resistor', label: 'R1', holes: ['c5', 'c9'], values: { resistance: 1000 } }],
        wires: [['a2', 'tn_2'], ['a9', 'tn_9']],
        expect: { IS1: { current: [9.99, 10.01], voltage: [9.99, 10.01] }, R1: { current: [9.99, 10.01] } },
      },
      RECIPE,
    ],
  };
});
