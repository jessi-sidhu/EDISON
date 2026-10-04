// The real-photo eval's offline parts (issue #175), in Node. No network, no
// browser, no server: requiring scripts/photo-eval.js starts nothing (only
// its CLI path does), and these tests only call its pure exports.
//
// Pinned here:
// - the eval set (test/fixtures/photo/eval/) is consistent: photos.json and
//   truth.json list the same photos; each image is a JPEG of the size
//   photos.json gives, upright, ≤ 2,048 px; cols 30 or 63; the taps are the
//   4 corners a1, aN, jN, j1, each on the image; every truth lead and wire
//   end is a Reading v1 hole on that board (docs/API-CONTRACT.md → "Reading
//   v1": c14, rail:aOuter:14, off) or null with a `why`.
// - score(truth, the truth read back) is full marks for every eval and web
//   photo, in any order; scoring is by node (a column + half, or a rail
//   strip), so a wrong half, column or strip is wrong, and a prediction
//   that matches nothing is invented (the empty boards are the controls).
// - loadSet('web') converts the spike's rail names the way
//   test/photo-import-truth.test.js does (test/fixtures/photo-web-rails.js);
//   a strip no listed sign landed on stays '?' (deliberate: no BB830 guess).
// - parseArgs refuses a bad --set or --runs.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const { nodeOf, score, webRails, loadSet, parseArgs } = require('../scripts/photo-eval.js');
const { railsOf, holeOf } = require('./fixtures/photo-web-rails.js');

const EVAL = path.join(__dirname, 'fixtures/photo/eval');
const WEB  = path.join(__dirname, 'fixtures/photo/web');
const json = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const EVAL_PHOTOS = json(EVAL, 'photos.json'), EVAL_TRUTH = json(EVAL, 'truth.json');
const WEB_PHOTOS  = json(WEB, 'photos.json'),  WEB_TRUTH  = json(WEB, 'truth.json');

const STRIPS = ['aOuter', 'aInner', 'jInner', 'jOuter'];
const SCORED = ['resistor', 'led'];

const EVAL_SET = loadSet('eval');
const WEB_SET  = loadSet('web');
const ALL      = [...EVAL_SET, ...WEB_SET];

// ── JPEG header ─────────────────────────────────────────────────────────

// A JPEG's pixel size (its SOF segment) and EXIF Orientation (1 when absent).
function jpegInfo(buf) {
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'not a JPEG (no SOI marker)');
  let orientation = 1;
  for (let i = 2; i + 9 <= buf.length;) {
    assert.strictEqual(buf[i], 0xff, `no JPEG marker at byte ${i}`);
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }   // fill byte
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.toString('latin1', i + 4, i + 10) === 'Exif\0\0') orientation = exifOrientation(buf.subarray(i + 10, i + 2 + len));
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC): precision, height, width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), orientation };
    }
    i += 2 + len;
  }
  throw new Error('no SOF segment');
}

