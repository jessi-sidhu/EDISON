// ─────────────────────────────────────────────────────────────
//  parts/tl072.js — the TL072 dual op-amp (issue #117).
//  The rules are docs/API-CONTRACT.md → "Part file contract"; the pattern
//  is seven_segment.js's straddling footprint.
//
//  A DIP-8 across the centre gap, pins in datasheet order: 1 OUT1,
//  2 IN1−, 3 IN1+, 4 V− along the anchor's row, and 5 IN2+, 6 IN2−,
//  7 OUT2, 8 V+ back along the row across the gap. Electrically two E
//  elements (one per op-amp), each from its OUT to V− with rails
//  [V−, V+]: it amplifies, clips 1.5 V inside its rails, and limits its
//  output to 20 mA. The inputs draw no current (JFET inputs). With
//  either rail unsupplied, the simulator leaves both outputs open.
//
//  The AI (#118): its pack goes only with place_tl072 (keywords below),
//  and it is listed in the catalogue only then (ai.listed 'in-play'), so
//  the demo prompt is unchanged. The recipe is the inverting −10.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./tl072.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // The datasheet's typical figures (Aarmen).
  const GAIN     = 200000;
  const ROUT     = 50;      // ohm
  const HEADROOM = 1.5;     // V inside each rail
  const ILIM     = 0.02;    // A

  const PINS = ['out1', 'in1n', 'in1p', 'vneg', 'in2p', 'in2n', 'out2', 'vpos'];
  const OPS  = [{ id: 'op1', out: 'out1', plus: 'in1p', minus: 'in1n' },
                { id: 'op2', out: 'out2', plus: 'in2p', minus: 'in2n' }];

  function elements() {
    return OPS.map(o => ({ kind: 'E', id: o.id, out: [o.out, 'vneg'], ctrl: [o.plus, o.minus],
                           rails: ['vneg', 'vpos'], gain: GAIN, rout: ROUT, headroom: HEADROOM, ilim: ILIM }));
  }

  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);

  // Per op-amp: Vout (V vs ground, signed), the E's mode, Iout (mA, +
  // sourcing), and unused: both its inputs touch nothing (floating).
  function measure(r) {
    const m = {};
    OPS.forEach((o, k) => {
      m['vout' + (k + 1)] = num(r.pins[o.out]);
      m['mode' + (k + 1)] = r.modes[o.id] || null;
      m['iout' + (k + 1)] = num(r.current[o.id]);
      m['unused' + (k + 1)] = r.pins[o.plus] === null && r.pins[o.minus] === null;
    });
    return m;
  }

  const signed = (v, d) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d) + ' V';
  const plainV = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + ' V';

  // One op-amp's state in words: its Vout, or why it's pinned. A half
  // with both inputs floating is unused, not clipped.
  function state(v, mode, unused) {
    if (mode === 'open') return 'no supply (output open)';
    if (unused) return 'unused';
    if (mode === 'isrc+' || mode === 'isrc−') return `current-limited at ${ILIM * 1000} mA`;
    if (v === null) return 'floating';
    if (mode === 'high' || mode === 'low') return `clipped at ${signed(v, 1)} (the rail)`;
    return plainV(Math.abs(v) < 0.005 ? 0 : v, 2);
  }

  const unpowered = m => m.mode1 === 'open' || m.mode2 === 'open';

  function warnings(r, m) {
    return unpowered(m) ? ['the op-amp has no supply: wire V+ (pin 8) and V− (pin 4)'] : [];
  }

  function report(r, m) {
    if (unpowered(m)) return 'no supply: both outputs open';
    return `op-amp 1 ${state(m.vout1, m.mode1, m.unused1)}; op-amp 2 ${state(m.vout2, m.mode2, m.unused2)}`.slice(0, 80);
  }

  const line = (r, m) => (unpowered(m) ? null
    : { text: `  🔺 TL072 ${r.label}: op-amp 1 ${state(m.vout1, m.mode1, m.unused1)} · op-amp 2 ${state(m.vout2, m.mode2, m.unused2)}`, cls: 'sim-on' });

  // ── The model: eight short leads, a black DIP-8 body across the gap,
  //  a pin-1 notch and dot, and "TL072" on top. ──
  const LEGS = [[0, 0], [1, 0], [2, 0], [3, 0], [3, -1], [2, -1], [1, -1], [0, -1]];
  const LEAD_H = 0.18, BODY_H = 0.3;
  const CANVAS_W = 256, CANVAS_H = 64;

  // Hole centres for the legs; legs without holes (a preview with no
  // anchor) are drawn as if at f0, centred on (0, 0, 0).
  function legPoints(ctx, legs) {
    const onBoard = legs.every(l => l && l.col != null && l.row != null);
    if (onBoard) return legs.map(l => ctx.holeWorld(l.col, l.row));
    const pts = LEGS.map(([dc, dr]) => ctx.holeWorld(dc, dr ? 'e' : 'f'));
    const mid = pts.reduce((s, p) => s.add(p), new ctx.THREE.Vector3()).multiplyScalar(1 / pts.length);
    return pts.map(p => p.sub(mid));
  }

  // "TL072" in light grey on the body's black, for the top face.
  function marking(ctx) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const THREE = ctx.THREE;
    const canvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
    const g = canvas.getContext('2d');
    g.fillStyle = '#141414';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.fillStyle = '#d0d0d0';
    g.font = 'bold 44px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TL072', CANVAS_W / 2, CANVAS_H / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    const m = ctx.mat.label(0xffffff);   // a label material, so the ghost treats it like the rest
    m.map = texture;
    return m;
  }

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legPoints(ctx, legs);
    const mid = at.reduce((s, p) => s.clone().add(p), new THREE.Vector3()).multiplyScalar(1 / at.length);

    // The face turns with the part: local +x runs pin 1 → pin 4, local +z from pins 5–8 toward pins 1–4.
    const right = new THREE.Vector3().subVectors(at[3], at[0]).normalize();
    const face = new THREE.Group();
    face.position.set(mid.x, 0, mid.z);
    face.rotation.y = Math.atan2(-right.z, right.x);
    group.add(face);

    const pitch = at[0].distanceTo(at[3]) / 3;
    const span  = at[0].distanceTo(at[7]);
    const bodyW = pitch * 3 + 0.4;
    const bodyD = span * 0.62;
    const top   = LEAD_H + BODY_H;

    // Each lead rises from its hole and turns in under the body's edge.
    for (const p of at) {
      const foot = new THREE.Vector3(p.x, 0, p.z);
      const knee = new THREE.Vector3(p.x, LEAD_H + BODY_H * 0.4, p.z);
      group.add(ctx.lead(foot, knee, 0.024));
      const toward = new THREE.Vector3(mid.x - p.x, 0, mid.z - p.z);
      const inset = Math.max(0, toward.length() - bodyD / 2) + 0.02;
      group.add(ctx.lead(knee, knee.clone().add(toward.normalize().multiplyScalar(inset)), 0.024));
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, BODY_H, bodyD), ctx.mat.body(0x141414));
    body.position.y = LEAD_H + BODY_H / 2;
    body.castShadow = true;
    face.add(body);

    // The pin-1 notch: a half-round dip in the pin-1 end of the top face.
    const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16, 1, false, 0, Math.PI),
                                 ctx.mat.label(0x050505));
    notch.position.set(-bodyW / 2, top + 0.005, 0);
    face.add(notch);
    // The pin-1 dot, beside pin 1's corner.
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), ctx.mat.label(0x9a9a9a));
    dot.position.set(-bodyW / 2 + 0.17, top + 0.005, bodyD / 2 - 0.13);
    face.add(dot);

    const ink = marking(ctx);
    if (ink) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(bodyW * 0.62, bodyW * 0.62 * CANVAS_H / CANVAS_W), ink);
      label.rotation.x = -Math.PI / 2;
      label.position.set(0.06, top + 0.004, 0);
      label.name = 'marking';
      face.add(label);
    }

    return { group, pinPositions: at.map(p => new THREE.Vector3(p.x, 0, p.z)) };
  }

  return {
    type:     'tl072',
    name:     'TL072 op-amp',
    sub:      'dual op-amp · DIP-8',
    category: 'Semiconductors',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M8 7v14l13-7z" fill="currentColor" fill-opacity="0.1"/>' +
              '<path d="M8 7v14l13-7z"/><path d="M3 10.5h5M3 17.5h5M21 14h4"/><path d="M10 10.5h2.4M10 17.5h2.4M11.2 16.3v2.4" ' +
              'stroke-width="1.3"/></svg>',
    prefix:   'U',
    pins:     PINS,
    place:    { kind: 'footprint', legs: LEGS, straddle: true, rotations: [0, 180] },

    elements,
    measure,
    warnings,
    report,
    line,

    // The input is a second bench supply, PS2 (PS2.0 the signal, PS2.1 on
    // COM), so ai-eval can turn it with set_value whatever holes the AI chose.
    ai: {
      about:    'A TL072 dual op-amp, a DIP-8 across the centre gap: pin 1 (OUT1) in hole. ' +
                'Each output swings to 1.5 V inside its supply rails and limits at 20 mA.',
      keywords: ['op-amp', 'op amp', 'opamp', 'amplifier', 'comparator', 'tl072', 'follower', 'buffer'],
      listed:   'in-play',
      guide:    'Pins: 1 OUT1, 2 IN1−, 3 IN1+, 4 V−, 5 IN2+, 6 IN2−, 7 OUT2, 8 V+; hole=fC, direction=right: ' +
                '1-4 at fC-fC+3, 8-5 eC-eC+3. place_bench_supply PS1: V+ to tp, V− to bn (±12), or tn for a ' +
                'comparator. Input PS2.0; PS2.1 to tn. Inverting: PS2.0→Rin→IN1−; gain −Rf/Rin (place_resistor). ' +
                'Follower, comparator: PS2.0 to IN1+. Follower: OUT1 to IN1−. Comparator: divider sets IN1−, ' +
                'OUT1→R→LED→tn. Use op-amp 1.',
      recipe:   {
        // Vout1 = −(100k/10k)·0.5 V = −5.000 V (finite gain: < 1 mV off).
        name:  'inverting amplifier, gain −10, on ±12 V: PS2 (0.5 V) through Rin 10 kΩ into IN1− (pin 2), ' +
               'Rf 100 kΩ from IN1− to OUT1 (pin 1), IN1+ (pin 3) to COM: OUT1 = −5 V',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'bench_supply', label: 'PS2', values: { voltage: 0.5 } },
                { type: 'tl072', label: 'U1', holes: ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'] },
                { type: 'resistor', label: 'R1', holes: ['g27', 'g31'], values: { resistance: 10000 } },     // Rin
                { type: 'resistor', label: 'R2', holes: ['h31', 'h35'], values: { resistance: 100000 } }],  // Rf
        wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'], ['PS2.1', 'tn_62'],
                ['tp_30', 'a30'], ['bn_33', 'j33'],                  // V+ (pin 8) +12 V, V− (pin 4) −12 V
                ['PS2.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32']], // input into Rin, Rf to OUT1, IN1+ to COM
        expect: { U1: { vout1: [-5.01, -4.99], mode1: 'linear', unused2: true } },
      },
      // One worked build per op-amp request (the AI copies the nearest one),
      // in the same layout: the chip at f30, op-amp 2 unused.
      recipes:  [
        {
          // OUT1 on IN1− makes Vout1 = Vin: 3.000 V (finite gain: < 0.1 mV off).
          name:  'voltage follower on ±12 V: PS2 (3 V) into IN1+ (pin 3), OUT1 (pin 1) wired to IN1− (pin 2): OUT1 = 3 V',
          parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                  { type: 'bench_supply', label: 'PS2', values: { voltage: 3 } },
                  { type: 'tl072', label: 'U1', holes: ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'] }],
          wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS1.2', 'bn_63'], ['PS2.1', 'tn_62'],
                  ['tp_30', 'a30'], ['bn_33', 'j33'],                  // V+ (pin 8) +12 V, V− (pin 4) −12 V
                  ['PS2.0', 'j32'], ['g30', 'g31']],                   // input into IN1+, OUT1 to IN1−
          expect: { U1: { vout1: [2.99, 3.01], mode1: 'linear', unused2: true } },
        },
        {
          // Single 12 V supply (V− on COM). IN1− = 12·5k/(7k + 5k) = 5.000 V.
          // 6 V in: OUT1 high at 10.5 V behind 50 Ω, (10.5 − 2.0)/(1000 + 50) = 8.09 mA
          // through the red LED. Under 5 V, OUT1 sits at 1.5 V, under the LED's 2 V: dark.
          name:  'comparator on one 12 V supply (V− pin 4 on COM): PS2 (6 V) into IN1+ (pin 3), a 7k/5k divider sets ' +
                 'IN1− (pin 2) to 5 V, OUT1 (pin 1) through 1 kΩ to a red LED to COM: lit above 5 V',
          parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                  { type: 'bench_supply', label: 'PS2', values: { voltage: 6 } },
                  { type: 'tl072', label: 'U1', holes: ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'] },
                  { type: 'resistor', label: 'R1', holes: ['b41', 'b45'], values: { resistance: 7000 } },
                  { type: 'resistor', label: 'R2', holes: ['c37', 'c41'], values: { resistance: 5000 } },
                  { type: 'resistor', label: 'R3', holes: ['h26', 'h30'], values: { resistance: 1000 } },
                  { type: 'led', label: 'LED1', holes: ['i24', 'i26'], values: { color: 'red' } }],   // cathode i24, anode i26
          wires: [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63'], ['PS2.1', 'tn_62'],
                  ['tp_30', 'a30'], ['j33', 'tn_33'],                  // V+ (pin 8) +12 V, V− (pin 4) on COM
                  ['tp_45', 'a45'], ['a37', 'tn_37'], ['d41', 'g31'],  // the divider, its 5 V into IN1−
                  ['PS2.0', 'j32'], ['j24', 'tn_24']],                 // input into IN1+, LED cathode to COM
          expect: { U1: { mode1: 'high' }, LED1: { on: true, current: [7.9, 8.3] } },
        },
      ],
    },

    view: { build },

    examples: [
      {
        // Op-amp 1 follows 6 V (1k/1k of +12 V); op-amp 2, IN2+ on COM, follows 0 V.
        name:  'a follower of 6 V on the bench supply at ±12 V: OUT1 at 6 V, linear',
        parts: [{ type: 'bench_supply', label: 'PS1', values: { voltage: 12 } },
                { type: 'tl072', label: 'U1', holes: ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'] },
                { type: 'resistor', label: 'R1', holes: ['a40', 'a45'], values: { resistance: 1000 } },
                { type: 'resistor', label: 'R2', holes: ['b40', 'b35'], values: { resistance: 1000 } }],
        wires: [['PS1.0', 'tp_1'], ['PS1.1', 'tn_1'], ['PS1.2', 'bn_1'],
                ['tp_30', 'a30'], ['bn_33', 'j33'], ['tp_45', 'c45'], ['c35', 'tn_35'],
                ['d40', 'j32'], ['g30', 'g31'], ['a33', 'tn_33'], ['b32', 'b31']],
        expect: { U1: { vout1: [5.99, 6.01], mode1: 'linear', vout2: [-0.01, 0.01], mode2: 'linear' } },
      },
    ],
  };
});
