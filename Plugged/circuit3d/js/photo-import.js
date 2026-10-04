// ─────────────────────────────────────────────────────────────
//  photo-import.js — a confirmed photo Reading → the app's actions
//  (issues #136, #137). Pure: no DOM, no THREE.
//
//  CONTRACT (docs/API-CONTRACT.md → "Reading v1", "PhotoImport")
//  ────────
//    build(reading, { components }) → { actions, labels, flags, skipped }
//  Never throws: what it can't build lands in flags and skipped.
//
//  RULES
//  ─────
//  - A lead's node is its column + half (a–e / f–j) or a rail. Every lead
//    keeps its node; rows inside a half and a rail's column are free.
//  - Rails by side and printed sign: a-side + → tp, − → tn; j-side + → bp,
//    − → bn. A side whose signs are `?` or equal: outer +, inner −, flagged.
//  - Actions: every battery, then every part, then every wire (battery
//    leads, bridge jumpers, the Reading's), because wire ends take holes.
//    No delete_all.
//  - A part sits on its own two nodes when both leads are body holes in one
//    half with the span in range (on one row, the photo's if free), or
//    straight across the gap in one column (vertical). Both leads in one
//    rail: two holes of that rail, flagged shorted.
//  - Anything else takes the bridge (#137): the part from one real node to
//    a free helper column-half H (one the Reading doesn't use) within span,
//    plus a white jumper H → the other real node. Search: the same half on
//    both sides, then the same column across the gap; two helpers when no
//    lead is in the main holes (or no single helper fits). Flagged moved,
//    or shorted when both leads share a node; no helper → mismatch.
//  - A lead into a full column-half: not built, flagged position.
//  - Every place_* passes Parts.checkPlacement against a running hole map
//    that includes wire ends. An LED's polarity is never changed.
//  - Holes stay within the Reading's board.cols (a 30-column board).
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoImport
//  Node:    module.exports
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const PhotoImport = factory();
  if (typeof module === 'object' && module.exports) module.exports = PhotoImport;
  if (root) root.PhotoImport = PhotoImport;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode   = typeof module === 'object' && module.exports;
  const Parts    = inNode ? require('./parts') : window.Parts;
  const Ids      = inNode ? require('./ids.js') : window.App;
  const GEOMETRY = inNode ? require('./board-geometry.js') : window.App.BOARD_GEOMETRY;

  const COLS  = GEOMETRY.COLS;
  const TOP   = GEOMETRY.BODY_ROWS.slice(0, 5);
  const BOT   = GEOMETRY.BODY_ROWS.slice(5);
  const BOARD = { cols: COLS, bodyRows: GEOMETRY.BODY_ROWS };

  // Reading part types → the registry types built (Tier 1).
  const BUILT = { resistor: 'resistor', led: 'led' };

  const WIRE_COLORS = ['red', 'yellow', 'green', 'blue', 'black', 'white'];
  const WIRE_ALIAS  = { orange: 'yellow', gray: 'black', grey: 'black', brown: 'black', purple: 'blue', violet: 'blue' };

  const SIDES = [
    { name: 'a-side', outer: 'aOuter', inner: 'aInner', plus: 'tp', minus: 'tn' },
    { name: 'j-side', outer: 'jOuter', inner: 'jInner', plus: 'bp', minus: 'bn' },
  ];
  const STRIPS    = ['aOuter', 'aInner', 'jInner', 'jOuter'];
  const RAIL_SAID = { tp: 'a-side +', tn: 'a-side −', bp: 'j-side +', bn: 'j-side −' };

  const list   = v => (Array.isArray(v) ? v : []);
  const sign   = s => (s === '+' ? '+' : s === '-' || s === '−' ? '-' : '?');
  const toolOf = def => (def.ai && def.ai.tool) || 'place_' + def.type;

  // Each Reading strip → its app rail, and the sides whose signs were guessed.
  function railsBySign(signs) {
    const map = {}, guessed = {};
    for (const side of SIDES) {
      const o = sign(signs[side.outer]), i = sign(signs[side.inner]);
      const read      = o !== '?' && i !== '?' && o !== i;
      const outerPlus = read ? o === '+' : true;
      map[side.outer] = outerPlus ? side.plus : side.minus;
      map[side.inner] = outerPlus ? side.minus : side.plus;
      if (!read) guessed[side.name] = true;
    }
    return { map, guessed };
  }

  // A Reading endpoint → { kind: 'body', row, col, half, node, hole } |
  // { kind: 'rail', strip, rail, col, node, hole }, or null for `?`, `gap`,
  // `off` or anything that isn't a hole. Columns are 1-based.
  function endpoint(hole, railMap) {
    const s = String(hole == null ? '' : hole).trim();
    let m = /^([a-j])(\d+)$/i.exec(s);
    if (m) {
      const row = m[1].toLowerCase(), col = +m[2];
      if (col < 1 || col > COLS) return null;
      const half = TOP.includes(row) ? 'top' : 'bot';
      return { kind: 'body', row, col, half, node: half + ':' + col, hole: row + col };
    }
    m = /^rail:(\w+):(\d+)$/i.exec(s);
    const strip = m && STRIPS.find(n => n.toLowerCase() === m[1].toLowerCase());
    if (!strip) return null;
    const rail = railMap[strip], col = Math.min(Math.max(+m[2], 1), COLS);
    return { kind: 'rail', strip, rail, col, node: 'rail:' + rail, hole: rail + '_' + col };
  }

  // "a12" / "tp_12" → { col (0-based), row }.
  function holeRef(h) {
    const m = /^(?:([a-j])(\d+)|(tp|tn|bp|bn)_(\d+))$/.exec(h);
    return m[1] ? { col: +m[2] - 1, row: m[1] } : { col: +m[4] - 1, row: m[3] };
  }

  // The holes of an endpoint's node, its own first, then the nearest: a
  // half's rows by distance from its row, a rail's columns (1…cols) by
  // distance from its column (the sort is stable, so a tie takes the lower one).
  function nodeHoles(at, cols) {
    if (at.kind === 'rail') {
      const all = Array.from({ length: cols || COLS }, (_, i) => i + 1);
      return all.sort((p, q) => Math.abs(p - at.col) - Math.abs(q - at.col)).map(c => at.rail + '_' + c);
    }
    const rows = at.half === 'top' ? TOP : BOT, i = rows.indexOf(at.row);
    return rows.slice().sort((p, q) => Math.abs(rows.indexOf(p) - i) - Math.abs(rows.indexOf(q) - i)).map(r => r + at.col);
  }

  // "column 14 (a–e)", "the a-side + rail".
  const said = at => (at.kind === 'rail' ? `the ${RAIL_SAID[at.rail]} rail` : `column ${at.col} (${at.half === 'top' ? 'a–e' : 'f–j'})`);

  // Why a part can't sit on its own two nodes (it needs the bridge), or null.
  function bridgeWhy(A, B, def) {
    const { min, max } = def.place.span;
    if (A.node === B.node) return 'both leads are in one strip';
    if (A.kind === 'rail' || B.kind === 'rail') return 'a lead is in a rail, and a part needs both leads in the main holes';
    if (A.half !== B.half) return A.col === B.col && def.place.rotations.includes('v') ? null : 'it runs diagonally across the centre gap';
    const d = Math.abs(A.col - B.col);
    if (d < min || d > max) return `its leads are ${d} columns apart; it fits ${min}–${max}`;
    return null;
  }

  // An LED's leads as [cathode, anode], from the confirmed roles only.
  // Neither known: the first dot is the anode, flagged.
  function ledOrder(x, flag) {
    const [l0, l1] = x.leads;
    const role = l => (l.role === 'anode' || l.role === 'cathode' ? l.role : null);
    const r0 = role(l0), r1 = role(l1);
    if ((r0 === 'cathode' && r1 !== 'cathode') || (r1 === 'anode' && r0 !== 'anode')) return [l0, l1];
    if ((r1 === 'cathode' && r0 !== 'cathode') || (r0 === 'anode' && r1 !== 'anode')) return [l1, l0];
    flag('polarity', x.id, `${x.id}: which lead is the anode wasn't marked, so the first dot (${l0.at.hole}) is taken as the anode. Check it.`);
    return [l1, l0];
  }

  function valuesOf(x, flag) {
    if (x.type === 'resistor') {
      if (Parts.checkValue('resistor', 'resistance', x.p.value).ok) return { resistance: x.p.value };
      flag('value', x.id, `${x.id}: its resistance wasn't read, so 470 Ω is used. Check the bands.`);
      return { resistance: 470 };
    }
    const color = String(x.p.color || '').trim().toLowerCase();
    if (Parts.checkValue('led', 'color', color).ok) return { color };
    flag('value', x.id, `${x.id}: its colour wasn't read, so red is used.`);
    return { color: 'red' };
  }

  function wireColor(c) {
    const s = String(c || '').trim().toLowerCase();
    return WIRE_COLORS.includes(s) ? s : WIRE_ALIAS[s] || 'yellow';
  }

  // ── build ──────────────────────────────────────────────────

  function build(reading, options) {
    const rd      = reading && typeof reading === 'object' ? reading : {};
    const board   = rd.board && typeof rd.board === 'object' ? rd.board : {};
    const rails   = railsBySign(board.rails && typeof board.rails === 'object' ? board.rails : {});
    const cols    = Number.isInteger(board.cols) && board.cols >= 1 && board.cols <= COLS ? board.cols : COLS;
    const placed  = list(options && options.components).filter(c => c && typeof c === 'object');
    const actions = [], labels = {}, flags = [], skipped = [];

    const flag     = (kind, id, why) => flags.push({ kind, id, why });
    const notBuilt = (id, type, kind, why) => { skipped.push({ id, type, why }); if (kind) flag(kind, id, why); };
    const label    = type => { const l = Ids.nextLabel(placed, type); placed.push({ type, label: l }); return l; };
    const uses     = new Map();   // key → how many entries use it
    const copies   = new Set();   // what each part and wire is, to drop exact copies
    // An entry's key: its id; a blank or missing id → part<n> / wire<n>; an
    // id already used by a different entry → <id>#2, <id>#3…
    const keyOf    = (id, fallback) => {
      const base = id != null && String(id).trim() ? String(id).trim() : fallback;
      const n    = (uses.get(base) || 0) + 1;
      uses.set(base, n);
      return n > 1 ? `${base}#${n}` : base;
    };
    const isCopy   = what => { const k = JSON.stringify(what); if (copies.has(k)) return true; copies.add(k); return false; };
    const holesOf  = ends => list(ends).map(e => (e && e.hole != null ? String(e.hole) : ''));
    const used     = new Set();   // the Reading strips (aOuter…) in use
    const claims   = [];          // every photo hole, in Reading order: { at, owner }
    const at       = hole => { const e = endpoint(hole, rails.map); if (e && e.strip) used.add(e.strip); return e; };
    const claim    = ends => { for (const e of ends) if (e.at) claims.push(e); };

    // ── 1. Resolve every endpoint; drop what can't be built ──
    const parts = [];
    list(rd.parts).forEach((p, i) => {
      const id   = keyOf(p && p.id, `part${i + 1}`);
      const type = p && typeof p.type === 'string' ? p.type : 'other';
      if (p && isCopy(['part', type, p.value, holesOf(p.leads)])) return notBuilt(id, type, null, `${id} is a copy of an earlier part; it is built once.`);
      const def = BUILT[type] ? Parts.get(BUILT[type]) : null;
      if (!def) {
        claim(list(p && p.leads).map((l, k) => ({ at: endpoint(l && l.hole, rails.map), owner: `${id}.${k}` })));
        return notBuilt(id, type, 'type', `${id} (${(p && p.what) || type}) can't be built from a photo yet. Add it by hand.`);
      }
      const leads = list(p.leads).map((l, k) => ({ at: at(l && l.hole), role: l && l.role, owner: `${id}.${k}` }));
      claim(leads);
      if (leads.length !== 2 || leads.some(l => !l.at)) {
        return notBuilt(id, type, 'position', `${id}: a lead isn't on a hole yet (unseen, in the gap or off the board), so it isn't built.`);
      }
      parts.push({ p, id, type, def, leads });
    });

    const power = list(rd.power).map((s, i) => {
      const src = s && typeof s === 'object' ? s : {}, key = 'power:' + i;
      const ends = [src.plus, src.minus].map((e, k) => ({ at: at(e && e.hole), owner: `${key}.${k}` }));
      claim(ends);
      return { key, src, plus: ends[0], minus: ends[1] };
    });

    const wires = [];
    list(rd.wires).forEach((w, i) => {
      const id = keyOf(w && w.id, `wire${i + 1}`);
      if (w && isCopy(['wire', holesOf(w.ends).sort()])) return notBuilt(id, 'wire', null, `${id} is a copy of an earlier wire; it is built once.`);
      const ends = list(w && w.ends).map((e, k) => ({ at: at(e && e.hole), owner: `${id}.${k}` }));
      if (ends.length !== 2 || ends.some(e => !e.at)) {
        claim(ends);
        return notBuilt(id, 'wire', 'position', `${id}: an end isn't on a hole yet (unseen, in the gap or off the board), so it isn't built.`);
      }
      if (ends[0].at.node === ends[1].at.node) return notBuilt(id, 'wire', null, `${id} has both ends in one strip, so it joins nothing; left out.`);
      claim(ends);
      wires.push({ id, color: wireColor(w.color), ends });
    });

    for (const side of SIDES) {
      if (rails.guessed[side.name] && (used.has(side.outer) || used.has(side.inner))) {
        flag('rails', null, `The ${side.name} rails' + and − signs couldn't be read, so the outer strip is taken as + and the inner as −. Check them.`);
      }
    }

    // ── 2. The hole map: taken holes, and each photo hole held for its owner ──
    const taken    = new Map();   // hole → { label, pin } | { wire }, as Parts.checkPlacement reads it
    const reserved = new Map();   // hole → owner, first come first served
    for (const e of claims) if (!reserved.has(e.at.hole)) reserved.set(e.at.hole, e.owner);
    const freeFor = (h, owner, strict) => !taken.has(h) && (!strict || !reserved.has(h) || reserved.get(h) === owner);

    // A free hole in an endpoint's node: its own, else the nearest; a hole
    // another item's photo uses only when nothing else is free.
    function pick(e) {
      const holes = nodeHoles(e.at, cols);
      for (const strict of [true, false]) {
        const h = holes.find(x => freeFor(x, e.owner, strict));
        if (h) return h;
      }
      return null;
    }
    const room  = at => nodeHoles(at, cols).filter(h => !taken.has(h)).length;
    const fits  = (def, ha, hb) => Parts.checkPlacement(def.type, Parts.legsOf({ type: def.type, holeRefs: [holeRef(ha), holeRef(hb)] }), taken, BOARD).ok;

    // Both leads on one row of their half (the photo's rows first), or, for
    // two halves of one column, one row in each (vertical), checked against
    // the running map. → [holeA, holeB] or null.
    function placeSpan(def, lA, lB) {
      const A = lA.at, B = lB.at;
      const rowsA = A.half === 'top' ? TOP : BOT, rowsB = B.half === 'top' ? TOP : BOT;
      const from  = (rows, r, x) => Math.abs(rows.indexOf(x) - rows.indexOf(r));
      const pairs = A.half === B.half ? rowsA.map(r => [r, r]) : rowsA.flatMap(ra => rowsB.map(rb => [ra, rb]));
      const cost  = ([ra, rb]) => (ra !== A.row) + (rb !== B.row);
      pairs.sort((p, q) => cost(p) - cost(q) || from(rowsA, A.row, p[0]) - from(rowsA, A.row, q[0]) ||
                           (A.half !== B.half ? from(rowsB, B.row, p[1]) - from(rowsB, B.row, q[1]) : 0));
      for (const strict of [true, false]) {
        for (const [ra, rb] of pairs) {
          const ha = ra + A.col, hb = rb + B.col;
          if (freeFor(ha, lA.owner, strict) && freeFor(hb, lB.owner, strict) && fits(def, ha, hb)) return [ha, hb];
        }
      }
      return null;
    }

    // Both leads in one rail (shorted, as on the board): two of its holes a
    // span apart, nearest the photo's columns. → [holeA, holeB] or null.
    function placeRail(def, lA, lB) {
      const { min, max } = def.place.span, A = lA.at, B = lB.at, pairs = [];
      for (let c = 1; c <= cols; c++) {
        for (let d = min; d <= max; d++) for (const s of [1, -1]) if (c + s * d >= 1 && c + s * d <= cols) pairs.push([c, c + s * d]);
      }
      const cost = ([p, q]) => Math.abs(p - A.col) + Math.abs(q - B.col);
      pairs.sort((p, q) => cost(p) - cost(q));
      for (const strict of [true, false]) {
        for (const [p, q] of pairs) {
          const ha = A.rail + '_' + p, hb = A.rail + '_' + q;
          if (freeFor(ha, lA.owner, strict) && freeFor(hb, lB.owner, strict) && fits(def, ha, hb)) return [ha, hb];
        }
      }
      return null;
    }

    // ── The bridge: helper column-halves, ones the Reading doesn't use ──
    const nodes    = new Set(claims.filter(e => e.at.kind === 'body').map(e => e.at.node));
    const helpers  = new Set();
    const spare    = (half, col) => col >= 1 && col <= cols && !nodes.has(half + ':' + col) && !helpers.has(half + ':' + col);
    const helperAt = (half, col, row) => ({ kind: 'body', half, col, row, node: half + ':' + col, hole: row + col });
    const across   = half => (half === 'top' ? 'bot' : 'top');

    // The ways to bridge a part, in search order: [sideA, sideB], a side
    // being a real lead, or a helper standing in for one ({ at, owner, lead }).
    function bridgeTries(def, lA, lB) {
      const { min, max, default: dflt } = def.place.span;
      const vert  = def.place.rotations.includes('v');
      const leads = [lA, lB], A = lA.at, B = lB.at, same = [], gap = [], two = [];
      const stand = (lead, at) => ({ at, owner: null, lead });
      const pair  = (k, side) => (k === 0 ? [leads[0], side] : [side, leads[1]]);
      // One helper: keep a body lead on its node; the other lead's helper
      // within span in the same half (nearest the other node's column), then
      // the same column across the gap.
      for (const k of [0, 1]) {
        const K = leads[k].at, O = leads[1 - k].at, other = leads[1 - k];
        if (K.kind !== 'body') continue;
        const cs = [];
        for (let d = min; d <= max; d++) for (const s of [1, -1]) if (spare(K.half, K.col + s * d)) cs.push({ c: K.col + s * d, d });
        cs.sort((p, q) => Math.abs(p.c - O.col) - Math.abs(q.c - O.col) || Math.abs(p.d - dflt) - Math.abs(q.d - dflt) || p.c - q.c);
        for (const { c } of cs) same.push(pair(k, stand(other, helperAt(K.half, c, K.row))));
        const H = across(K.half);
        if (vert && spare(H, K.col)) gap.push(pair(k, stand(other, helperAt(H, K.col, H === 'top' ? 'e' : 'f'))));
      }
      // Two helpers: no lead in the main holes, or no single helper fits.
      const near = A.kind === 'rail' ? (A.rail[0] === 't' ? 'top' : 'bot') : A.half;
      for (const half of [near, across(near)]) {
        const row = half === 'top' ? 'a' : 'j', ps = [];
        for (let c = 1; c <= cols; c++) {
          for (let d = min; d <= max; d++) for (const s of [1, -1]) if (spare(half, c) && spare(half, c + s * d)) ps.push([c, c + s * d]);
        }
        ps.sort((p, q) => Math.abs(p[0] - A.col) + Math.abs(p[1] - B.col) - Math.abs(q[0] - A.col) - Math.abs(q[1] - B.col));
        for (const [p, q] of ps) two.push([stand(lA, helperAt(half, p, row)), stand(lB, helperAt(half, q, row))]);
      }
      if (vert) {
        const cs = [];
        for (let c = 1; c <= cols; c++) if (spare('top', c) && spare('bot', c)) cs.push(c);
        cs.sort((p, q) => Math.abs(p - A.col) + Math.abs(p - B.col) - Math.abs(q - A.col) - Math.abs(q - B.col));
        const [hA, hB] = near === 'top' ? ['top', 'bot'] : ['bot', 'top'];
        for (const c of cs) two.push([stand(lA, helperAt(hA, c, hA === 'top' ? 'e' : 'f')), stand(lB, helperAt(hB, c, hB === 'top' ? 'e' : 'f'))]);
      }
      return same.concat(gap, two);
    }

    // The first legal bridge: the part's holes, and each jumper's [helper
    // end, real end], all taken in the running map. → { holes, jumpers } or null.
    function bridge(def, lA, lB) {
      for (const sides of bridgeTries(def, lA, lB)) {
        const holes = placeSpan(def, sides[0], sides[1]);
        if (!holes) continue;
        holes.forEach(h => taken.set(h, { label: '?', pin: '?' }));
        const jumpers = [];
        for (const [k, s] of sides.entries()) {
          if (!s.lead) continue;
          const from = nodeHoles(Object.assign({}, s.at, { row: holeRef(holes[k]).row }), cols).find(h => !taken.has(h));
          const to   = pick(s.lead);
          if (!from || !to) break;
          taken.set(from, { wire: 'jumper' });
          taken.set(to, { wire: 'jumper' });
          jumpers.push([from, to]);
        }
        if (jumpers.length === sides.filter(s => s.lead).length) {
          for (const s of sides) if (s.lead) helpers.add(s.at.node);
          return { holes, jumpers };
        }
        for (const h of holes.concat(...jumpers)) taken.delete(h);
      }
      return null;
    }

    // ── 3. Batteries ──
    const pending = [];   // wires in output order: { id, color, reading, ends: [{ pin } | end] } | a jumper { id, color, holes }
    for (const s of power) {
      const kind = s.src.kind, volts = s.src.volts;
      const ok   = Parts.checkValue('battery', 'voltage', volts).ok;
      if (!ok) flag('value', s.key, `The battery's voltage wasn't read (or is outside 1–24 V), so 9 V is used.`);
      if (kind !== 'battery_9v') {
        flag('source', s.key, kind === 'bench_supply' ? 'The bench supply is built as a battery at the same voltage.'
                                                      : 'The power source wasn\'t recognised, so it is built as a battery.');
      }
      actions.push({ tool: 'place_battery', voltage: ok ? volts : 9 });
      const bat = labels[s.key] = label('battery');
      [[s.plus, 0, 'red', '+'], [s.minus, 1, 'black', '−']].forEach(([e, pin, color, name]) => {
        if (!e.at) return flag('position', s.key, `The battery's ${name} lead isn't on a hole yet, so it is left unwired.`);
        pending.push({ id: s.key, color, ends: [{ pin: bat + '.' + pin }, e] });
      });
    }
    if (!power.length) {
      const inUse = new Set([...used].map(strip => rails.map[strip]));
      const plus  = ['tp', 'bp'].filter(r => inUse.has(r)), minus = ['tn', 'bn'].filter(r => inUse.has(r));
      if (plus.length || minus.length) {
        actions.push({ tool: 'place_battery', voltage: 9 });
        const bat  = label('battery');
        const rail = r => ({ at: { kind: 'rail', rail: r, col: 1, node: 'rail:' + r, hole: r + '_1' }, owner: 'assumed', assumed: true });
        for (const r of plus)  pending.push({ id: null, color: 'red',   ends: [{ pin: bat + '.0' }, rail(r)] });
        for (const r of minus) pending.push({ id: null, color: 'black', ends: [{ pin: bat + '.1' }, rail(r)] });
        const on = plus.concat(minus).map(r => RAIL_SAID[r]);
        flag('source', null, `No battery in the photo, so a 9 V battery is assumed on the ${on.join(' and ')} rail${on.length > 1 ? 's' : ''}.`);
      }
    }

    // ── 4. Parts ──
    for (const x of parts) {
      const [lA, lB] = x.type === 'led' ? ledOrder(x, flag) : x.leads;   // → holeA, holeB
      const A = lA.at, B = lB.at, shorted = A.node === B.node;
      const full = [lA, lB].find(l => l.at.kind === 'body' && room(l.at) < (shorted ? 2 : 1));
      if (full) {
        notBuilt(x.id, x.type, 'position', `${x.id}: ${said(full.at)} already holds five leads, so its lead in ${full.at.hole} has no hole; it isn't built.`);
        continue;
      }
      const why = bridgeWhy(A, B, x.def);
      let holes = why ? (shorted && A.kind === 'rail' ? placeRail(x.def, lA, lB) : null) : placeSpan(x.def, lA, lB);
      let jumpers = [];
      if (!holes) ({ holes, jumpers } = bridge(x.def, lA, lB) || {});
      if (!holes) {
        notBuilt(x.id, x.type, 'mismatch', `${x.id}: ${why || 'no row has both its holes free'}, and no free column-half is near enough to draw it with a jumper, so it isn't built. Add it by hand.`);
        continue;
      }
      actions.push(Object.assign({ tool: toolOf(x.def), holeA: holes[0], holeB: holes[1] }, valuesOf(x, flag)));
      const lab = labels[x.id] = label(x.def.type);
      holes.forEach((h, k) => taken.set(h, { label: lab, pin: x.def.pins[k] }));
      for (const j of jumpers) pending.push({ id: x.id, color: 'white', holes: j });
      if (shorted) {
        flag('shorted', x.id, `${lab} (${x.id}) has both leads in ${said(A)}, so it is shorted and does nothing${jumpers.length ? '; it is drawn with a jumper to keep that' : ''}. Check it.`);
      } else if (jumpers.length) {
        flag('moved', x.id, `${lab} (${x.id}) is drawn with a jumper (${why || 'no row has both its holes free'}): on your board it runs from ${said(A)} to ${said(B)}. Same circuit.`);
      } else if (holes[0] !== A.hole || holes[1] !== B.hole) {
        flag('moved', x.id, `${lab} (${x.id}) sits in ${holes[0]} and ${holes[1]}: the same strips as ${lA.at.hole} and ${lB.at.hole} in the photo.`);
      }
    }

    // ── 5. Wires: the battery's leads, the bridge jumpers, then the Reading's ──
    for (const w of wires) pending.push({ id: w.id, color: w.color, reading: true, ends: w.ends });
    let wireN = 0;
    for (const w of pending) {
      const holes = w.holes || w.ends.map(e => e.pin || pick(e));   // a jumper's holes are taken already
      if (holes.some(h => !h)) {
        const why = `${w.id || 'The battery'}: a strip it goes to is full, so it isn't built.`;
        if (w.reading) notBuilt(w.id, 'wire', 'position', why); else flag('position', w.id, why);
        continue;
      }
      holes.forEach((h, k) => { if (w.holes || !w.ends[k].pin) taken.set(h, { wire: actions.length }); });
      if (!w.holes && w.ends.some((e, k) => !e.pin && !e.assumed && holes[k] !== e.at.hole)) {
        flag('moved', w.id, `${w.id}: an end moved to another hole of the same strip (${holes.filter(h => !/\./.test(h)).join(', ')}).`);
      }
      actions.push({ tool: 'add_wire', from: holes[0], to: holes[1], color: w.color });
      wireN++;
      if (w.reading) labels[w.id] = 'W' + wireN;
    }

    return { actions, labels, flags, skipped };
  }

  return { build };
});
