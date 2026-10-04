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

  // ── The model: two leads, stubs to a round body, an arrow from → to ──
  //  legs[0] = from, legs[1] = to. The arrow points to `to`, where the
  //  current leaves.
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // from
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // to
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;

    const isHoriz = Math.abs(az - bz) < 0.01;
    const LEAD_H  = 0.4;
    const BODY_R  = 0.3;
    const BODY_H  = 0.16;

    // Upright leads from the holes to body height
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));

    // Stubs from the lead tops to the body's edge
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    if (isHoriz) {
      stub(new THREE.Vector3(ax, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(ax - midX) * BODY_R, LEAD_H, midZ));
      stub(new THREE.Vector3(bx, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(bx - midX) * BODY_R, LEAD_H, midZ));
    } else {
      stub(new THREE.Vector3(midX, LEAD_H, az), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(az - midZ) * BODY_R));
      stub(new THREE.Vector3(midX, LEAD_H, bz), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(bz - midZ) * BODY_R));
    }

    // Body: a flat round disc
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, BODY_H, 28), ctx.mat.body(0x2e5c8a));
    body.position.set(midX, LEAD_H, midZ);
    body.castShadow = true;
    group.add(body);

    // Arrow on top, from `from` toward `to`: a shaft and a cone head
    const dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
    const top = LEAD_H + BODY_H / 2 + 0.02;
    const SHAFT = BODY_R * 0.9, HEAD = BODY_R * 0.5;
    const arrowMat = ctx.mat.body(0xf2f2f2);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, SHAFT), arrowMat);
    const head  = new THREE.Mesh(new THREE.ConeGeometry(0.1, HEAD, 3), arrowMat);
    const yaw = Math.atan2(dir.x, dir.z);
    shaft.rotation.y = yaw;
    shaft.position.set(midX - dir.x * HEAD / 2, top, midZ - dir.z * HEAD / 2);
    head.rotation.set(Math.PI / 2, 0, 0);   // point along +z, then turn with yaw
    const headWrap = new THREE.Group();
    headWrap.add(head);
    headWrap.rotation.y = yaw;
    headWrap.position.set(midX + dir.x * (SHAFT - HEAD) / 2, top, midZ + dir.z * (SHAFT - HEAD) / 2);
    head.scale.set(1, 1, 0.2);
    group.add(shaft, headWrap);

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
