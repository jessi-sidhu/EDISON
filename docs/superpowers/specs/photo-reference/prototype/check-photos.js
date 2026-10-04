// Step 3: each spike photo's hand-labelled truth → confirmed reading →
// PhotoImport → the app's real Board.apply / Accept path / checks → nets.
const fs = require('node:fs');
const path = require('node:path');
const H = require('./harness.js');

const SPIKE = path.join(__dirname, '../../../../../Plugged/test/fixtures/photo/web');
const TRUTH = JSON.parse(fs.readFileSync(path.join(SPIKE, 'truth.json'), 'utf8'));
const PHOTOS = JSON.parse(fs.readFileSync(path.join(SPIKE, 'photos.json'), 'utf8'));

// The truth file IS a confirmed reading, near enough: same hole vocabulary.
function toReading(pid) {
  const t = TRUTH[pid];
  return {
    cols: PHOTOS[pid].ncols,
    parts: t.parts.map(p => ({ id: p.id, type: p.type, value: p.value, leads: p.leads.map(l => ({ pin: l.pin, hole: l.hole })) })),
    wires: t.wires.map(w => ({ id: w.id, color: w.color, ends: w.ends.map(e => ({ hole: e.hole })) })),
  };
}

const rows = [];
for (const pid of Object.keys(TRUTH)) {
  const reading = toReading(pid);
  const res = H.run(reading);
  const { out } = res;
  const leds = Object.entries(res.sim.r.parts || {}).filter(([l]) => l.startsWith('LED')).map(([l, p]) => `${l} ${p.m.on ? 'on' : 'off'} ${p.m.current.toFixed(1)}mA`);
  const row = {
    photo: pid,
    actions: out.actions.length,
    applyErrors: res.applied.errors.length,
    acceptFailed: res.acc.failed,
    acceptNotes: res.acc.notes,
    serverRefusals: res.srv.refusals,
    stacked: res.srv.stacked,
    sameBoard: res.sameBoard,
    imported: Object.keys(out.labels).length,
    skipped: out.skipped.map(s => `${s.id} (${s.type}: ${s.why})`),
    bridges: out.bridges.map(b => `${b.id}→${b.label}: ${b.why} [helper ${b.helpers.join(',')}]`),
    moved: out.moved.map(m => `${m.id} ${m.from}→${m.to}`),
    flags: out.flags.filter(f => !['bridge', 'skipped', 'unsupported', 'lead-missing', 'wire-skipped'].includes(f.kind)).map(f => `${f.kind}: ${f.why}`),
    nets: `${res.nets.equal ? 'EQUAL' : 'DIFFER'} (${res.nets.terminals} terminals, ${res.nets.pairs} pairs)` +
          (res.nets.assumedOk == null ? '' : `; assumed battery on every rail used: ${res.nets.assumedOk}`),
    netDiffs: res.nets.bad.slice(0, 5),
    sim: `${res.sim.r.status}${res.sim.r.shorted ? ' SHORTED' : ''}; ${leds.join('; ')}`,
    problems: res.sim.problems.map(p => `${p.kind}: ${p.why}`),
  };
  rows.push(row);
}
// (the spike wrote results-photos.json here)
for (const r of rows) {
  console.log(`\n== ${r.photo}: actions ${r.actions}, Board.apply errors ${r.applyErrors}, Accept failed ${r.acceptFailed}, server refusals ${r.serverRefusals.length}, stacked ${r.stacked.length}, same board ${r.sameBoard}`);
  console.log(`   imported ${r.imported}; nets ${r.nets}`);
  for (const k of ['skipped', 'bridges', 'moved', 'flags', 'netDiffs', 'acceptNotes', 'serverRefusals', 'stacked', 'problems']) if (r[k].length) console.log(`   ${k}:\n     - ` + r[k].join('\n     - '));
  console.log(`   sim: ${r.sim}`);
}
