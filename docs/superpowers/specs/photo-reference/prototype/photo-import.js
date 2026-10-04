// ─────────────────────────────────────────────────────────────
//  photo-import.js — a confirmed photo reading → app actions (prototype).
//  Pure: no DOM, no THREE. UMD like board-model.js.
//
//  READING (after the student confirmed every dot)
//  ───────
//    { cols: 63 | 30 | …,                       the real board's columns
//      parts: [{ id, type, value?, leads: [{ pin, hole }] }],
//      wires: [{ id, color?, ends: [{ hole }, { hole }] }] }
//  hole: 'c12' | 'rail:a:+:12' (the rail beside row a / j, by PRINTED
//        sign) | 'off' (off the board) | null (not seen).
//  A battery / supply is a part: type 'battery', lead pins '+' and '-'.
//  LED pins: 'anode' / 'cathode' (or '+'/'-', 'long'/'short'); '?' unknown.
//
//  RULES
//  ─────
//  - A lead's node is its column + half (a–e / f–j) or a rail. Every lead
//    keeps its node; rows within a half are free; a rail's column is
//    cosmetic (nearest free).
//  - Rails map by printed sign: a-side + → tp, − → tn; j-side + → bp, − → bn.
//  - A part is placed legally (Parts.checkPlacement). When it can't sit on
//    its two nodes (span out of range, diagonal across the gap, both leads
//    in one strip, a lead in a rail, no shared free row), it is BRIDGED:
//    placed from one real node to a free helper strip H within span, plus
//    a wire H → the other real node. Electrically exact; flagged. With no
//    lead in the main holes (rail to rail) both leads go to helpers.
//  - Two leads in one hole: the second moves to a free hole in its strip.
//  - No source in the reading: a 9 V battery on the rails used, flagged.
//  - Unknown part types, unseen or off-board leads: skipped, flagged. Their
//    holes stay reserved, so the student can add them by hand where they are.
//  - An LED's anode and cathode are never swapped.
//
//  OUTPUT
//  ──────
//  build(reading) → { actions, labels, flags, skipped, bridges, moved }
//  actions: delete_all, place_battery, place_resistor / place_led
//  { holeA, holeB, ...value }, add_wire { from, to, color }, in that order,
//  for Chat.acceptBuild (one undo step). labels: reading id → app label.
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

  const inNode = typeof module === 'object' && module.exports;
  // Prototype only: the real file sits in circuit3d/js and requires './parts'.
  const APP      = inNode ? (process.env.PLUGGED_JS || require('node:path').join(__dirname, '../../../../../Plugged/circuit3d/js')) : null;
  const Parts    = inNode ? require(APP + '/parts') : window.Parts;
  const Ids      = inNode ? require(APP + '/ids.js') : window.App;
  const GEOMETRY = inNode ? require(APP + '/board-geometry.js') : window.App.BOARD_GEOMETRY;

  const COLS  = GEOMETRY.COLS;
  const TOP   = ['a', 'b', 'c', 'd', 'e'];
  const BOT   = ['f', 'g', 'h', 'i', 'j'];
  const RAIL  = { 'a:+': 'tp', 'a:-': 'tn', 'j:+': 'bp', 'j:-': 'bn' };
  const BOARD = { cols: COLS, bodyRows: GEOMETRY.BODY_ROWS };

  // Reading part types → the registry types the import places (Tier 1).
  const SPAN_TYPES   = { resistor: 'resistor', led: 'led' };
  const SOURCE_TYPES = ['battery', 'supply', 'power'];

  const WIRE_COLORS  = ['red', 'yellow', 'green', 'blue', 'black', 'white'];
  const WIRE_ALIAS   = { orange: 'yellow', gray: 'black', grey: 'black', brown: 'black', purple: 'blue', violet: 'blue' };
  const LED_ALIAS    = { orange: 'red', amber: 'yellow', pink: 'red', purple: 'blue' };
  const BRIDGE_COLOR = 'white';

  const clamp    = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const rowsOf   = half => (half === 'top' ? TOP : BOT);
  const bodyNode = (half, col) => `${half}:${col}`;
  const said     = node => node.replace(/^(top|bot):(\d+)$/, (_, h, c) => `column ${c} ${h === 'top' ? 'a–e' : 'f–j'}`).replace(/^rail:/, 'rail ');

  // A reading hole → { kind: 'body', col, row, half, node, hole } |
  // { kind: 'rail', rail, col, node, hole } | { kind: 'off' } | { kind: 'bad' } | null.
  function parse(h, cols) {
    if (h == null) return null;
    const s = String(h).trim().toLowerCase();
    if (s === 'off') return { kind: 'off' };
    let m = /^rail:([aj]):([+-]):(\d+)$/.exec(s);
    if (m) {
      const col = clamp(+m[3], 1, COLS), rail = RAIL[m[1] + ':' + m[2]];
      return { kind: 'rail', rail, col, node: 'rail:' + rail, hole: `${rail}_${col}` };
    }
    m = /^([a-j])(\d+)$/.exec(s);
    if (!m || +m[2] < 1 || +m[2] > Math.min(cols || COLS, COLS)) return { kind: 'bad', raw: s };
    const half = TOP.includes(m[1]) ? 'top' : 'bot';
    return { kind: 'body', col: +m[2], row: m[1], half, node: bodyNode(half, +m[2]), hole: m[1] + m[2] };
  }
  const onBoard = at => !!at && (at.kind === 'body' || at.kind === 'rail');

  function nodeHoles(node) {
    const [k, v] = node.split(':');
    if (k === 'rail') return Array.from({ length: COLS }, (_, i) => `${v}_${i + 1}`);
    return rowsOf(k).map(r => r + v);
  }

  function holeRef(h) {
    const m = /^(?:([a-j])(\d+)|(tp|tn|bp|bn)_(\d+))$/.exec(h);
    return m[1] ? { col: +m[2] - 1, row: m[1] } : { col: +m[4] - 1, row: m[3] };
  }

  // "4k7", "4.7k", "470", "1M", "100Ω", "4R7" → ohms, or null.
  function ohms(v) {
    if (typeof v === 'number') return v;
    if (v == null) return null;
    const s = String(v).toLowerCase().replace(/\s|ω|ohms?/g, '');
    const m = /^(\d+(?:\.\d+)?)([rkm]?)(\d*)$/.exec(s);
    if (!m) return null;
    return parseFloat(m[1] + (m[3] ? '.' + m[3] : '')) * { '': 1, r: 1, k: 1e3, m: 1e6 }[m[2]];
  }

  function volts(v) {
    if (typeof v === 'number') return v;
    const m = /^(\d+(?:\.\d+)?)\s*v?$/i.exec(String(v == null ? '' : v).trim());
    return m ? +m[1] : null;
  }

  // ── build ──────────────────────────────────────────────────

  function build(reading) {
    const cols = reading.cols || COLS;
    const flags = [], skipped = [], bridges = [], moved = [], labels = {};
    const pinMap = {};   // reading id → the app pin index each reading lead became
    const flag = (kind, id, why) => flags.push({ kind, id, why });
    const skip = (item, why, kind) => { skipped.push({ id: item.id, type: item.type || 'wire', why }); flag(kind || 'skipped', item.id, why); };

    // Occupancy: hole → { owner, state: 'reserved' | 'taken' }. An owner is
    // one lead or wire end. 'skip:' reservations (a skipped part's holes)
    // give way only when nothing else fits (soft).
    const occ = new Map();
    let soft = false;
    const free = (h, owner) => {
      const o = occ.get(h);
      if (!o) return true;
      if (o.state === 'taken') return false;
      return o.owner === owner || (soft && o.owner.startsWith('skip:'));
    };
    const take    = (h, owner) => occ.set(h, { owner, state: 'taken' });
    const reserve = (h, owner) => { if (!occ.has(h)) occ.set(h, { owner, state: 'reserved' }); };
    const release = owner => { for (const [h, o] of [...occ]) if (o.owner === owner && o.state === 'reserved') occ.delete(h); };

    // ── 1. Sort the reading: sources, span parts, wires, skips ──
    const used = new Set();   // every strip the photo touches; helpers avoid them
    const sources = [], spans = [], wires = [], skipHoles = [];
    (reading.parts || []).forEach((p, i) => {
      const leads = (p.leads || []).map((l, k) => ({ pin: l.pin, at: parse(l.hole, cols), raw: l.hole, owner: `P${i}:${k}` }));
      for (const l of leads) if (l.at && l.at.kind === 'body') used.add(l.at.node);
      const type = String(p.type || '').toLowerCase();
      const item = { id: p.id || `part${i + 1}`, type, value: p.value, leads };
      const skipThis = (why, kind) => { skip(item, why, kind); for (const l of leads) if (onBoard(l.at)) skipHoles.push([l.at.hole, 'skip:' + item.id]); };
      if (SOURCE_TYPES.includes(type)) return sources.push(item);
      if (!SPAN_TYPES[type]) return skipThis(`a ${p.type || 'part'} can't be imported yet`, 'unsupported');
      if (leads.length !== 2) return skipThis(`a ${type} needs 2 leads; the reading has ${leads.length}`);
      const bad = leads.find(l => !onBoard(l.at));
      if (bad) return skipThis(!bad.at ? 'a lead was not located' : bad.at.kind === 'off' ? 'a lead goes off the board' : `"${bad.raw}" is not a hole on a ${cols}-column board`, 'lead-missing');
      spans.push(item);
    });
    (reading.wires || []).forEach((w, i) => {
      const ends = (w.ends || []).map((e, k) => ({ at: parse(e && e.hole, cols), raw: e && e.hole, owner: `W${i}:${k}` }));
      for (const e of ends) if (e.at && e.at.kind === 'body') used.add(e.at.node);
      const item = { id: w.id || `wire${i + 1}`, color: w.color, ends };
      const bad = ends.length !== 2 ? { at: null } : ends.find(e => !onBoard(e.at));
      if (bad) {
        skip(item, !bad.at ? 'an end was not located' : bad.at.kind === 'off' ? 'it goes off the board' : `"${bad.raw}" is not a hole`, 'wire-skipped');
        for (const e of ends) if (onBoard(e.at)) skipHoles.push([e.at.hole, 'skip:' + item.id]);
        return;
      }
      wires.push(item);
    });

    // ── 2. Reserve each lead's own hole, first come first served ──
    const demand = new Map();
    const want = (at, who) => { if (at.kind !== 'body') return; if (!demand.has(at.node)) demand.set(at.node, []); demand.get(at.node).push(who); };
    for (const s of spans) for (const l of s.leads) { reserve(l.at.hole, l.owner); want(l.at, s.id); }
    for (const w of wires) for (const e of w.ends) { reserve(e.at.hole, e.owner); want(e.at, w.id); }
    for (const s of sources) for (const l of s.leads) if (onBoard(l.at)) { reserve(l.at.hole, l.owner); want(l.at, s.id); }
    for (const [h, owner] of skipHoles) reserve(h, owner);
    for (const [node, who] of demand) {
      if (who.length > 5) flag('strip-full', null, `${said(node)} has ${who.length} leads, but a strip holds 5 (${who.join(', ')}). Check the dots.`);
    }

    // A free hole in `node` for `owner`: its own hole, else the nearest row
    // (body) or column (rail). Skipped parts' holes only as a last resort.
    function pickHole(node, owner, prefer) {
      for (const s of [false, true]) {
        soft = s;
        if (prefer && prefer.hole && nodeHoles(node).includes(prefer.hole) && free(prefer.hole, owner)) { soft = false; return prefer.hole; }
        const rail = node.startsWith('rail:');
        const rowIx = r => GEOMETRY.BODY_ROWS.indexOf(r);
        const score = h => {
          const r = holeRef(h);
          return rail ? Math.abs(r.col + 1 - (prefer && prefer.col || 1)) : Math.abs(rowIx(r.row) - rowIx(prefer && prefer.row || r.row));
        };
        const best = nodeHoles(node).filter(h => free(h, owner)).sort((a, b) => score(a) - score(b))[0];
        soft = false;
        if (best) return best;
      }
      return null;
    }

    // ── 3. Actions ──
    const actions = [{ tool: 'delete_all' }];
    const placed  = [];   // { type, label }, for Ids.nextLabel
    const label   = type => { const l = Ids.nextLabel(placed, type); placed.push({ type, label: l }); return l; };
    const pending = [];   // wires, allocated after every part: { id, color, a: end, b: end }, end = { pin } | { node, prefer, owner }

    // Sources first, so BAT1 exists when its wires are added.
    const railsUsed = new Set();
    for (const s of spans) for (const l of s.leads) if (l.at.kind === 'rail') railsUsed.add(l.at.rail);
    for (const w of wires) for (const e of w.ends) if (e.at.kind === 'rail') railsUsed.add(e.at.rail);
    for (const s of sources) {
      const a = { tool: 'place_battery' };
      const v = volts(s.value);
      if (s.value != null && v == null) flag('value', s.id, `"${s.value}" is not a voltage; 9 V used`);
      else if (v != null) {
        const check = Parts.checkValue('battery', 'voltage', v);
        if (check.ok) a.voltage = v; else flag('value', s.id, `${check.reason}; 9 V used`);
      }
      actions.push(a);
      const lab = labels[s.id] = label('battery');
      pinMap[s.id] = s.leads.map(() => null);
      const plus  = s.leads.find(l => /^(\+|pos|plus|red)/i.test(String(l.pin))) || s.leads[0];
      const minus = s.leads.find(l => /^(-|−|neg|minus|black)/i.test(String(l.pin))) || s.leads[1];
      [[plus, 0, 'red'], [minus, 1, 'black']].forEach(([l, k, color]) => {
        if (l) pinMap[s.id][s.leads.indexOf(l)] = k;
        if (!l || !onBoard(l.at)) return flag('source-lead', s.id, `the ${k ? '−' : '+'} lead of ${s.id} was not located; it is left unwired`);
        pending.push({ id: s.id, color, a: { pin: `${lab}.${k}` }, b: { node: l.at.node, prefer: l.at, owner: l.owner } });
      });
    }
    if (!sources.length) {
      const plus = ['tp', 'bp'].filter(r => railsUsed.has(r)), minus = ['tn', 'bn'].filter(r => railsUsed.has(r));
      if (!plus.length && !minus.length) {
        flag('no-source', null, 'No battery or supply in the photo and no rail in use, so nothing is powered.');
      } else {
        actions.push({ tool: 'place_battery' });
        const id = '(assumed battery)', lab = labels[id] = label('battery');
        for (const r of plus)  pending.push({ id, color: 'red',   a: { pin: `${lab}.0` }, b: { node: 'rail:' + r, prefer: { col: 1 }, owner: 'assumed:' + r } });
        for (const r of minus) pending.push({ id, color: 'black', a: { pin: `${lab}.1` }, b: { node: 'rail:' + r, prefer: { col: 1 }, owner: 'assumed:' + r } });
        flag('assumed-source', null, `No battery or supply in the photo: a 9 V battery is assumed on ${[...plus, ...minus].join(' and ')}` +
          (!plus.length ? '; no + rail is used, so its + is left unwired' : !minus.length ? '; no − rail is used, so its − is left unwired' : '') + '.');
      }
    }

    // Span parts.
    const helpers = new Set();
    for (const s of spans) {
      const type = SPAN_TYPES[s.type], def = Parts.get(type);
      const [lA, lB] = pinOrder(s, def, flag);     // lA → holeA (def.pins[0]), lB → holeB
      let choice = placeSpan(def, lA, lB, false);
      if (!choice) choice = placeSpan(def, lA, lB, true);
      if (!choice) { skip(s, 'no legal place for it on the board'); release(lA.owner); release(lB.owner); continue; }
      actions.push(Object.assign({ tool: (def.ai && def.ai.tool) || 'place_' + type, holeA: choice.holeA, holeB: choice.holeB }, valuesFor(s, type, flag)));
      const lab = labels[s.id] = label(type);
      pinMap[s.id] = s.leads.map(l => (l === lA ? 0 : 1));
      take(choice.holeA, lA.owner); take(choice.holeB, lB.owner);
      const bridged = choice.bridges.map(b => b.lead);
      for (const [l, h] of [[lA, choice.holeA], [lB, choice.holeB]]) {
        if (bridged.includes(l)) continue;           // keeps its hole for the bridge wire
        release(l.owner);
        if (h !== l.at.hole) moved.push({ id: s.id, label: lab, from: l.at.hole, to: h, same: 'strip' });
      }
      if (choice.bridges.length) {
        bridges.push({ id: s.id, label: lab, why: choice.why, helpers: choice.bridges.map(b => b.helper), to: bridged.map(l => l.at.node) });
        flag('bridge', s.id, `${lab} (${s.id}): ${choice.why}, so it sits in ${choice.bridges.map(b => said(b.helper)).join(' and ')} ` +
             `with a wire to ${bridged.map(l => said(l.at.node)).join(' and ')}. Same circuit.`);
        for (const b of choice.bridges) {
          helpers.add(b.helper);
          pending.push({ id: s.id, color: BRIDGE_COLOR, bridge: true,
                         a: { node: b.helper, prefer: { row: holeRef(b.hole).row }, owner: `${b.lead.owner}:h` },
                         b: { node: b.lead.at.node, prefer: b.lead.at, owner: b.lead.owner } });
        }
      }
    }

    // The photo's wires.
    for (const w of wires) {
      pending.push({ id: w.id, color: wireColor(w.color),
                     a: { node: w.ends[0].at.node, prefer: w.ends[0].at, owner: w.ends[0].owner },
                     b: { node: w.ends[1].at.node, prefer: w.ends[1].at, owner: w.ends[1].owner } });
    }

    // Every wire's holes, then its action.
    const endOf = (p, e) => {
      if (e.pin) return e.pin;
      let h = pickHole(e.node, e.owner, e.prefer);
      if (!h) {
        h = (e.prefer && e.prefer.hole) || nodeHoles(e.node)[0];
        flag('stacked', p.id, `${said(e.node)} is full, so a wire end shares ${h} with another lead.`);
      }
      take(h, e.owner);
      release(e.owner);
      if (!p.bridge && e.prefer && e.prefer.hole && h !== e.prefer.hole && e.node.indexOf('rail') !== 0) moved.push({ id: p.id, from: e.prefer.hole, to: h, same: 'strip' });
      return h;
    };
    for (const p of pending) actions.push({ tool: 'add_wire', from: endOf(p, p.a), to: endOf(p, p.b), color: p.color });

    // ── Span placement ──
    // The lowest-cost legal { holeA, holeB, bridges: [{ lead, helper, hole }], why }.
    function placeSpan(def, lA, lB, softly) {
      soft = softly;
      try {
        const { min, max, default: dflt } = def.place.span;
        const vert = def.place.rotations.includes('v');
        const A = lA.at, B = lB.at;
        const why = whyBridge(A, B, min, max, vert);
        const cands = [];

        // Direct: both leads on their own nodes.
        if (A.kind === 'body' && B.kind === 'body') {
          const d = Math.abs(A.col - B.col);
          if (A.half === B.half && d >= min && d <= max) {
            for (const r of rowsOf(A.half)) {
              const ha = r + A.col, hb = r + B.col;
              if (free(ha, lA.owner) && free(hb, lB.owner)) cands.push({ cost: (r !== A.row) + (r !== B.row) + (r === A.row ? 0 : 0.01), holeA: ha, holeB: hb, bridges: [] });
            }
          }
          if (A.half !== B.half && A.col === B.col && vert) {
            for (const ra of rowsOf(A.half)) for (const rb of rowsOf(B.half)) {
              const ha = ra + A.col, hb = rb + B.col;
              if (free(ha, lA.owner) && free(hb, lB.owner)) cands.push({ cost: (ra !== A.row) + (rb !== B.row), holeA: ha, holeB: hb, bridges: [] });
            }
          }
        }
        if (A.kind === 'rail' && B.kind === 'rail' && A.rail === B.rail) {
          // Both legs in one rail: shorted, but that is what is on the board.
          for (let c = 1; c <= COLS; c++) for (const d of [dflt, min, max]) {
            const ha = `${A.rail}_${c}`, hb = `${A.rail}_${c + d}`;
            if (c + d <= COLS && free(ha, lA.owner) && free(hb, lB.owner)) cands.push({ cost: 0.5 + Math.abs(c - A.col) * 0.01, holeA: ha, holeB: hb, bridges: [] });
          }
        }

        // Single bridge: keep one lead on its node, the other in a helper strip.
        for (const [keep, other, keepIsA] of [[lA, lB, true], [lB, lA, false]]) {
          const K = keep.at;
          if (K.kind !== 'body') continue;
          const toward = other.at.col > K.col ? 1 : -1;
          const opts = [];
          for (let d = min; d <= max; d++) for (const sg of [1, -1]) opts.push({ half: K.half, col: K.col + sg * d, d, sg });
          if (vert) opts.push({ half: K.half === 'top' ? 'bot' : 'top', col: K.col, d: dflt, sg: toward, vertical: true });
          for (const o of opts) {
            if (o.col < 1 || o.col > COLS) continue;
            const H = bodyNode(o.half, o.col);
            if (used.has(H) || helpers.has(H)) continue;
            const pairs = o.vertical ? rowsOf(K.half).flatMap(rk => [[rk, K.half === 'top' ? 'f' : 'e']]) : rowsOf(K.half).map(r => [r, r]);
            for (const [rk, rh] of pairs) {
              const hk = rk + K.col, hh = rh + o.col;
              if (!free(hk, keep.owner) || !free(hh, null)) continue;
              const cost = 10 + Math.abs(o.d - dflt) * 0.2 + (rk !== K.row ? 1 : 0) + (o.col > cols ? 3 : 0) +
                           (o.vertical ? 0.5 : 0) + (o.sg === toward ? 0 : 0.3) + (keepIsA ? 0 : 0.05);
              cands.push({ cost, holeA: keepIsA ? hk : hh, holeB: keepIsA ? hh : hk, why, bridges: [{ lead: other, helper: H, hole: hh }] });
            }
          }
        }

        // Double bridge: both leads in helper strips (rail to rail, or nothing nearer).
        const anchor = A.kind === 'body' ? A.col : B.kind === 'body' ? B.col : A.col;
        const nearHalf = A.kind === 'rail' && A.rail[0] === 'b' ? 'bot' : 'top';
        for (const half of ['top', 'bot']) {
          const r = half === 'top' ? 'c' : 'h';
          for (let c = 1; c <= COLS; c++) for (const d of [dflt, min, max]) {
            const c2 = c + d;
            if (c2 > COLS) continue;
            const H0 = bodyNode(half, c), H1 = bodyNode(half, c2);
            if ([H0, H1].some(H => used.has(H) || helpers.has(H))) continue;
            const h0 = r + c, h1 = r + c2;
            if (!free(h0, null) || !free(h1, null)) continue;
            const cost = 30 + Math.abs(c - anchor) * 0.05 + (c2 > cols ? 3 : 0) + (half === nearHalf ? 0 : 0.2);
            cands.push({ cost, holeA: h0, holeB: h1, why, bridges: [{ lead: lA, helper: H0, hole: h0 }, { lead: lB, helper: H1, hole: h1 }] });
          }
        }

        if (vert) {   // or one column, straight across the gap
          for (let c = 1; c <= COLS; c++) {
            const H0 = bodyNode('top', c), H1 = bodyNode('bot', c);
            if ([H0, H1].some(H => used.has(H) || helpers.has(H)) || !free('e' + c, null) || !free('f' + c, null)) continue;
            cands.push({ cost: 30.5 + Math.abs(c - anchor) * 0.05 + (c > cols ? 3 : 0), holeA: 'e' + c, holeB: 'f' + c, why,
                         bridges: [{ lead: lA, helper: H0, hole: 'e' + c }, { lead: lB, helper: H1, hole: 'f' + c }] });
          }
        }

        cands.sort((p, q) => p.cost - q.cost);
        const map = new Map();
        for (const [h, o] of occ) if (o.state === 'taken') map.set(h, { label: o.owner, pin: '?' });
        for (const c of cands) {
          const legs = Parts.legsOf({ type: def.type, holeRefs: [holeRef(c.holeA), holeRef(c.holeB)] });
          if (Parts.checkPlacement(def.type, legs, map, BOARD).ok) return c;
        }
        return null;
      } finally {
        soft = false;
      }
    }

    return { actions, labels, pinMap, flags, skipped, bridges, moved };
  }

  function whyBridge(A, B, min, max, vert) {
    if (A.kind === 'rail' && B.kind === 'rail') return 'it runs from rail to rail, and a part needs its leads in the main holes';
    if (A.kind === 'rail' || B.kind === 'rail') return 'a lead is in a rail, and a part needs both leads in the main holes';
    if (A.node === B.node) return 'both leads are in one strip (the part is shorted)';
    if (A.half !== B.half) return A.col === B.col && !vert ? "it can't stand across the gap" : 'it runs diagonally across the centre gap';
    const d = Math.abs(A.col - B.col);
    if (d < min || d > max) return `its leads are ${d} columns apart; it fits ${min}–${max}`;
    return 'its strips have no free holes on a shared row';
  }

  // The two leads in the registry's pin order: [lead for pins[0] (holeA), lead for pins[1] (holeB)].
  // An LED's anode and cathode come from the reading, never from the circuit.
  function pinOrder(s, def, flag) {
    const leads = s.leads;
    if (s.type === 'led') {
      const is = (l, re) => re.test(String(l.pin == null ? '' : l.pin).trim());
      const an = leads.filter(l => is(l, /^(anode|\+|a|long|pos)$/i)), ca = leads.filter(l => is(l, /^(cathode|-|−|k|c|short|neg)$/i));
      if (an.length === 1 && ca.length === 1) return [ca[0], an[0]];
      if (an.length === 1) return [leads.find(l => l !== an[0]), an[0]];
      if (ca.length === 1) return [ca[0], leads.find(l => l !== ca[0])];
      flag('polarity', s.id, `${s.id}: the anode wasn't marked, so the first dot (${leads[0].raw}) is taken as the anode. Check it.`);
      return [leads[1], leads[0]];
    }
    const named = def.pins.map(p => leads.find(l => String(l.pin).toLowerCase() === p.toLowerCase()));
    return named.every(Boolean) ? named : [leads[0], leads[1]];
  }

  function valuesFor(s, type, flag) {
    if (type === 'resistor') {
      if (s.value == null) { flag('value', s.id, `${s.id}: resistance not read; 470 Ω used. Check the bands.`); return {}; }
      const r = ohms(s.value);
      const check = r == null ? { ok: false, reason: `"${s.value}" is not a resistance` } : Parts.checkValue('resistor', 'resistance', r);
      if (!check.ok) { flag('value', s.id, `${s.id}: ${check.reason}; 470 Ω used`); return {}; }
      return { resistance: r };
    }
    if (type === 'led') {
      if (s.value == null) { flag('value', s.id, `${s.id}: colour not read; red used`); return {}; }
      const c = String(s.value).toLowerCase().trim();
      if (Object.keys(Parts.get('led').values.color.choices).includes(c)) return { color: c };
      const alias = LED_ALIAS[c];
      flag('value', s.id, alias ? `${s.id}: no ${c} LED in the app; ${alias} used (close forward voltage)` : `${s.id}: "${s.value}" is not an LED colour; red used`);
      return alias ? { color: alias } : {};
    }
    return {};
  }

  function wireColor(c) {
    const s = String(c || '').toLowerCase();
    return WIRE_COLORS.includes(s) ? s : WIRE_ALIAS[s] || 'yellow';
  }

  return { build, parse, ohms, volts, RAIL, SPAN_TYPES };
});
