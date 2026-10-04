// Step 4: edge cases, plain asserts, each through the app's real code paths.
const assert = require('node:assert');
const H = require('./harness.js');

const BAT = (plus = 'rail:a:+:2', minus = 'rail:a:-:2') => ({ id: 'B', type: 'battery', value: '9V', leads: [{ pin: '+', hole: plus }, { pin: '-', hole: minus }] });
const R = (id, a, b, value = '470') => ({ id, type: 'resistor', value, leads: [{ pin: '1', hole: a }, { pin: '2', hole: b }] });
const LED = (id, anode, cathode, value = 'red') => ({ id, type: 'led', value, leads: [{ pin: 'anode', hole: anode }, { pin: 'cathode', hole: cathode }] });
const W = (id, a, b, color = 'yellow') => ({ id, color, ends: [{ hole: a }, { hole: b }] });
const place = (out, tool) => out.actions.filter(a => a.tool === tool);
const wiresOut = out => place(out, 'add_wire');
const kinds = out => out.flags.map(f => f.kind);
const led = (res, label = 'LED1') => res.sim.r.parts[label].m;

// Every case must pass these, whatever else it checks.
function clean(res, name, { stacked = 0 } = {}) {
  assert.strictEqual(res.applied.errors.length, 0, `${name}: Board.apply errors ${JSON.stringify(res.applied.errors)}`);
  assert.strictEqual(res.acc.failed, 0, `${name}: Accept failed ${JSON.stringify(res.acc.notes)}`);
  assert.deepStrictEqual(res.srv.refusals, [], `${name}: server refusals`);
  assert.strictEqual(res.srv.stacked.length, stacked, `${name}: stacked ${res.srv.stacked}`);
  assert.ok(res.sameBoard, `${name}: Accept path and Board.apply differ`);
  assert.ok(res.nets.equal, `${name}: nets differ ${res.nets.bad.slice(0, 3)}`);
}

const report = [];
function test(name, fn) {
  try { const note = fn(); report.push(['PASS', name, note || '']); } catch (e) { report.push(['FAIL', name, e.message]); }
}

