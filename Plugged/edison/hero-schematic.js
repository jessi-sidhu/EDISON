// ─────────────────────────────────────────────────────────────
//  edison/hero-schematic.js — the landing hero's schematic (issue #164).
//
//  The circuit the hero builds, edison/demo/led.sparky (a 9 V battery BAT1,
//  R1 470 Ω and a red LED1 in series), drawn the way a textbook drafts it
//  (ref docs/design/landing-v3/05): plate battery, zigzag resistor, LED with
//  two arrows, square-cornered wires with node dots, mono labels.
//
//  SCHEMATIC is the drawing as data, in drawing order. schematicSvg() turns
//  it into the SVG markup for #hero-stage. Every stroke is a
//  <path pathLength="1"> (paths only, for WebKit's dashes) carrying
//  --d (when it starts) and --t (how long it draws), so CSS can draw it at
//  one pen speed. Dots and labels carry --d only: they fade in.
//
//  Browser: window.HeroSchematic.  Node: module.exports.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const HeroSchematic = factory();
  if (typeof module === 'object' && module.exports) module.exports = HeroSchematic;
  if (root) root.HeroSchematic = HeroSchematic;
})(typeof window !== 'undefined' ? window : null, function () {

  // ── The drawing (viewBox units; 16:9) ───────────────────────
  //  A rectangular loop: BAT1 on the left side with + at the top, R1 on the
  //  top wire, LED1 on the right side pointing down (anode up).

  const W = 960, H = 540, CX = W / 2;
  const MID = 288;                                    // the loop's centre line
  const L = 216, R = 744, T = MID - 165, B = MID + 165;

  // R1: six points, half a step in from each end.
  function zigzag(cx, y) {
    const step = 26, amp = 22, pts = [[cx - 3 * step, y]];
    for (let i = 0; i < 6; i++) pts.push([cx - 2.5 * step + i * step, y + (i % 2 ? amp : -amp)]);
    pts.push([cx + 3 * step, y]);
    return pts;
  }

  // An LED arrow: a shaft out at 45° and a filled head at its tip.
  function arrow(x, y) {
    const len = 33, head = 11, half = 5, u = Math.SQRT1_2;
    const tip = [x + len * u, y - len * u], back = [tip[0] - head * u, tip[1] + head * u];
    return [
      { part: 'LED1', pts: [[x, y], back] },
      { part: 'LED1', pts: [tip, [back[0] - half * u, back[1] - half * u], [back[0] + half * u, back[1] + half * u]], closed: true, fill: true },
    ];
  }

  const RZ = zigzag(CX, T);
  const LED_A = MID - 23, LED_K = MID + 24;           // the triangle's base (anode) and the bar (cathode)

  const SCHEMATIC = {
    circuit: 'edison/demo/led.sparky',
    viewBox: [0, 0, W, H],
    strokes: [
      // BAT1: two cells, long plate (+) on top.
      { part: 'BAT1', pts: [[L - 38, MID - 27], [L + 38, MID - 27]] },
      { part: 'BAT1', pts: [[L - 15, MID - 9],  [L + 15, MID - 9]] },
      { part: 'BAT1', pts: [[L - 38, MID + 9],  [L + 38, MID + 9]] },
      { part: 'BAT1', pts: [[L - 15, MID + 27], [L + 15, MID + 27]] },
      // The top wire, from + round the corner to R1.
      { part: 'wire', pts: [[L, MID - 27], [L, T], RZ[0]] },
      { part: 'R1',   pts: RZ },
      // On to the corner and down to the LED's anode.
      { part: 'wire', pts: [RZ[RZ.length - 1], [R, T], [R, LED_A]] },
      // LED1: the triangle, the bar, and two arrows out.
      { part: 'LED1', pts: [[R - 27, LED_A], [R + 27, LED_A], [R, LED_K]], closed: true },
      { part: 'LED1', pts: [[R - 27, LED_K], [R + 27, LED_K]] },
      ...arrow(R + 31, MID - 6),
      ...arrow(R + 43, MID + 6),
      // The return wire, from the cathode back to −.
      { part: 'wire', pts: [[R, LED_K], [R, B], [L, B], [L, MID + 27]] },
    ],
    // Node dots, at the loop's corners. Each fades in as the pen reaches it.
    dots: [[L, T], [R, T], [R, B], [L, B]],
    // value: DM Mono 500 in the ink.  note: smaller, grey.
    labels: [
      { text: '9 V',                   at: [L - 62, MID + 1],  anchor: 'end',    kind: 'value' },
      { text: 'Battery',               at: [L - 62, MID + 26], anchor: 'end',    kind: 'note' },
      { text: '+',                     at: [L + 57, MID - 38], anchor: 'middle', kind: 'value' },
      { text: '−',                     at: [L + 57, MID + 51], anchor: 'middle', kind: 'value' },
      { text: '470 Ω',                 at: [CX, T - 42],       anchor: 'middle', kind: 'value' },
      { text: 'Yellow, Violet, Brown', at: [CX, T + 60],       anchor: 'middle', kind: 'note' },
      { text: 'LED1',                  at: [R + 86, MID + 8],  anchor: 'start',  kind: 'value' },
    ],
  };

  // ── Draw timing ─────────────────────────────────────────────
  //  The strokes take DRAW_MS: each gets a beat (MIN_MS) plus time for its
  //  length at one pen speed, with a short lift between them. Then the
  //  labels fade in one after another.

  const DRAW_MS = 2000, MIN_MS = 60, LIFT_MS = 30, LABEL_STEP_MS = 50;

  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  function strokeLength(s) {
    let n = 0;
    for (let i = 1; i < s.pts.length; i++) n += dist(s.pts[i - 1], s.pts[i]);
    if (s.closed) n += dist(s.pts[s.pts.length - 1], s.pts[0]);
    return n;
  }

  function timing(sch) {
    const lens = sch.strokes.map(strokeLength), n = lens.length;
    const total = lens.reduce((a, b) => a + b, 0);
    const perUnit = (DRAW_MS - LIFT_MS * (n - 1) - MIN_MS * n) / total;   // ms per unit of length
    let at = 0;
    const exact = lens.map(len => {
      const t = { d: at, t: MIN_MS + len * perUnit };
      at += t.t + LIFT_MS;
      return t;
    });
    const strokes = exact.map(e => ({ d: Math.round(e.d), t: Math.round(e.t) }));
    // A dot shows when the pen first reaches its point.
    const dots = sch.dots.map(p => {
      for (let i = 0; i < n; i++) {
        const pts = sch.strokes[i].pts;
        let run = 0;
        for (let k = 0; k < pts.length; k++) {
          if (k) run += dist(pts[k - 1], pts[k]);
          if (pts[k][0] === p[0] && pts[k][1] === p[1]) return Math.round(exact[i].d + exact[i].t * run / lens[i]);
        }
      }
      return DRAW_MS;
    });
    const labels = sch.labels.map((_, i) => DRAW_MS + i * LABEL_STEP_MS);
    return { strokes, dots, labels };
  }

  // ── The markup ──────────────────────────────────────────────

  const num = n => String(Math.round(n * 100) / 100);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function pathData(s) {
    return 'M' + s.pts.map(p => num(p[0]) + ' ' + num(p[1])).join('L') + (s.closed ? 'Z' : '');
  }

  const TYPE = {
    value: 'font-size="24" font-weight="500" fill="currentColor"',
    note:  'font-size="16" font-weight="400" fill="#8A8A8A"',
  };

  function schematicSvg(sch) {
    sch = sch || SCHEMATIC;
    const time = timing(sch);
    const out = [];
    out.push('<svg class="ed-schematic" xmlns="http://www.w3.org/2000/svg" viewBox="' + sch.viewBox.join(' ') + '"'
      + ' role="img" aria-label="Schematic: a 9 V battery, a 470 Ω resistor R1 and a red LED, LED1, in series"'
      + ' color="#F4F4F4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">');
    sch.strokes.forEach((s, i) => {
      out.push('<path pathLength="1" data-part="' + s.part + '"'
        + (s.fill ? ' fill="currentColor"' : '')
        + ' d="' + pathData(s) + '" style="--d:' + time.strokes[i].d + 'ms;--t:' + time.strokes[i].t + 'ms"/>');
    });
    sch.dots.forEach((p, i) => {
      out.push('<circle cx="' + num(p[0]) + '" cy="' + num(p[1]) + '" r="4.5" fill="currentColor" stroke="none" style="--d:' + time.dots[i] + 'ms"/>');
    });
    out.push('<g stroke="none" font-family="\'DM Mono\', ui-monospace, \'SF Mono\', Menlo, monospace">');
    sch.labels.forEach((l, i) => {
      out.push('<text x="' + num(l.at[0]) + '" y="' + num(l.at[1]) + '" text-anchor="' + l.anchor + '" ' + TYPE[l.kind]
        + ' style="--d:' + time.labels[i] + 'ms">' + esc(l.text) + '</text>');
    });
    out.push('</g></svg>');
    return out.join('');
  }

  return { SCHEMATIC, DRAW_MS, schematicSvg };
});
