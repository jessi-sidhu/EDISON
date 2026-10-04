// ─────────────────────────────────────────────────────────────
//  parts/seven_segment.js — the 7-segment display (issue #43).
//  The rules are docs/API-CONTRACT.md → "Part file contract"; this file is
//  the example for its "Pattern: multi-element straddling part".
//
//  A common-cathode display across the centre gap: 10 pins in datasheet
//  order, pins 1–5 (e d com1 c dp) along the anchor's row and pins 6–10
//  (b a com2 f g) back along the row across the gap. Electrically eight
//  D elements, one per segment (a–g and the dot dp), each from its pin
//  into one internal node '#com', and two closed switches tying the two
//  common pins to it. The lit segments are read back as a digit.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./seven_segment.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const LETTERS  = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const SEGMENTS = LETTERS.concat('dp');
  const VF       = 2.0;    // V, a red segment
  const RON      = 0.1;    // ohm, on-state series resistance
  const LIT_MA   = 1;      // a segment is lit from 1 mA
  const MAX_MA   = 20;     // each segment's rating

  // ── The digit table: lit a–g letters (in order) → the digit shown ──
  //  Pure. Common variants count too: 6 without its top bar, 7 with a
  //  hook, 9 without its bottom bar. Anything else is '?'.
  const DIGITS = {
    abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5',
    acdefg: '6', cdefg: '6', abc: '7', abcf: '7', abcdefg: '8', abcdfg: '9', abcfg: '9',
  };
  const digitOf = segments => DIGITS[segments] || '?';

  const mAOf = (r, s) => Math.max(0, (r.current && r.current[s]) || 0);
  const isLit = (r, s) => r.modes && r.modes[s] === 'on' && mAOf(r, s) >= LIT_MA;

  function elements() {
    const out = SEGMENTS.map(s => ({ kind: 'D', id: s, pins: [s, '#com'], vf: VF, ron: RON }));
    out.push({ kind: 'SW', id: 'com1', pins: ['com1', '#com'], closed: true });
    out.push({ kind: 'SW', id: 'com2', pins: ['com2', '#com'], closed: true });
    return out;
  }

  function measure(r) {
    const segments = LETTERS.filter(s => isLit(r, s)).join('');
    return { segments, digit: digitOf(segments), dp: isLit(r, 'dp') };
  }

  const shown = m => (m.digit !== '?' ? `shows ${m.digit}${m.dp ? '.' : ''}`
    : m.segments || m.dp ? `lit ${m.segments}${m.dp ? (m.segments ? ' + dp' : 'dp') : ''}, no digit` : '');

  function warnings(r) {
    return SEGMENTS.filter(s => mAOf(r, s) > MAX_MA)
      .map(s => `segment ${s} is at ${mAOf(r, s).toFixed(1)} mA, over its ${MAX_MA} mA rating: give it a bigger resistor.`);
  }

  function report(r, m) {
    const most = Math.max(...SEGMENTS.map(s => mAOf(r, s)));
    return shown(m) ? `${shown(m)} (segments ${m.segments || 'none'}), up to ${most.toFixed(1)} mA a segment`
                    : 'dark: no segment lit';
  }

  const line = (r, m) => (shown(m) ? { text: `  🔢 7-SEGMENT DISPLAY ${shown(m)}`, cls: 'sim-on' } : null);

  // ── The model: ten pins under a deep grey body across the gap, and the
  //  digit on its inset black top face (facing up, so the default camera
  //  reads it): pointed, slanted segments and a round decimal point.
  //  The digit's top is toward pins 6–10 and its left toward pin 1, as on
  //  the real part. Each bar is a mesh named 'seg-<segment>'. ──
  const LEGS = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, -1], [3, -1], [2, -1], [1, -1], [0, -1]];
  const LEAD_H = 0.06, BODY_H = 0.62;
  const DIGIT_W = 0.78, DIGIT_H = 1.26, BAR = 0.13, GAP = 0.05;
  const DARK_HEX = 0x3a1010, GLOW_HEX = 0xff2a14, GLOW = 1.6;

  // Where each bar sits on the face: [x, z, along x?], z + toward the digit's bottom.
  const W2 = DIGIT_W / 2, H2 = DIGIT_H / 2, H4 = DIGIT_H / 4;
  const BARS = {
    a: [0, -H2, true], g: [0, 0, true], d: [0, H2, true],
    f: [-W2, -H4, false], b: [W2, -H4, false], e: [-W2, H4, false], c: [W2, H4, false],
  };

  // Hole centres for the legs; legs without holes (a preview with no
  // anchor) are drawn as if at f0, centred on (0, 0, 0).
  function legPoints(ctx, legs) {
    const onBoard = legs.every(l => l && l.col != null && l.row != null);
    if (onBoard) return legs.map(l => ctx.holeWorld(l.col, l.row));
    const pts = LEGS.map(([dc, dr]) => ctx.holeWorld(dc, dr ? 'e' : 'f'));
    const mid = pts.reduce((s, p) => s.add(p), new ctx.THREE.Vector3()).multiplyScalar(1 / pts.length);
    return pts.map(p => p.sub(mid));
  }

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legPoints(ctx, legs);
    const mid = at.reduce((s, p) => s.clone().add(p), new THREE.Vector3()).multiplyScalar(1 / at.length);

    // Ten pins straight down under the body
    for (const p of at) group.add(ctx.bentLead([new THREE.Vector3(p.x, LEAD_H + 0.02, p.z), new THREE.Vector3(p.x, -0.05, p.z)], 0.024));

    // The face turns with the part: local +x runs pin 1 → pin 5, local +z from pins 6–10 toward pins 1–5.
    const right = new THREE.Vector3().subVectors(at[4], at[0]).normalize();
    const face = new THREE.Group();
    face.position.set(mid.x, 0, mid.z);
    face.rotation.y = Math.atan2(-right.z, right.x);
    group.add(face);

    // The body: a deep grey block, its top an inset black face
    const pitch = at[0].distanceTo(at[4]) / 4;
    const bodyW = pitch * 4 + 0.34;
    const bodyD = at[0].distanceTo(at[9]) + 0.64;
    const body = new THREE.Mesh(ctx.roundBox(bodyW, BODY_H, bodyD, 0.03), ctx.mat.surface(0x2b2b2e, { roughness: 0.6 }));
    body.position.y = LEAD_H + BODY_H / 2;
    body.castShadow = true;
    face.add(body);
    const top = LEAD_H + BODY_H;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.1, 0.01, bodyD - 0.1),
                                 ctx.mat.surface(0x0b0b0c, { roughness: 0.3, clearcoat: 0.6 }));
    plate.position.y = top + 0.003;
    face.add(plate);

    // A segment: a flat bar with pointed ends, `len` long, along x or z,
    // slanted like a real display's digit (its bottom leans left).
    const SLANT = 0.1;
    const bar = (name, len, alongX, x, z) => {
      const t = BAR / 2, h = len / 2;
      const s = new THREE.Shape([new THREE.Vector2(-h, 0), new THREE.Vector2(-h + t, -t), new THREE.Vector2(h - t, -t),
                                 new THREE.Vector2(h, 0), new THREE.Vector2(h - t, t), new THREE.Vector2(-h + t, t)]);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      if (!alongX) geo.rotateY(Math.PI / 2 - Math.atan(SLANT));
      const m = ctx.mat.surface(DARK_HEX, { roughness: 0.35 });
      m.emissive.setHex(GLOW_HEX);
      m.emissiveIntensity = 0;
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x - z * SLANT, top + 0.008, z);
      mesh.name = 'seg-' + name;
      face.add(mesh);
    };
    const shift = -0.1;   // the digit sits left of centre, leaving room for the dot
    for (const [s, [x, z, flat]] of Object.entries(BARS)) {
      if (flat) bar(s, DIGIT_W - 2 * GAP, true, x + shift, z);
      else bar(s, DIGIT_H / 2 - 2 * GAP, false, x + shift, z);
    }
    // The decimal point: a round dot
    const dpMat = ctx.mat.surface(DARK_HEX, { roughness: 0.35 });
    dpMat.emissive.setHex(GLOW_HEX);
    dpMat.emissiveIntensity = 0;
    const dp = new THREE.Mesh(new THREE.CylinderGeometry(BAR * 0.6, BAR * 0.6, 0.02, 20), dpMat);
    dp.position.set(W2 + shift + 0.2 - H2 * SLANT, top + 0.018, H2);
    dp.name = 'seg-dp';
    face.add(dp);

    return { group, pinPositions: at.map(p => new THREE.Vector3(p.x, 0, p.z)) };
  }

  // Lights the bars measure() reports lit; all dark with no result (m is {} on Stop).
  function update(obj, m) {
    const group = obj && obj.group;
    if (!group) return;
    for (const s of SEGMENTS) {
      const mesh = group.getObjectByName('seg-' + s);
      if (!mesh) continue;
      const lit = !!m && (s === 'dp' ? m.dp === true : typeof m.segments === 'string' && m.segments.includes(s));
      mesh.material.emissive.setHex(GLOW_HEX);
      mesh.material.emissiveIntensity = lit ? GLOW : 0;
    }
  }

  return {
    type:     'seven_segment',
    name:     '7-segment display',
    sub:      '10 pins · common cathode',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="18" height="24" rx="1.5" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="5" y="2" width="18" height="24" rx="1.5"/>' +
              '<path d="M10 6h7M9 7.5v5M18 7.5v5M10 14h7M9 15.5v5M18 15.5v5M10 22h7" stroke-width="2"/>' +
              '<circle cx="20.5" cy="22" r="0.9" fill="currentColor"/></svg>',
    prefix:   'DS',
    pins:     ['e', 'd', 'com1', 'c', 'dp', 'b', 'a', 'com2', 'f', 'g'],
    place:    { kind: 'footprint', legs: LEGS, straddle: true, rotations: [0, 180] },

    elements,
    measure,
    warnings,
    report,
    line,

    ai: {
      about:    'A common-cathode 7-segment display across the centre gap: 10 pins, segments a–g and the dot dp. ' +
                'Its lit segments show a digit.',
      keywords: ['7 segment', 'seven segment', '7-segment', 'seven-segment', 'digit display', 'number display'],
      guide:    'Each segment needs its own resistor (place_resistor); common pins go to ground. ' +
                'At hole f30, direction right, each pin sits in: e=f30 d=f31 com1=f32 c=f33 dp=f34 (bottom half, ' +
                'feed from rows g–j) and g=e30 f=e31 com2=e32 a=e33 b=e34 (top half, feed from rows a–d). ' +
                'Feed each lit segment from + through its own 470 Ω into its column. Wire a32 (com2) to tn. ' +
                '1 = b c; 7 = a b c; 8 = all seven.',
      // The digit-7 build, proven on the simulator: the server writes it into
      // the prompt as numbered steps whenever place_seven_segment is sent.
      recipe: {
        name:  "a, b and c each through their own 470 Ω from 9 V, com2 to ground: it shows '7'",
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'seven_segment', label: 'DS1',
                  holes: ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30'] },
                { type: 'resistor', label: 'R1', holes: ['b33', 'b37'], values: { resistance: 470 } },   // a
                { type: 'resistor', label: 'R2', holes: ['c34', 'c39'], values: { resistance: 470 } },   // b
                { type: 'resistor', label: 'R3', holes: ['h33', 'h37'], values: { resistance: 470 } }],  // c
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'],
                ['tp_37', 'a37'], ['tp_39', 'a39'], ['e37', 'f37'], ['a32', 'tn_32']],
        expect: { DS1: { digit: '7', segments: 'abc', dp: false } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  "b and c each through 470 Ω from 9 V, commons to ground: it shows '1'",
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'seven_segment', label: 'DS1',
                  holes: ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30'] },
                { type: 'resistor', label: 'R1', holes: ['c34', 'c39'] },    // b
                { type: 'resistor', label: 'R2', holes: ['h33', 'h37'] }],   // c
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_1', 'bp_1'], ['tn_1', 'bn_1'],
                ['tp_39', 'a39'], ['bp_37', 'j37'], ['a32', 'tn_32'], ['j32', 'bn_32']],
        expect: { DS1: { digit: '1', segments: 'bc', dp: false } },
      },
    ],
  };
});
