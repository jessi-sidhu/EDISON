// Step 5: the stage board. 9 V battery on the top rails, 470 Ω from the +
// rail to column 14, a red LED BACKWARDS (cathode toward +), return wire
// to the − rail. Import → simulate → what the app says. Then flip it.
const assert = require('node:assert');
const H = require('./harness.js');

const reading = led => ({
  cols: 63,
  parts: [
    { id: 'battery', type: 'battery', value: '9V', leads: [{ pin: '+', hole: 'rail:a:+:3' }, { pin: '-', hole: 'rail:a:-:3' }] },
    { id: 'R', type: 'resistor', value: '470', leads: [{ pin: '1', hole: 'rail:a:+:10' }, { pin: '2', hole: 'a14' }] },
    { id: 'LED', type: 'led', value: 'red', leads: led },
  ],
  wires: [{ id: 'W', color: 'black', ends: [{ hole: 'b17' }, { hole: 'rail:a:-:19' }] }],
});

function show(title, res) {
  const m = res.sim.r.parts.LED1;
  console.log(`\n== ${title}`);
  console.log('actions:'); for (const a of res.out.actions) console.log('  ' + JSON.stringify(a));
  console.log('flags:', res.out.flags.map(f => `${f.kind}: ${f.why}`));
  console.log(`Board.apply errors ${res.applied.errors.length}, Accept failed ${res.acc.failed}, nets equal ${res.nets.equal}`);
  console.log(`LED1.m: on=${m.m.on} current=${m.m.current.toFixed(2)} mA; LED1 warnings: ${JSON.stringify(m.warnings)}`);
  console.log('results panel (Sim.analyze lines):'); for (const l of res.sim.r.lines) console.log(`  [${l.cls}] ${l.text}`);
  console.log('Readings.problems():', JSON.stringify(res.sim.problems, null, 1));
  return m;
}

// Backwards: cathode in column 14 (the resistor's end), anode in column 17 (to −).
const back = H.run(reading([{ pin: 'anode', hole: 'c17' }, { pin: 'cathode', hole: 'c14' }]));
const mb = show('BACKWARDS (as photographed)', back);
assert.strictEqual(back.applied.errors.length, 0); assert.strictEqual(back.acc.failed, 0); assert.ok(back.nets.equal);
assert.strictEqual(mb.m.on, false); assert.ok(Math.abs(mb.m.current) < 0.01);
assert.ok(back.sim.problems.some(p => p.kind === 'backwards'));

// The fix the student makes in the app: swap the LED's two holes (what F
// does in place mode for a flippable part), same board otherwise.
const board = JSON.parse(JSON.stringify(back.applied.board));
const led = board.parts.find(p => p.label === 'LED1');
led.holes.reverse();
const fixed = H.solve(board);
const mf = fixed.r.parts.LED1;
console.log(`\n== FLIPPED in the app (LED1 holes ${led.holes.join(' / ')}, cathode / anode)`);
console.log(`LED1.m: on=${mf.m.on} current=${mf.m.current.toFixed(2)} mA; problems ${JSON.stringify(fixed.problems)}`);
for (const l of fixed.r.lines) console.log(`  [${l.cls}] ${l.text}`);
assert.ok(mf.m.on && mf.m.current > 14.8 && mf.m.current < 15.0);

// And re-imported from a photo of the fixed board.
const fwd = H.run(reading([{ pin: 'anode', hole: 'c14' }, { pin: 'cathode', hole: 'c17' }]));
const m2 = fwd.sim.r.parts.LED1.m;
console.log(`\n== FLIPPED, re-imported: LED1 on=${m2.on} ${m2.current.toFixed(2)} mA, problems ${JSON.stringify(fwd.sim.problems)}`);
assert.ok(m2.on && m2.current > 14.8 && m2.current < 15.0);
console.log('\ndemo: OK');
