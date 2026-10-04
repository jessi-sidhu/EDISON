// PhotoImport on real boards (issue #137): each spike photo's hand-labelled
// truth (test/fixtures/photo/web/truth.json) as a confirmed Reading v1 →
// PhotoImport.build → zero refusals and the truth's nets for every built
// part (docs/API-CONTRACT.md → "PhotoImport" → "Invariants"; the prototype
// imported 27 two-lead parts, 17 of them bridged).
//
// The truth → Reading v1:
// - resistors, LEDs and wires; every other type (button, battery, capacitor,
//   ic) → `other` (not built). There is no power entry, so the importer
//   assumes a battery on the rails in use; the nets check leaves it out.
// - holes: a body hole as is; null or blank → '?'; 'off' as is;
//   'rail:<a|j>:<+|->:N' → 'rail:<strip>:N', the strip found from
//   photos.json `rails`: each sign's offset in pitches in the j-on-top frame
//   (row j at 0, row a at 11); a strip under 3.4 pitches from its side's
//   body row is the inner one (the PhotoGrid snap rule). The printed signs
//   go in board.rails; a side with no rails listed gets BB830's. (railsOf
//   and holeOf: test/fixtures/photo-web-rails.js.)
// - LED pins 'anode' / 'cathode' are roles; '?' → 'unknown'. Resistor
//   values '100', '1k' → ohms; null → 0. LED value → its colour.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const {
  Parts, build, checkInvariants, assertSameNets, jumpersOf, skippedIds, kinds,
} = require('./fixtures/photo-import-helpers.js');
const { railsOf, holeOf } = require('./fixtures/photo-web-rails.js');

const WEB    = path.join(__dirname, 'fixtures/photo/web');
const TRUTH  = JSON.parse(fs.readFileSync(path.join(WEB, 'truth.json'), 'utf8'));
const PHOTOS = JSON.parse(fs.readFileSync(path.join(WEB, 'photos.json'), 'utf8'));

function ohms(v) {
  const m = /^(\d+(?:\.\d+)?)(k?)$/i.exec(String(v == null ? '' : v).trim());
  return m ? +m[1] * (m[2] ? 1000 : 1) : 0;
}

function toReading(pid) {
  const truth = TRUTH[pid], photo = PHOTOS[pid];
  const { strips, signs } = railsOf(photo);
  const parts = truth.parts.map(p => {
    const type = p.type === 'resistor' || p.type === 'led' ? p.type : 'other';
    const role = pin => (pin === 'anode' || pin === 'cathode' ? pin : type === 'led' ? 'unknown' : 'none');
    return {
      id: p.id, type, what: `${p.value || ''} ${p.type}`.trim(),
      value: type === 'resistor' ? ohms(p.value) : 0, bands: [],
      color: type === 'led' && p.value ? String(p.value) : '',
      leads: p.leads.map(l => ({ hole: holeOf(l.hole, strips), pt: [0, 0], role: role(l.pin) })),
      box: [0, 0, 0, 0], confidence: 0.8, unsure: [],
    };
  });
  const wires = truth.wires.map(w => ({
    id: w.id, color: w.color, ends: w.ends.map(e => ({ hole: holeOf(e && e.hole, strips), pt: [0, 0] })), confidence: 0.9, unsure: [],
  }));
  return { board: { visible: true, cols: photo.ncols, rails: signs, split: false }, parts, wires, power: [] };
}

// A Reading hole → { body, half, col } | { rail } | null (not on a hole).
function at(h) {
  let m = /^([a-j])(\d+)$/.exec(h);
  if (m) {
    const half = 'abcde'.includes(m[1]) ? 'top' : 'bot';
    return { body: true, half, col: +m[2], node: half + ':' + m[2] };
  }
  m = /^rail:(\w+):\d+$/.exec(h);
  return m ? { rail: true, node: 'rail:' + m[1] } : null;
}

// How many helper column-halves a part needs (the bridge, #137): 0
// when it sits on its own two nodes (one half, span in range; or straight
// across the gap in one column; or both in one rail, placed in that rail),
// 2 for two different rails, else 1.
function helpersFor(p) {
  const [A, B] = p.leads.map(l => at(l.hole));
  const { min, max } = Parts.get(p.type).place.span;
  if (A.body && B.body && A.half === B.half && A.col !== B.col) {
    const d = Math.abs(A.col - B.col);
    if (d >= min && d <= max) return 0;
  }
  if (A.body && B.body && A.half !== B.half && A.col === B.col) return 0;
  if (A.rail && B.rail) return A.node === B.node ? 0 : 2;
  return 1;
}

const buildable = rd => rd.parts.filter(p => p.type !== 'other' && p.leads.length === 2 && p.leads.every(l => at(l.hole)));

// A check on the fixtures and the conversion above (no PhotoImport): they
// give the parts the prototype imported.
test('the truth files hold the 27 two-lead parts the prototype imported, 17 of them needing the bridge', () => {
  const all = Object.keys(TRUTH).flatMap(pid => buildable(toReading(pid)));
  assert.strictEqual(all.length, 27);
  assert.strictEqual(all.filter(p => helpersFor(p) > 0).length, 17);
});

test.each(Object.keys(TRUTH))('%s: every resistor and LED on located holes is built, with zero refusals, one jumper per helper, and the truth\'s nets', pid => {
  const rd = toReading(pid);
  const out = build(rd);
  const board = checkInvariants(out);

  const want = buildable(rd);
  const unbuilt = want.filter(p => !out.labels[p.id] || skippedIds(out).includes(p.id)).map(p => p.id);
  assert.deepStrictEqual(unbuilt, [], `every located resistor and LED must be built; flags ${JSON.stringify(kinds(out))}`);

  const helpers = want.reduce((n, p) => n + helpersFor(p), 0);
  assert.strictEqual(jumpersOf(out).length, helpers, `expected ${helpers} bridge jumpers: ${JSON.stringify(jumpersOf(out))}`);

  assertSameNets(rd, out, board);
});