test('clean LED circuit: holes kept, no bridge, lit ~14.9 mA', () => {
  const reading = { cols: 63, parts: [BAT(), R('R', 'c10', 'c14'), LED('L', 'd14', 'd16')],
                    wires: [W('W1', 'rail:a:+:10', 'a10', 'red'), W('W2', 'a16', 'rail:a:-:16', 'black')] };
  const res = H.run(reading); clean(res, 'clean');
  assert.deepStrictEqual(res.out.bridges, []); assert.deepStrictEqual(res.out.moved, []);
  assert.deepStrictEqual(res.out.flags, []);
  assert.deepStrictEqual(place(res.out, 'place_resistor')[0], { tool: 'place_resistor', holeA: 'c10', holeB: 'c14', resistance: 470 });
  assert.deepStrictEqual(place(res.out, 'place_led')[0], { tool: 'place_led', holeA: 'd16', holeB: 'd14', color: 'red' });
  assert.deepStrictEqual(wiresOut(res.out).map(w => [w.from, w.to]), [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_2'], ['tp_10', 'a10'], ['a16', 'tn_16']]);
  const m = led(res); assert.ok(m.on && m.current > 14.8 && m.current < 15.0, `LED ${JSON.stringify(m)}`);
  return `LED on ${m.current.toFixed(2)} mA, ${res.out.actions.length} actions`;
});

test('diagonal resistor c10→e14: re-rowed, not bridged', () => {
  const res = H.run({ cols: 63, parts: [BAT(), R('R', 'c10', 'e14')], wires: [W('W1', 'rail:a:+:10', 'a10'), W('W2', 'a14', 'rail:a:-:14')] });
  clean(res, 'diagonal');
  assert.strictEqual(res.out.bridges.length, 0);
  const p = place(res.out, 'place_resistor')[0];
  assert.deepStrictEqual([p.holeA, p.holeB], ['c10', 'c14']);
  assert.deepStrictEqual(res.out.moved.map(m => m.from + '→' + m.to), ['e14→c14']);
  return `placed ${p.holeA}/${p.holeB}, I = ${res.sim.r.parts.R1.m.current.toFixed(2)} mA`;
});

test('resistor spanning 8 columns a10→a18: bridged, electrically exact', () => {
  const reading = { cols: 63, parts: [BAT(), R('R', 'a10', 'a18')], wires: [W('W1', 'rail:a:+:10', 'b10'), W('W2', 'b18', 'rail:a:-:18')] };
  const res = H.run(reading); clean(res, 'span8');
  assert.strictEqual(res.out.bridges.length, 1);
  assert.match(res.out.bridges[0].why, /8 columns apart/);
  assert.ok(Math.abs(res.sim.r.parts.R1.m.current - 9 / 470 * 1000) < 0.01);
  // negative control: move the bridge wire's far end one column, nets must differ
  const bad = JSON.parse(JSON.stringify(res.out));
  const bw = bad.actions.find(a => a.tool === 'add_wire' && a.color === 'white');
  bw.to = bw.to.replace(/\d+$/, n => String(+n + 1));
  const board = H.apply(bad.actions).board;
  assert.strictEqual(H.compareNets(reading, bad, board).equal, false, 'negative control: corrupted bridge should break nets');
  const p = place(res.out, 'place_resistor')[0];
  return `${p.holeA}/${p.holeB} + wire ${wiresOut(res.out).filter(w => w.color === 'white').map(w => w.from + '→' + w.to)}; corrupted bridge detected`;
});

test('LED with both legs in one strip: bridged, simulator shows it shorted and dark', () => {
  const reading = { cols: 63, parts: [BAT(), R('R', 'b16', 'b20'), LED('L', 'c20', 'd20')],
                    wires: [W('W1', 'rail:a:+:16', 'a16'), W('W2', 'e20', 'rail:a:-:20')] };
  const res = H.run(reading); clean(res, 'shorted LED');
  assert.strictEqual(res.out.bridges.length, 1);
  assert.match(res.out.bridges[0].why, /one strip/);
  const n = H.netsOf(H.apply(res.out.actions).board).LED1;
  assert.strictEqual(n[0], n[1], 'LED pins on one net');
  const m = led(res); assert.ok(!m.on && Math.abs(m.current) < 0.01, JSON.stringify(m));
  return `LED off, ${m.current.toFixed(3)} mA, both pins on ${n[0]}; problems: ${JSON.stringify(res.sim.problems.map(p => p.kind))}; R1 ${res.sim.r.parts.R1.m.current.toFixed(1)} mA`;
});

test('two leads in one hole: the second moves to a free hole in its strip', () => {
  const res = H.run({ cols: 63, parts: [BAT(), R('R1', 'a10', 'a14'), R('R2', 'a14', 'a18')], wires: [W('W1', 'rail:a:+:10', 'b10'), W('W2', 'b18', 'rail:a:-:18')] });
  clean(res, 'shared hole');
  assert.strictEqual(res.out.bridges.length, 0);
  const [p1, p2] = place(res.out, 'place_resistor');
  assert.deepStrictEqual([p1.holeA, p1.holeB], ['a10', 'a14']);
  assert.strictEqual(p2.holeA.slice(1), '14'); assert.notStrictEqual(p2.holeA, 'a14');
  return `R2 at ${p2.holeA}/${p2.holeB}`;
});

test('a 6th lead into a full strip: flagged (strip-full), still electrically exact via a stacked wire end', () => {
  const parts = [BAT(), R('R1', 'a30', 'a26'), R('R2', 'b30', 'b27'), R('R3', 'c30', 'c35'), R('R4', 'd30', 'd34'), R('R5', 'e30', 'e33'), R('R6', 'c30', 'c25')];
  const res = H.run({ cols: 63, parts, wires: [W('W1', 'rail:a:+:24', 'a25'), W('W2', 'a35', 'rail:a:-:36')] });
  clean(res, 'strip full', { stacked: 1 });
  assert.ok(kinds(res.out).includes('strip-full'), kinds(res.out).join());
  assert.ok(kinds(res.out).includes('stacked'));
  return res.out.flags.filter(f => ['strip-full', 'stacked'].includes(f.kind)).map(f => f.why).join(' | ');
});

test('wire e10→f10 across the gap: kept as is, joins the two halves', () => {
  const res = H.run({ cols: 63, parts: [BAT('rail:a:+:2', 'rail:j:-:2'), R('R1', 'a6', 'a10'), R('R2', 'j10', 'j14')],
                      wires: [W('W1', 'e10', 'f10'), W('W2', 'rail:a:+:6', 'b6'), W('W3', 'i14', 'rail:j:-:14')] });
  clean(res, 'gap wire');
  assert.ok(wiresOut(res.out).some(w => w.from === 'e10' && w.to === 'f10'));
  const n = H.netsOf(H.apply(res.out.actions).board);
  assert.strictEqual(n.R1[1], n.R2[0]);
  assert.ok(Math.abs(res.sim.r.parts.R1.m.current - 9 / 940 * 1000) < 0.01);
  return `wire e10→f10 kept; R1/R2 in series, ${res.sim.r.parts.R1.m.current.toFixed(2)} mA (9 V / 940 Ω = 9.57)`;
});

test('bottom + rail on a BB830 board (inner, printed +) → bp, − → bn', () => {
  const res = H.run({ cols: 63, parts: [BAT('rail:j:+:5', 'rail:j:-:5'), R('R', 'f20', 'f24')], wires: [W('W1', 'rail:j:+:20', 'j20'), W('W2', 'j24', 'rail:j:-:24')] });
  clean(res, 'bp');
  assert.deepStrictEqual(wiresOut(res.out).map(w => [w.from, w.to]), [['BAT1.0', 'bp_5'], ['BAT1.1', 'bn_5'], ['bp_20', 'j20'], ['j24', 'bn_24']]);
  assert.ok(Math.abs(res.sim.r.parts.R1.m.current - 19.15) < 0.05);
  return `BAT1.0→bp_5, BAT1.1→bn_5, R1 ${res.sim.r.parts.R1.m.current.toFixed(2)} mA`;
});

test('a taken rail hole: the second end goes to N±1', () => {
  const res = H.run({ cols: 63, parts: [BAT(), R('R1', 'a12', 'a16'), R('R2', 'a20', 'a24')],
                      wires: [W('W1', 'rail:a:+:10', 'b12'), W('W2', 'rail:a:+:10', 'b20'), W('W3', 'b16', 'rail:a:-:16'), W('W4', 'b24', 'rail:a:-:24')] });
  clean(res, 'rail hole');
  const ends = wiresOut(res.out).map(w => w.from).filter(h => /^tp_/.test(h));
  assert.deepStrictEqual(ends.slice(0, 2).sort(), ['tp_10', /tp_(9|11)/.exec(ends.join())[0]].sort());
  return `rail ends ${ends.join(', ')}`;
});

test('no source: a 9 V battery is assumed on the rails used, flagged', () => {
  const res = H.run({ cols: 63, parts: [R('R', 'b10', 'b14')], wires: [W('W1', 'rail:a:+:8', 'a10'), W('W2', 'a14', 'rail:a:-:16')] });
  clean(res, 'no source');
  assert.ok(kinds(res.out).includes('assumed-source'));
  assert.deepStrictEqual(place(res.out, 'place_battery'), [{ tool: 'place_battery' }]);
  assert.ok(res.nets.assumedOk);
  assert.ok(Math.abs(res.sim.r.parts.R1.m.current - 19.15) < 0.05);
  return res.out.flags.find(f => f.kind === 'assumed-source').why;
});

test('30-column half board: helpers stay on the board; a31 is refused', () => {
  const res = H.run({ cols: 30, parts: [BAT(), R('R', 'a27', 'rail:a:-:29'), LED('L', 'c24', 'c27'), R('RX', 'a31', 'a28')],
                      wires: [W('W1', 'rail:a:+:20', 'a24')] });
  clean(res, 'half board');
  const helpers = res.out.bridges.flatMap(b => b.helpers.map(h => +h.split(':')[1]));
  assert.ok(helpers.length && helpers.every(c => c <= 30), `helpers ${helpers}`);
  assert.ok(res.out.skipped.some(s => s.id === 'RX' && /30-column/.test(s.why)));
  return `helpers at column ${helpers.join(', ')}; RX skipped: ${res.out.skipped.find(s => s.id === 'RX').why}`;
});

test('LED anode/cathode kept exactly, even when backwards', () => {
  const res = H.run({ cols: 63, parts: [BAT(), R('R', 'b16', 'b20'), LED('L', 'c22', 'c20')],
                      wires: [W('W1', 'rail:a:+:16', 'a16'), W('W2', 'a22', 'rail:a:-:22')] });
  clean(res, 'polarity');
  const p = place(res.out, 'place_led')[0];
  assert.deepStrictEqual([p.holeA, p.holeB], ['c20', 'c22']);   // holeA = cathode, holeB = anode, as read
  const m = led(res); assert.ok(!m.on);
  assert.ok(res.sim.problems.some(q => q.kind === 'backwards'));
  return `place_led cathode ${p.holeA}, anode ${p.holeB}: LED off, problem "backwards"`;
});

test('dense board: no free helper strip in span → far double bridge; none at all → skipped, flagged', () => {
  // every strip in columns 1–63 holds a wire end, except bottom columns 40 and 44
  const wires = [];
  const rail = (side, c) => `rail:${side}:${c % 2 ? '+' : '-'}:${c}`;
  for (let c = 1; c <= 63; c++) {
    wires.push(W('T' + c, 'a' + c, rail('a', c)));
    if (c !== 40 && c !== 44) wires.push(W('B' + c, 'j' + c, rail('j', c)));
  }
  const res = H.run({ cols: 63, parts: [BAT(), R('R', 'b10', 'b18')], wires });
  clean(res, 'dense');
  const b = res.out.bridges[0];
  assert.ok(b && b.helpers.length === 2, 'expected a double bridge');
  const res2 = H.run({ cols: 63, parts: [BAT(), R('R', 'b10', 'b18')], wires: wires.concat([W('B40', 'j40', 'rail:j:-:40'), W('B44', 'j44', 'rail:j:-:44')]) });
  assert.ok(res2.out.skipped.some(s => s.id === 'R'), 'R should be skipped when no strip is free');
  return `two free strips far away → ${b.helpers.join(' + ')} (${res.out.actions.filter(a => a.color === 'white').length} bridge wires); ` +
         `no free strip → R skipped: "${res2.out.skipped.find(s => s.id === 'R').why}"`;
});

// Fuzz: random readings on a 63-column board → never refused, nets always equal.
test('fuzz: 400 random boards (rails, diagonals, long spans, shared holes)', () => {
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const ROWS = 'abcdefghij';
  const hole = () => {
    if (rnd(5) === 0) return `rail:${'aj'[rnd(2)]}:${'+-'[rnd(2)]}:${1 + rnd(63)}`;
    return ROWS[rnd(10)] + (1 + rnd(40));
  };
  const near = h => { if (h.startsWith('rail')) return hole(); const c = +h.slice(1); return ROWS[rnd(10)] + Math.max(1, Math.min(63, c + rnd(13) - 6)); };
  let boards = 0, bridges = 0, stacked = 0, strips = 0;
  const fails = [];
  for (let k = 0; k < 400; k++) {
    const parts = [BAT(hole(), hole())], wires = [];
    const n = 2 + rnd(8);
    for (let i = 0; i < n; i++) { const a = hole(); const b = near(a); parts.push(rnd(2) ? R('R' + i, a, b) : LED('L' + i, a, b)); }
    for (let i = 0; i < rnd(6); i++) { const a = hole(); wires.push(W('W' + i, a, near(a))); }
    const reading = { cols: 63, parts, wires };
    let res;
    try { res = H.run(reading); } catch (e) { fails.push(`#${k} threw ${e.message}`); continue; }
    boards++;
    bridges += res.out.bridges.length;
    const st = res.out.flags.filter(f => f.kind === 'stacked').length;
    stacked += st; strips += res.out.flags.filter(f => f.kind === 'strip-full').length;
    const why = [];
    if (res.applied.errors.length) why.push('apply ' + JSON.stringify(res.applied.errors));
    if (res.acc.failed) why.push('accept ' + res.acc.notes.join(' / '));
    if (res.srv.refusals.length) why.push('server ' + res.srv.refusals.join(' / '));
    if (!res.sameBoard) why.push('boards differ');
    if (!res.nets.equal) why.push('nets ' + res.nets.bad.slice(0, 2).join(' / '));
    if (res.out.skipped.length) why.push('skipped ' + res.out.skipped.map(s => s.id + ': ' + s.why).join(' / '));
    if (res.srv.stacked.length && !st) why.push('stacked without a flag ' + res.srv.stacked);
    if (why.length) fails.push(`#${k}: ${why.join('; ')}`);
  }
  assert.deepStrictEqual(fails, [], fails.slice(0, 5).join('\n'));
  return `${boards} boards, ${bridges} bridges, ${strips} strip-full flags, ${stacked} stacked ends (all flagged), 0 refused, nets equal on all`;
});

for (const [s, name, note] of report) console.log(`${s}  ${name}\n      ${note}`);
const failed = report.filter(r => r[0] === 'FAIL').length;
console.log(`\n${report.length - failed}/${report.length} passed`);
process.exitCode = failed ? 1 : 0;
