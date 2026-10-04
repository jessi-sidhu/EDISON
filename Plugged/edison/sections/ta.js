// ─────────────────────────────────────────────────────────────
//  edison/sections/ta.js — the course hub's TA view (spec §4a):
//  Quindar's isometric line-art breadboard with dashed callouts, and
//  Godela's heat-map scale and legend, over CourseData.heatmap, plus the
//  live feed from GET /api/course/ta-feed (CourseData.feed when it 404s).
//
//  EXPORTS
//  ───────
//  Browser: window.TA, and the #ta section through Course.section
//  Node:    module.exports, with no DOM: { isoPoint, colourFor, summary }
//
//  TA.isoPoint(hole)        'a1' … 'j63' (and rail holes) → { x, y } in the drawing
//  TA.colourFor(count, max) the heat scale: --pad at 0, --bus-red at max
//  TA.summary(heatmap)      the summary block, as a list of sentences
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const inNode = typeof module === 'object' && module.exports;
  const TA = factory(root, inNode ? require('../../circuit3d/js/board-geometry.js') : null);
  if (inNode) module.exports = { isoPoint: TA.isoPoint, colourFor: TA.colourFor, summary: TA.summary };
  if (root) {
    root.TA = TA;
    if (root.Course) root.Course.section('ta', { title: 'TA view', render: TA.render });
  }
})(typeof window !== 'undefined' ? window : null, function (root, nodeGeometry) {

  // ── The projection: true isometric, both board axes at 30° ──
  // World x runs along the columns from the board's left edge, world z
  // toward the viewer from its far edge (board-geometry.js's ROW_Z, shifted).
  // Drawing units are px at 1:1; the far-left corner of the board is 0,0.
  const S = 22, COS = Math.cos(Math.PI / 6), SIN = 0.5, TAN = SIN / COS;
  const project = (x, z) => ({ x: (x + z) * COS * S, y: (z - x) * SIN * S });

  let G = nodeGeometry || (root && root.App && root.App.BOARD_GEOMETRY) || null;

  // A hole name as world x, z on the board's top face, or null.
  function holeAt(hole) {
    if (!G) return null;
    const m = /^(tp|tn|bn|bp|[a-j])(\d{1,2})$/.exec(String(hole).trim().toLowerCase());
    if (!m || !(m[1] in G.ROW_Z)) return null;
    const col = Number(m[2]);
    if (col < 1 || col > G.COLS) return null;
    return { x: G.MARGIN_X + (col - 1) * G.HS, z: G.ROW_Z[m[1]] + G.BOARD_D / 2, col };
  }

  function isoPoint(hole) {
    const w = holeAt(hole);
    return w ? project(w.x, w.z) : null;
  }

  // ── The heat scale: a straight line in RGB from --pad to --bus-red ──
  // (the tokens' values; RGB keeps every step between green-grey and red, never purple)
  const PAD = [0xE9, 0xEF, 0xE2], RED = [0xC4, 0x33, 0x3B];
  function colourFor(count, max) {
    const n = Number(count) || 0, m = Number(max) || 0;
    const t = m > 0 ? Math.min(1, Math.max(0, n / m)) : (n > 0 ? 1 : 0);
    const c = PAD.map((p, i) => Math.round(p + (RED[i] - p) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  // ── The summary: numbers inside sentences (spec §3) ──
  const colOf = hole => Number(/\d+$/.exec(hole)[0]);
  function summary(heat) {
    const total = heat.total;
    const cells = (heat.cells || []).filter(c => c && c.count > 0 && /\d+$/.test(c.hole))
      .sort((a, b) => b.count - a.count);
    if (!cells.length) return [`None of the ${total} students has a mistake marked on the board yet.`];
    const lab = /(\d+)$/.exec(heat.lab || '');
    const [top, next] = cells;
    const who = n => (n === 1 ? 'student has' : 'students have');
    const out = [`${lab ? `In Lab ${lab[1]}, ` : ''}${top.count} of ${total} ${who(top.count)} ${top.note} at hole ${top.hole}.`];
    if (next) out.push(`Next is ${next.hole}, where ${next.count} ${who(next.count)} ${next.note}.`);
    const sum = cells.reduce((s, c) => s + c.count, 0);
    const cols = cells.map(c => colOf(c.hole)), lo = Math.min(...cols), hi = Math.max(...cols);
    if (cells.length === 1) out.push(`It is the only hole flagged, in column ${lo}.`);
    else out.push(`Edison flagged ${sum} mistakes at ${cells.length} holes, all ${lo === hi ? `in column ${lo}` : `between columns ${lo} and ${hi}`}.`);
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  //  The page: everything below runs only in the browser
  // ─────────────────────────────────────────────────────────────
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = v => Math.round(v * 100) / 100;
  const pts = list => list.map(p => `${f(p.x)},${f(p.y)}`).join(' ');

  const STEPS  = 5;     // heat bands: the scale at 0, 1/5 … 5/5 of the busiest hole
  const DOT_R  = 0.19;  // world units: a heat dot just covers its hole
  const FIELD  = 2.0;   // world units of spread at full heat
  const RUN    = 24;    // a callout's level run, px
  const GAP    = 8;     // from a run's end to its text, px
  const CLEAR  = 24;    // a callout's run stays this far off the board, px

  // The board's outline in the drawing at drawing x: above `up` and below `low`
  // (which adds the side faces' depth) is clear of it. Past either end of the
  // board nothing is in the way.
  function edges(W, D, T) {
    const xL = D * COS * S, xT = W * COS * S, maxX = (W + D) * COS * S;
    const off = x => x < 0 || x > maxX;
    return {
      up:  x => (off(x) ? Infinity : x <= xT ? -x * TAN : x * TAN - 2 * W * SIN * S),
      low: x => (off(x) ? -Infinity : (x <= xL ? x * TAN : 2 * D * SIN * S - x * TAN) + T),
      minX: 0, maxX,
    };
  }

  // One callout. Its leader leaves the dot along the board's row axis, the
  // way its column runs (so it passes no other hole in use beside it): the
  // busiest goes up and left, off the far edge; the next down and right, off
  // the near edge, where the drawing has room. Once its level run and note
  // clear the board by CLEAR px it turns level and runs on to the note.
  function callout(cell, total, up, E) {
    const p = isoPoint(cell.hole);
    const note = cell.note, val = `${cell.count} of ${total} students, hole ${cell.hole}`;
    const width = Math.max(note.length * 7.4, val.length * 6.4);   // generous: Barlow 500 16 px and 500 13 px
    const dir = up ? -1 : 1;
    const step = { x: dir * COS * S * 0.05, y: dir * SIN * S * 0.05 };   // 0.05 world units along the row axis
    const clear = q => {
      for (let i = 0, n = Math.ceil((RUN + GAP + width) / 4); i <= n; i++) {
        const x = q.x + dir * i * 4;
        if (up ? q.y > E.up(x) - CLEAR : q.y < E.low(x) + CLEAR) return false;
      }
      return true;
    };
    const elbow = { x: p.x, y: p.y };
    for (let i = 0; i < 4000 && !clear(elbow); i++) { elbow.x += step.x; elbow.y += step.y; }
    const end = { x: elbow.x + dir * RUN, y: elbow.y };
    return { cell, p, dir, elbow, end, note, val, width };
  }

  function drawing(heat) {
    const W = G.BOARD_W, D = G.BOARD_D, T = G.BOARD_THICK * S;
    const E = edges(W, D, T);
    const P = project;
    const down = q => ({ x: q.x, y: q.y + T });
    const cells = heat.cells.filter(c => isoPoint(c.hole)).sort((a, b) => b.count - a.count);
    const max = Math.max(0, ...cells.map(c => c.count));

    // The two visible side faces (left end and near side) and the top face.
    const face = [P(0, 0), P(W, 0), P(W, D), P(0, D)];
    const sides = [[P(0, 0), P(0, D)], [P(0, D), P(W, D)]]
      .map(([a, b]) => `<polygon class="ta-side" points="${pts([a, b, down(b), down(a)])}"/>`).join('');

    // Holes: every row's 63 holes, as small squares on the face (rhombi once projected).
    const h = 0.07;
    let holes = '';
    for (const row of G.ALL_ROWS) for (let c = 0; c < G.COLS; c++) {
      const x = G.MARGIN_X + c * G.HS, z = G.ROW_Z[row] + D / 2;
      holes += `M${f(x - h)} ${f(z - h)}h${2 * h}v${2 * h}h${-2 * h}z`;
    }

    // Bus stripes beside the rails: red by the + rail, blue by the −, as on the board.
    const stripes = G.RAIL_ROWS.map(r => {
      const z = G.ROW_Z[r] + D / 2, out = z < D / 2 ? -1 : 1;
      const zs = z + out * (G.RAIL_IS_POS[r] ? 0.3 : -0.27);
      return `<line class="${G.RAIL_IS_POS[r] ? 'ta-pos' : 'ta-neg'}" x1="0.6" y1="${f(zs)}" x2="${f(W - 0.6)}" y2="${f(zs)}"/>`;
    }).join('');

    // The heat field: contour bands, coolest first, so where two fields meet the hotter shows.
    const bands = [];
    for (const c of cells) {
      const heatOf = max > 0 ? c.count / max : 0;
      for (let k = 1; k < STEPS; k++) {
        const level = k / STEPS;
        if (level >= heatOf) break;
        const w = holeAt(c.hole);
        bands.push({ k, html: `<circle cx="${f(w.x)}" cy="${f(w.z)}" r="${f(DOT_R + FIELD * (heatOf - level))}" fill="${colourFor(level * max, max)}"/>` });
      }
    }
    bands.sort((a, b) => a.k - b.k);

    const dots = cells.map(c => {
      const w = holeAt(c.hole);
      return `<circle class="ta-dot" data-hole="${esc(c.hole)}" cx="${f(w.x)}" cy="${f(w.z)}" r="${DOT_R}" fill="${colourFor(c.count, max)}">` +
        `<title>${esc(c.hole)}: ${esc(c.note)}, ${c.count} of ${heat.total} students</title></circle>`;
    }).join('');

    // Column numbers along the near edge, every ten, as printed on the board.
    const nums = [1, 10, 20, 30, 40, 50, 60].filter(n => n <= G.COLS).map(n => {
      const q = P(G.MARGIN_X + (n - 1) * G.HS, D);
      return `<text class="ta-num" x="${f(q.x)}" y="${f(q.y + T + 14)}">${n}</text>`;
    }).join('');

    // Callouts to the two busiest holes. A pad-coloured halo under each leader
    // keeps its dashes clear of the holes it crosses; the dots sit above the
    // halo, and the leader and its pip above the dots.
    const calls = cells.slice(0, 2).map((c, i) => callout(c, heat.total, i === 0, E));
    const halos = calls.map(c => {
      const out = DOT_R * S + 2;   // from the dot's edge, along the row axis
      const from = { x: c.p.x + c.dir * COS * out, y: c.p.y + c.dir * SIN * out };
      return `<polyline class="ta-ko" points="${pts([from, c.elbow, c.end])}"/>`;
    }).join('');
    const leaders = calls.map(c => `<polyline class="ta-leader" points="${pts([c.p, c.elbow, c.end])}"/>`).join('');
    const pips = calls.map(c => `<circle class="ta-pip" cx="${f(c.p.x)}" cy="${f(c.p.y)}" r="1.8"/>`).join('');
    const notes = calls.map(c => {
      const x = f(c.end.x + c.dir * GAP), anchor = c.dir < 0 ? 'end' : 'start';
      return `<text class="ta-callout" text-anchor="${anchor}">` +
        `<tspan class="ta-note" x="${x}" y="${f(c.end.y - 4)}">${esc(c.note)}</tspan>` +
        `<tspan class="ta-val" x="${x}" y="${f(c.end.y + 14)}">${esc(c.val)}</tspan></text>`;
    }).join('');

    // The frame: the board plus its callouts, with a margin.
    const xs = [E.minX, E.maxX], ys = [P(W, 0).y, P(0, D).y + T + 20];
    for (const c of calls) {
      xs.push(c.end.x + c.dir * (GAP + c.width));
      ys.push(c.end.y - 20, c.end.y + 20);
    }
    const x0 = Math.min(...xs) - 8, y0 = Math.min(...ys) - 8;
    const vw = Math.max(...xs) + 8 - x0, vh = Math.max(...ys) + 8 - y0;
    const plane = `matrix(${f(COS * S)} ${f(-SIN * S)} ${f(COS * S)} ${f(SIN * S)} 0 0)`;
    const lab = /(\d+)$/.exec(heat.lab || '');

    return `<svg class="ta-art" viewBox="${f(x0)} ${f(y0)} ${f(vw)} ${f(vh)}" width="${Math.ceil(vw)}" height="${Math.ceil(vh)}" role="img"
        aria-label="${esc(`The ${lab ? `Lab ${lab[1]} ` : ''}breadboard, with where students go wrong marked on its holes`)}">
      <defs><clipPath id="ta-face-clip"><rect x="0" y="0" width="${f(W)}" height="${f(D)}"/></clipPath></defs>
      ${sides}
      <polygon class="ta-outline" points="${pts(face)}"/>
      <g class="ta-plane" transform="${plane}">
        <rect class="ta-channel" x="0.3" y="${f(D / 2 - 0.31)}" width="${f(W - 0.6)}" height="0.62"/>
        <g clip-path="url(#ta-face-clip)">${bands.map(b => b.html).join('')}</g>
        ${stripes}
        <path class="ta-holes" d="${holes}"/>
      </g>
      ${nums}
      ${halos}
      <g class="ta-plane" transform="${plane}">${dots}</g>
      ${leaders}${pips}${notes}
    </svg>`;
  }

  function legend(heat) {
    const max = Math.max(0, ...heat.cells.map(c => c.count));
    const swatches = Array.from({ length: STEPS + 1 }, (_, k) =>
      `<span class="ta-swatch" style="background-color: ${colourFor((k / STEPS) * max, max)}"></span>`).join('');
    return `<div class="ta-legend">
      <p class="ta-legend-title">Students with a mistake at that hole, out of ${esc(heat.total)}</p>
      <div class="ta-scale">${swatches}</div>
      <div class="ta-ticks"><span>0</span><span>${max}</span></div>
    </div>`;
  }

  // ── The live feed ──
  const FEED_URL = '/api/course/ta-feed';
  const POLL_MS  = 15000;

  function ago(at, now) {
    const mins = Math.max(0, Math.round((now - Date.parse(at)) / 60000));
    return mins < 1 ? 'Just now' : `${mins} min ago`;
  }

  function drawFeed(panel, events, live) {
    const now = Date.now();
    panel.querySelector('.ta-feed').innerHTML = events.map(e => `
      <li>
        <time datetime="${esc(e.at)}">${ago(e.at, now)}</time>
        <p class="ta-feed-text">${esc(e.text)}</p>
        <p class="ta-feed-where">${esc(e.lab)}, step ${esc(e.step)}, ${esc(e.label)}</p>
      </li>`).join('');
    panel.querySelector('.ta-feed-about').textContent = live
      ? 'Edison\'s lab checks as students work, newest first. It updates every 15 seconds.'
      : 'Saved sample events, newest first (demo).';
  }

  function startFeed(el, D) {
    const panel = el.querySelector('.ta-feed-panel');
    const fallback = () => {
      const now = Date.now();
      drawFeed(panel, D.feed.map(e => ({ ...e, at: new Date(now - e.minsAgo * 60000).toISOString() })), false);
    };
    let busy = false, timer = null;
    async function load() {
      if (busy || (timer && (el.hidden || document.hidden))) return;
      busy = true;
      try {
        const res = await fetch(FEED_URL, { cache: 'no-store' });
        if (res.status === 404) { clearInterval(timer); fallback(); return; }   // no server (deployed hosting)
        const body = res.ok ? await res.json() : null;
        if (body && Array.isArray(body.events) && body.events.length) drawFeed(panel, body.events, true);
        else fallback();
      } catch {
        fallback();
      } finally {
        busy = false;
      }
    }
    load();                                   // first load runs even in a background tab
    timer = setInterval(load, POLL_MS);
  }

  // The board geometry comes from the editor's own file, loaded on first draw.
  const GEOMETRY_SRC = root && root.document && root.document.currentScript
    ? new URL('../../circuit3d/js/board-geometry.js', root.document.currentScript.src).href : null;
  function withGeometry(done, failed) {
    if (G) return done();
    const s = document.createElement('script');
    s.src = GEOMETRY_SRC;
    s.onload = () => { G = root.App && root.App.BOARD_GEOMETRY; if (G) done(); else failed(); };
    s.onerror = failed;
    document.head.appendChild(s);
  }

  function render(el, D) {
    const heat = D.heatmap;
    el.innerHTML = `
      <div class="ta-head">
        <h2>TA view</h2>
        <p class="ta-sample">Sample data (demo)</p>
      </div>
      <p class="ta-summary">${summary(heat).map(esc).join(' ')}</p>
      <div class="ta-grid">
        <figure class="ta-figure">
          <div class="ta-art-wrap"></div>
          ${legend(heat)}
        </figure>
        <aside class="ta-feed-panel" aria-labelledby="ta-feed-title">
          <h3 id="ta-feed-title">Live feed</h3>
          <p class="ta-feed-about"></p>
          <ol class="ta-feed"></ol>
        </aside>
      </div>`;
    startFeed(el, D);
    const wrap = el.querySelector('.ta-art-wrap');
    withGeometry(() => { wrap.innerHTML = drawing(heat); },
      () => { wrap.innerHTML = '<p class="ta-art-error">The board drawing didn\'t load. Refresh the page to try again.</p>'; });
  }

  return { isoPoint, colourFor, summary, render };
});