// A TIFF block (EXIF APP1 after its 'Exif\0\0') → IFD0's Orientation tag, else 1.
function exifOrientation(tiff) {
  const le  = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = o => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = o => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  for (let k = 0, n = u16(ifd); k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 1;
}

// ── Truth holes ─────────────────────────────────────────────────────────

// A truth lead or end → why it isn't a Reading v1 hole on a `cols` board, or null.
function holeProblem(item, cols) {
  const h = item.hole;
  if (h == null) return item.why && String(item.why).trim() ? null : 'null with no why';
  if (h === 'off') return null;
  const m = /^(?:[a-j]|rail:(?:aOuter|aInner|jInner|jOuter):)(\d+)$/.exec(h);
  if (!m) return 'not a Reading v1 hole';
  const n = Number(m[1]);
  return String(n) === m[1] && n >= 1 && n <= cols ? null : `column ${m[1]} is not 1…${cols}`;
}

// ── (a) the eval set ────────────────────────────────────────────────────

test('the eval set: photos.json and truth.json list the same photos, every image file is there, and loadSet(eval) loads them all', () => {
  const ids = Object.keys(EVAL_PHOTOS);
  assert.ok(ids.length > 0, 'photos.json lists no photos');
  assert.deepStrictEqual(Object.keys(EVAL_TRUTH).sort(), ids.slice().sort());
  const missing = ids.filter(id => !fs.existsSync(path.join(EVAL, EVAL_PHOTOS[id].file)));
  assert.deepStrictEqual(missing, [], 'image files missing');
  assert.deepStrictEqual(EVAL_SET.map(p => p.id), ids);
});

test.each(Object.keys(EVAL_PHOTOS))('%s: an upright JPEG ≤ 2048 px of the size photos.json gives, cols 30 or 63, and the 4 corner taps on the image', id => {
  const p = EVAL_PHOTOS[id];
  const img = jpegInfo(fs.readFileSync(path.join(EVAL, p.file)));
  assert.deepStrictEqual([img.width, img.height], [p.width, p.height], `${p.file}: header size vs photos.json width/height`);
  assert.ok(Math.max(img.width, img.height) <= 2048, `${p.file}: long edge ${Math.max(img.width, img.height)} px`);
  assert.strictEqual(img.orientation, 1, `${p.file}: EXIF Orientation ${img.orientation}; the browser would turn it and move the taps`);

  assert.ok([30, 63].includes(p.cols), `cols ${p.cols}`);
  const n = p.cols;
  assert.deepStrictEqual(Object.keys(p.taps).sort(), ['a1', 'a' + n, 'j' + n, 'j1'].sort());
  for (const [hole, xy] of Object.entries(p.taps)) {
    assert.ok(Array.isArray(xy) && xy.length === 2 && xy.every(Number.isFinite), `${hole}: ${JSON.stringify(xy)}`);
    const [x, y] = xy;
    assert.ok(x >= 0 && x <= img.width && y >= 0 && y <= img.height, `${hole} [${x}, ${y}] is off the ${img.width}×${img.height} image`);
  }
});

test.each(Object.keys(EVAL_TRUTH))('%s: truth: a sign per rail strip, 2 leads per resistor and LED, 2 ends per wire, each a hole on this board or null with a why', id => {
  const t = EVAL_TRUTH[id], cols = EVAL_PHOTOS[id].cols;
  assert.deepStrictEqual(Object.keys(t.rails).sort(), STRIPS.slice().sort());
  for (const s of STRIPS) assert.ok(['+', '-', '?'].includes(t.rails[s]), `rails.${s} = ${JSON.stringify(t.rails[s])}`);

  const problems = [];
  for (const p of t.parts) {
    if (SCORED.includes(p.type) && (p.leads || []).length !== 2) problems.push(`${p.id}: ${(p.leads || []).length} leads`);
    (p.leads || []).forEach((l, k) => {
      const why = holeProblem(l, cols);
      if (why) problems.push(`${p.id}.leads[${k}] ${JSON.stringify(l.hole)}: ${why}`);
    });
  }
  for (const w of t.wires) {
    if (w.ends.length !== 2) problems.push(`${w.id}: ${w.ends.length} ends`);
    w.ends.forEach((e, k) => {
      const why = holeProblem(e, cols);
      if (why) problems.push(`${w.id}.ends[${k}] ${JSON.stringify(e.hole)}: ${why}`);
    });
  }
  assert.deepStrictEqual(problems, []);
});

// ── (b) the truth read back is full marks, in any order ─────────────────

// A truth entry → the snapped Reading shape score() takes (a lead's pin is its role).
const readBack = t => ({
  rails: Object.assign({}, t.rails),
  parts: t.parts.map(p => ({ id: p.id, type: p.type, value: p.value, leads: (p.leads || []).map(l => ({ hole: l.hole, role: l.pin })) })),
  wires: t.wires.map(w => ({ id: w.id, color: w.color, ends: w.ends.map(e => ({ hole: e.hole })) })),
});

// The same reading, parts and wires listed backwards, each one's leads and ends swapped.
const reordered = t => {
  const got = readBack(t);
  got.parts.reverse();
  got.wires.reverse();
  for (const p of got.parts) p.leads.reverse();
  for (const w of got.wires) w.ends.reverse();
  return got;
};

// Full marks, counted from the truth itself: every scored part and wire found,
// every located leg and end right, every known anode and rail sign right.
function fullMarks(t) {
  const scored = t.parts.filter(p => SCORED.includes(p.type));
  const located = list => list.filter(x => x.hole != null).length;
  const legs  = located(scored.flatMap(p => p.leads));
  const ends  = located(t.wires.flatMap(w => w.ends));
  const anode = scored.filter(p => p.type === 'led' && p.leads.some(l => l.pin === 'anode' && l.hole != null)).length;
  const rails = Object.values(t.rails || {}).filter(v => v === '+' || v === '-').length;
  return {
    parts: { truth: scored.length, found: scored.length, invented: 0 },
    legs:  { right: legs, total: legs },
    wires: { truth: t.wires.length, found: t.wires.length, invented: 0 },
    ends:  { right: ends, total: ends },
    polarity: { right: anode, known: anode },
    rails: { right: rails, known: rails },
  };
}
const marks = s => ({ parts: s.parts, legs: s.legs, wires: s.wires, ends: s.ends, polarity: s.polarity, rails: s.rails });

test.each(ALL.map(p => [`${p.set}/${p.id}`, p]))('%s: the truth read back scores full marks, unchanged with parts reordered and wire ends swapped', (_, p) => {
  const s = score(p.truth, readBack(p.truth));
  assert.deepStrictEqual(marks(s), fullMarks(p.truth));
  assert.deepStrictEqual(score(p.truth, reordered(p.truth)), s, 'the order of parts, wires, leads or ends changed the score');
});

test('the full-marks check has something to check: legs, wire ends, LED polarity and rail signs across the sets', () => {
  const sum = (k, f) => ALL.reduce((n, p) => n + fullMarks(p.truth)[k][f], 0);
  for (const [k, f] of [['legs', 'total'], ['ends', 'total'], ['polarity', 'known'], ['rails', 'known']]) {
    assert.ok(sum(k, f) > 0, `no photo has any ${k}.${f}`);
  }
});

// ── (c) scoring is by node ──────────────────────────────────────────────

test('nodeOf: a body hole is its column and half, a rail its strip, off is off; unseen holes say nothing', () => {
  const table = [
    ['a5', '5:a-e'], ['e5', '5:a-e'], ['f5', '5:f-j'], ['j63', '63:f-j'],
    ['rail:aOuter:14', 'rail:aOuter'], ['rail:jInner:1', 'rail:jInner'], ['off', 'off'],
    ['?', null], ['gap', null], [null, null], ['', null], ['rail:j:+:3', null], ['k5', null],
  ];
  for (const [hole, node] of table) assert.strictEqual(nodeOf(hole), node, `nodeOf(${JSON.stringify(hole)})`);
});

// R1 a5–a10; LED1 anode f10, cathode on the j-side outer rail; W1 from the a-side outer rail to b5.
const SMALL = {
  rails: { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' },
  parts: [
    { id: 'R1', type: 'resistor', leads: [{ pin: '1', hole: 'a5' }, { pin: '2', hole: 'a10' }] },
    { id: 'LED1', type: 'led', leads: [{ pin: 'anode', hole: 'f10' }, { pin: 'cathode', hole: 'rail:jOuter:10' }] },
  ],
  wires: [{ id: 'W1', ends: [{ hole: 'rail:aOuter:3' }, { hole: 'b5' }] }],
};

test('one moved leg or end: same column-half or strip is right; another half, column or strip, or an unseen hole, is wrong', () => {
  const moves = [
    { name: 'R1 a5 → e5, same half',            part: 0, lead: 0, hole: 'e5',             right: true },
    { name: 'R1 a5 → f5, other half',           part: 0, lead: 0, hole: 'f5',             right: false },
    { name: 'R1 a10 → a11, next column',        part: 0, lead: 1, hole: 'a11',            right: false },
    { name: 'R1 a5 → ?, unseen',                part: 0, lead: 0, hole: '?',              right: false },
    { name: 'LED1 cathode, same strip at 28',   part: 1, lead: 1, hole: 'rail:jOuter:28', right: true },
    { name: 'LED1 cathode → inner strip',       part: 1, lead: 1, hole: 'rail:jInner:10', right: false },
    { name: 'LED1 cathode → other side',        part: 1, lead: 1, hole: 'rail:aOuter:10', right: false },
    { name: 'LED1 cathode → off the board',     part: 1, lead: 1, hole: 'off',            right: false },
    { name: 'W1 rail → the a-side inner strip', wire: 0, end: 0,  hole: 'rail:aInner:3',  right: false },
    { name: 'W1 b5 → j5, other half',           wire: 0, end: 1,  hole: 'j5',             right: false },
    { name: 'W1 b5 → b4, next column',          wire: 0, end: 1,  hole: 'b4',             right: false },
    { name: 'W1 b5 → a5, same half',            wire: 0, end: 1,  hole: 'a5',             right: true },
  ];
  for (const m of moves) {
    const got = readBack(SMALL);
    if (m.part != null) got.parts[m.part].leads[m.lead].hole = m.hole;
    else got.wires[m.wire].ends[m.end].hole = m.hole;
    const s = score(SMALL, got);
    const off = m.right ? 0 : 1;
    assert.deepStrictEqual(s.parts, { truth: 2, found: 2, invented: 0 }, `${m.name}: parts`);
    assert.deepStrictEqual(s.wires, { truth: 1, found: 1, invented: 0 }, `${m.name}: wires`);
    assert.deepStrictEqual(s.legs, { right: 4 - (m.part != null ? off : 0), total: 4 }, `${m.name}: legs`);
    assert.deepStrictEqual(s.ends, { right: 2 - (m.wire != null ? off : 0), total: 2 }, `${m.name}: ends`);
  }
});

test('a prediction that shares no node with a truth item of its type is invented, and that truth item is missed', () => {
  // W1 with both ends wrong.
  const lost = readBack(SMALL);
  lost.wires[0].ends = [{ hole: 'rail:jInner:3' }, { hole: 'g5' }];
  let s = score(SMALL, lost);
  assert.deepStrictEqual([s.wires, s.ends], [{ truth: 1, found: 0, invented: 1 }, { right: 0, total: 2 }]);

  // R1 read as an LED: no resistor found, and the LED at a5–a10 matches no truth LED.
  const asLed = readBack(SMALL);
  asLed.parts[0].type = 'led';
  s = score(SMALL, asLed);
  assert.deepStrictEqual([s.parts, s.legs], [{ truth: 2, found: 1, invented: 1 }, { right: 2, total: 4 }]);

  // LED1 backwards: its legs are in the right nodes, its polarity isn't.
  const back = readBack(SMALL);
  back.parts[1].leads.forEach(l => { l.role = l.role === 'anode' ? 'cathode' : 'anode'; });
  s = score(SMALL, back);
  assert.deepStrictEqual([s.legs, s.polarity], [{ right: 4, total: 4 }, { right: 0, known: 1 }]);
});

test('the empty-board controls: every resistor, LED or wire read on them is invented', () => {
  const empty = EVAL_SET.filter(p => !p.truth.parts.length && !p.truth.wires.length);
  assert.ok(empty.length > 0, 'the eval set has no empty-board control');
  const got = readBack(SMALL);
  for (const p of empty) {
    const s = score(p.truth, got);
    assert.deepStrictEqual({ parts: s.parts, legs: s.legs, wires: s.wires, ends: s.ends, polarity: s.polarity }, {
      parts: { truth: 0, found: 0, invented: 2 }, legs: { right: 0, total: 0 },
      wires: { truth: 0, found: 0, invented: 1 }, ends: { right: 0, total: 0 },
      polarity: { right: 0, known: 0 },
    }, p.id);
  }
});

test.each(ALL.map(p => [`${p.set}/${p.id}`, p]))('%s: one extra resistor and wire on the truth read back are invented, everything else unchanged', (_, p) => {
  const base = score(p.truth, readBack(p.truth));
  const got = readBack(p.truth);
  got.parts.push({ id: 'RX', type: 'resistor', leads: [{ hole: 'a1', role: 'none' }, { hole: 'a2', role: 'none' }] });
  got.wires.push({ id: 'WX', ends: [{ hole: 'j1' }, { hole: 'j2' }] });
  const s = score(p.truth, got);
  const want = JSON.parse(JSON.stringify(base));
  want.parts.invented += 1;
  want.wires.invented += 1;
  assert.deepStrictEqual(s, want);
});

// ── (d) the web set's rails, as test/photo-import-truth.test.js reads them ──

test('loadSet(web) loads every web photo', () => {
  assert.deepStrictEqual(WEB_SET.map(p => p.id), Object.keys(WEB_PHOTOS));
});

test.each(Object.keys(WEB_PHOTOS))('%s: loadSet(web) puts each spike rail end on the strip railsOf picks; a strip no listed sign lands on stays ?', id => {
  const photo = WEB_PHOTOS[id];
  const want = railsOf(photo);
  assert.deepStrictEqual(webRails(photo).strips, want.strips, 'strips');

  const loaded = WEB_SET.find(p => p.id === id);
  const listed = new Set(Object.keys(photo.rails || {}).map(k => want.strips[k]));
  const signs = Object.fromEntries(STRIPS.map(s => [s, listed.has(s) ? want.signs[s] : '?']));
  assert.deepStrictEqual(loaded.truth.rails, signs, 'rail signs');

  // Every lead and end: railsOf's hole, except an unseen one stays null (score skips it).
  const raw = WEB_TRUTH[id];
  const conv = h => (h == null || !String(h).trim() ? null : holeOf(h, want.strips));
  const wantHoles = [...raw.parts.flatMap(q => (q.leads || []).map(l => conv(l.hole))),
                     ...(raw.wires || []).flatMap(w => w.ends.map(e => conv(e.hole)))];
  const gotHoles  = [...loaded.truth.parts.flatMap(q => q.leads.map(l => l.hole)),
                     ...loaded.truth.wires.flatMap(w => w.ends.map(e => e.hole))];
  assert.deepStrictEqual(gotHoles, wantHoles);
});

// ── (e) parseArgs ───────────────────────────────────────────────────────

test('parseArgs: the eval set once by default; a bad --set or --runs is refused', () => {
  const d = parseArgs([]);
  assert.deepStrictEqual([d.set, d.runs, d.only], ['eval', 1, null]);
  const f = parseArgs(['--set', 'all', '--runs', '3', '--only', 'e01,e04']);
  assert.deepStrictEqual([f.set, f.runs, f.only], ['all', 3, ['e01', 'e04']]);

  for (const argv of [['--set', 'nope'], ['--set', 'Eval'], ['--set']]) {
    assert.throws(() => parseArgs(argv), /--set/, `parseArgs(${JSON.stringify(argv)})`);
  }
  for (const argv of [['--runs', '0'], ['--runs', '-1'], ['--runs', '1.5'], ['--runs', 'three'], ['--runs']]) {
    assert.throws(() => parseArgs(argv), /--runs/, `parseArgs(${JSON.stringify(argv)})`);
  }
});
