// Tests for backend/server.js.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');

// The system prompt as the server builds it and sends it. Its column lines are
// generated from board-geometry.js at startup (issue #22), so the tests read the
// built string, not the source.
const promptText = () => {
  assert.equal(typeof Server.SYSTEM_PROMPT, 'string', 'server.js must export the built SYSTEM_PROMPT');
  return Server.SYSTEM_PROMPT;
};

test('finishAIReply drops malformed actions, fills an empty reply and flags an unwired battery', () => {
  const out = Server.finishAIReply({ reply: '', actions: [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'battery_0_pin0' },              // no "to": malformed
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a7' },
  ] });
  assert.deepEqual(out.actions.map(a => a.tool), ['place_battery', 'place_resistor']);
  assert.match(out.reply, /built the circuit/);
  assert.match(out.reply, /battery_0_pin0 is not wired/);
});

// ── Battery by label form (BAT1.0), issue #8 ───────────────────────────────

const Recipes = require('./fixtures/recipes.js');

// The single-LED recipe build (one lead per hole, issue #10), with the
// battery wired as ref(pin).
const ledBuild = ref => Recipes.ONE_LED.map(a => {
  if (a.tool !== 'add_wire') return { ...a };
  const pin = s => { const m = /^BAT1\.(\d)$/.exec(s); return m ? ref(+m[1]) : s; };
  return { ...a, from: pin(a.from), to: pin(a.to) };
});

test('findCircuitProblems flags a short across BAT1.0 and BAT1.1', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'BAT1.1', color: 'red' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /short/i);
  assert.doesNotMatch(out.reply, /not wired/, 'both battery pins are wired; the problem is the short');
});

test('a single LED wired from BAT1.0 and BAT1.1 has no problems', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: ledBuild(k => `BAT1.${k}`) });
  assert.equal(out.reply, 'Built it.');
});

test('the same LED wired from battery_0_pin0 and battery_0_pin1 still has no problems', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: ledBuild(k => `battery_0_pin${k}`) });
  assert.equal(out.reply, 'Built it.');
});

test('a battery with only BAT1.0 wired is flagged for its unwired negative pin', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /(BAT1\.1|battery_0_pin1) is not wired/);
  assert.doesNotMatch(out.reply, /(BAT1\.0|battery_0_pin0) is not wired/, 'BAT1.0 is wired to tp_2');
});

test('the system prompt teaches the label form for battery pins', () => {
  const prompt = promptText();
  assert.match(prompt, /BAT1\.0/);
  assert.match(prompt, /BAT1\.1/);
  assert.doesNotMatch(prompt, /battery_0_pin/);
});

test('requiring the server does not start it listening', () => {
  assert.ok(Server.server, 'server.js should export its http server');
  assert.equal(Server.server.listening, false);
});

describe('over HTTP', () => {
  let base;
  beforeAll(() => new Promise(r => Server.server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${Server.server.address().port}`;
    r();
  })));
  afterAll(() => new Promise(r => Server.server.close(r)));

  test('rejects a body over 256 KB with 413 and keeps serving', async () => {
    const res = await fetch(base + '/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(300 * 1024),
    });
    assert.equal(res.status, 413);
    assert.equal((await fetch(base + '/api/health')).status, 200);
  });

  test('the unused OAuth and Cloudant routes are gone', async () => {
    assert.equal((await fetch(base + '/api/auth/google', { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(base + '/api/auth/callback?code=x')).status, 404);
    assert.equal((await fetch(base + '/api/circuits')).status, 404);
  });
});

// The proxy appends the address it saw to whatever X-Forwarded-For the client
// sent, so only the rightmost entry can be trusted: a client can put anything
// to its left to dodge the rate limit.
test('clientKey trusts only the proxy-added X-Forwarded-For entry, and only when TRUST_PROXY=1', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, socket: { remoteAddress: '10.0.0.9' } };
  delete process.env.TRUST_PROXY;
  assert.equal(Server.clientKey(req), '10.0.0.9');
  process.env.TRUST_PROXY = '1';
  assert.equal(Server.clientKey(req), '1.2.3.4');
  delete process.env.TRUST_PROXY;
});

// ── Part values (1 kΩ, green, 5 V), issue #9 ───────────────────────────────
// A bad value is dropped from its action, the part is still placed with its
// default, and the reply says so. A good value passes through untouched.

// The single-LED build with values on its parts.
const valuedBuild = (vals = {}) => ledBuild(k => `BAT1.${k}`).map(a =>
  a.tool === 'place_battery'  && 'voltage'    in vals ? { ...a, voltage: vals.voltage }
: a.tool === 'place_resistor' && 'resistance' in vals ? { ...a, resistance: vals.resistance }
: a.tool === 'place_led'      && 'color'      in vals ? { ...a, color: vals.color }
: a);
const find = (out, tool) => out.actions.find(a => a.tool === tool);

test('finishAIReply drops resistance: -5 but keeps the resistor, and says so in the reply', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ resistance: -5 }) });
  const r = find(out, 'place_resistor');
  assert.ok(r, 'the resistor is still placed');
  assert.deepStrictEqual(r, { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' });
  assert.equal(out.actions.length, 8, 'no action is removed');
  assert.match(out.reply, /resistance/i);
  assert.match(out.reply, /default/i);
});

for (const [name, bad] of [['NaN', NaN], ['Infinity', Infinity], ['0', 0], ['a non-number string', '1k ohm']]) {
  test(`finishAIReply drops a resistance of ${name} and keeps the resistor`, () => {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ resistance: bad }) });
    const r = find(out, 'place_resistor');
    assert.ok(r, 'the resistor is still placed');
    assert.equal('resistance' in r, false, `resistance ${String(bad)} should be dropped`);
    assert.match(out.reply, /resistance/i);
  });
}

// A null value never reaches the board, where it would replace the default.
// Whether the reply mentions it is left to the builder.
test('finishAIReply drops a null resistance and keeps the resistor', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ resistance: null }) });
  const r = find(out, 'place_resistor');
  assert.ok(r, 'the resistor is still placed');
  assert.equal('resistance' in r, false, 'resistance null should be dropped');
});

test('finishAIReply drops an unknown LED colour (purple) but keeps the LED', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ color: 'purple' }) });
  const led = find(out, 'place_led');
  assert.ok(led, 'the LED is still placed');
  assert.deepStrictEqual(led, { tool: 'place_led', holeA: 'c8', holeB: 'c6' });
  assert.match(out.reply, /colou?r/i);
  assert.match(out.reply, /purple/i);
  assert.match(out.reply, /default/i);
});

// Chosen rule: colour names are matched without regard to case and passed
// on in lower case, the way LED_TYPES in components.js spells them.
test('finishAIReply accepts "Green" and passes it on as "green", with no note', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ color: 'Green' }) });
  assert.equal(find(out, 'place_led').color, 'green');
  assert.equal(out.reply, 'Built it.');
});

for (const [name, bad] of [['0', 0], ['-9', -9], ['NaN', NaN]]) {
  test(`finishAIReply drops a battery voltage of ${name} but keeps the battery`, () => {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ voltage: bad }) });
    const b = find(out, 'place_battery');
    assert.ok(b, 'the battery is still placed');
    assert.deepStrictEqual(b, { tool: 'place_battery' });
    assert.match(out.reply, /voltage/i);
    assert.match(out.reply, /default/i);
  });
}

test('good values (1000 Ω, green, 5 V) pass through untouched, with no note', () => {
  const actions = valuedBuild({ resistance: 1000, color: 'green', voltage: 5 });
  const out = Server.finishAIReply({ reply: 'Built it.', actions: actions.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, actions);
  assert.equal(out.reply, 'Built it.');
});

test('the colours finishAIReply accepts are exactly red, yellow, green, blue and white', () => {
  for (const c of ['red', 'yellow', 'green', 'blue', 'white']) {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ color: c }) });
    assert.equal(find(out, 'place_led').color, c, `${c} is an LED colour`);
    assert.equal(out.reply, 'Built it.');
  }
  // The wire colour black is not an LED colour.
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ color: 'black' }) });
  assert.equal('color' in find(out, 'place_led'), false, 'black is not an LED colour');
});

test('the system prompt tells the AI to pass the values the user names', () => {
  const prompt = promptText();
  assert.match(prompt, /resistance/);
  assert.match(prompt, /color/);
  assert.match(prompt, /voltage/);
});

// ── One lead per hole, series vs parallel, issue #10 ───────────────────────
// A breadboard hole takes one lead. A build that puts a part leg and a wire
// end (or two part legs) in the same body hole is flagged. Rail holes are
// one net each and are left alone.

const hole = h => new RegExp(`\\b${h}\\b`, 'i');

test('the recipe builds put at most one lead in each hole', () => {
  for (const [name, build] of Object.entries({ ONE_LED: Recipes.ONE_LED, PARALLEL_2: Recipes.PARALLEL_2, SERIES_2: Recipes.SERIES_2 })) {
    const used = Recipes.holesUsed(build);
    assert.deepEqual(used.filter((h, i) => used.indexOf(h) !== i), [], `${name} reuses a hole`);
  }
});

// The old row-a recipe: a2 holds the resistor and the rail wire, a6 the
// resistor and the LED anode, a8 the LED cathode and the ground wire.
// Since #27 the LED is refused outright (a6 already holds the resistor), so
// it is dropped with a note naming a6, and a8 is left with just its wire;
// a2 is still two leads (a wire end is not a placement, so it isn't refused).
test('the old stacked row-a build: the LED is refused at a6, and a2 is still flagged', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_8', color: 'black' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led', holeA: 'a8', holeB: 'a6' },
    { tool: 'add_wire', from: 'tp_2', to: 'a2', color: 'red' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8', color: 'black' },
  ] });
  assert.ok(!out.actions.some(a => a.tool === 'place_led'), 'the LED at a8/a6 is refused and dropped');
  assert.match(out.reply, /a6 already holds/);
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /Hole a2 holds 2 leads/);
});

test('findCircuitProblems flags a3 holding both a resistor leg and a wire end', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_10', color: 'black' },
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a7' },
    { tool: 'place_led', holeA: 'b9', holeB: 'b7' },
    { tool: 'add_wire', from: 'tp_3', to: 'a3', color: 'red' },
    { tool: 'add_wire', from: 'c9', to: 'tn_9', color: 'black' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, hole('a3'));
});

test('hole names are compared without case: B2 and b2 are the same hole', () => {
  // Move the rail wire from a2 into B2, the resistor's hole b2.
  const actions = Recipes.ONE_LED.map(a => a.to === 'a2' ? { ...a, to: 'B2' } : { ...a });
  assert.ok(actions.some(a => a.to === 'B2'), 'the build must really move a wire end into B2');
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, hole('b2'));
});

for (const name of ['ONE_LED', 'PARALLEL_2', 'SERIES_2']) {
  test(`the ${name} recipe build has no problems`, () => {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: Recipes[name].map(a => ({ ...a })) });
    assert.equal(out.reply, 'Built it.');
  });
}

// Guard: step 3 scopes the check to body holes. A rail is one net, so
// reusing a rail hole (tp_N, the highest column, for both the battery wire and
// the resistor wire) is fine.
test('reusing a rail hole is not flagged', () => {
  const rail = `tp_${Recipes.HIGHEST_COL}`;
  const actions = Recipes.ONE_LED.map(a => a.from === 'tp_3' ? { ...a, from: rail } : { ...a });
  // The build must really put two wire ends in that rail hole, or this guard checks nothing.
  assert.equal(Recipes.holesUsed(actions).filter(h => h === rail).length, 2, `${rail} should hold both the battery and the resistor wire`);
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.equal(out.reply, 'Built it.');
});

// Guard: a2 and b2 share a node but are different holes.
test('a part lead and a wire end in different holes of one column are not flagged', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_9', color: 'black' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led', holeA: 'b8', holeB: 'b6' },
    { tool: 'add_wire', from: 'tp_3', to: 'b2', color: 'red' },
    { tool: 'add_wire', from: 'e8', to: 'tn_8', color: 'black' },
  ] });
  assert.equal(out.reply, 'Built it.');
});

test('the system prompt teaches one lead per hole and series vs parallel, with no stacked recipe', () => {
  const prompt = promptText();
  assert.match(prompt, /one lead/i);
  assert.match(prompt, /SERIES vs\.? PARALLEL/i);
  assert.match(prompt, /parallel/i);
  assert.match(prompt, /series/i);
  // The reply has to say which topology it built.
  assert.match(prompt, /explain[^\n]*(series|parallel|topology)|(series|parallel|topology)[^\n]*explain/i);
  // The old row-a recipe lines that stacked two leads in one hole.
  assert.doesNotMatch(prompt, /tp_\{C\}\s*->\s*a\{C\}/, 'rail wire into the resistor hole a{C}');
  assert.doesNotMatch(prompt, /holeA=a\{C\+6\}/, 'LED cathode in the ground wire hole a{C+6}');
  assert.doesNotMatch(prompt, /place_led: holeA=a\{C\+6\} \(cathode\), holeB=a\{C\+4\}/, 'LED anode in the resistor hole a{C+4}');
});

// ── Battery wires at the rail end nearest the battery, issue #12 ───────────
// The battery sits off the high-column end of the board, so its two wires go
// to tp_N and tn_N, N = the board's highest column. Each rail is one node, so
// this is electrically the same as the old start-column wires.

const batteryWires = actions => actions.filter(a => a.tool === 'add_wire' && /^BAT\d+\.\d$/i.test(a.from));

for (const name of ['ONE_LED', 'PARALLEL_2', 'SERIES_2']) {
  test(`the ${name} recipe build wires the battery to the rails at the highest column (${Recipes.HIGHEST_COL})`, () => {
    const wires = batteryWires(Recipes[name]);
    const ends = Object.fromEntries(wires.map(w => [w.from, w.to]));
    assert.equal(wires.length, 2, `${name} has two battery wires`);
    assert.equal(ends['BAT1.0'], `tp_${Recipes.HIGHEST_COL}`, 'BAT1.0 goes to the + rail at the highest column');
    assert.equal(ends['BAT1.1'], `tn_${Recipes.HIGHEST_COL}`, 'BAT1.1 goes to the - rail at the highest column');
  });
}

test('the system prompt wires every recipe battery to the rails at the highest column', () => {
  const prompt = promptText();
  const N = Recipes.HIGHEST_COL;
  // Each recipe line "BAT1.0 -> tp_X" / "BAT1.1 -> tn_X": one LED, series,
  // separate branches (parallel reuses the one-LED steps).
  const pos = [...prompt.matchAll(/BAT1\.0\s*->\s*(tp_\S+)/g)].map(m => m[1]);
  const neg = [...prompt.matchAll(/BAT1\.1\s*->\s*(tn_\S+)/g)].map(m => m[1]);
  assert.ok(pos.length >= 3, `expected at least 3 BAT1.0 recipe wires, got ${pos.length}`);
  assert.ok(neg.length >= 3, `expected at least 3 BAT1.1 recipe wires, got ${neg.length}`);
  const ok = (rail, t) => t === `${rail}_{N}` || t === `${rail}_${N}`;
  assert.deepEqual(pos.filter(t => !ok('tp', t)), [], `BAT1.0 wires must end at tp_{N} or tp_${N}`);
  assert.deepEqual(neg.filter(t => !ok('tn', t)), [], `BAT1.1 wires must end at tn_{N} or tn_${N}`);
  // Today's start-column battery wires.
  assert.doesNotMatch(prompt, /BAT1\.0\s*->\s*tp_\{C/, 'BAT1.0 -> tp_{C} (start column)');
  assert.doesNotMatch(prompt, /BAT1\.1\s*->\s*tn_\{C/, 'BAT1.1 -> tn_{C+k} (start column)');
  assert.doesNotMatch(prompt, /BAT1\.0\s*->\s*tp_2\b/, 'BAT1.0 -> tp_2 in separate branches');
  assert.doesNotMatch(prompt, /BAT1\.1\s*->\s*tn_9\b/, 'BAT1.1 -> tn_9 in separate branches');
});

test('the system prompt defines N as the highest column and has the battery-wire rule', () => {
  const lines = promptText().split('\n');
  assert.ok(lines.some(l => /highest column/i.test(l) && /\bN\b/.test(l)),
    'a line defines N as the highest column in the board description');
  assert.ok(lines.some(l => /battery wires/i.test(l) && /highest column/i.test(l)),
    'rule line: battery wires go to the rails at the highest column');
});

// Guard: only the battery wires move. The rail-to-body wires stay at the start
// column (and land in row a, issue #16).
test('the system prompt keeps the rail-to-body wires at the start column', () => {
  const prompt = promptText();
  assert.match(prompt, /tp_\{C\+1\}\s*->\s*a\{C\}/);
  assert.match(prompt, /a\{C\+6\}\s*->\s*tn_\{C\+6\}/);
  assert.match(prompt, /a\{C\+8\}\s*->\s*tn_\{C\+8\}/);
});

// ── Rail wires land in row a, issue #16 ────────────────────────────────────
// Row a is the row nearest the rails. A rail wire that lands in row b or c
// arcs over (under) whatever sits in row a, so the rail-to-body wires land in
// row a and every part sits in rows b-e.

const BODY = /^[a-j]\d+$/i, RAIL = /^(tp|tn|bp|bn)_\d+$/i;
const railBodyWires = actions => actions.filter(a => a.tool === 'add_wire' &&
  ((RAIL.test(a.from) && BODY.test(a.to)) || (BODY.test(a.from) && RAIL.test(a.to))));

for (const name of ['ONE_LED', 'PARALLEL_2', 'SERIES_2']) {
  test(`the ${name} recipe build lands its rail wires in row a and keeps its parts out of row a`, () => {
    const wires = railBodyWires(Recipes[name]);
    assert.equal(wires.length, 2, `${name} has two rail-to-body wires`);
    const bodyEnds = wires.map(w => (BODY.test(w.from) ? w.from : w.to).toLowerCase());
    assert.deepEqual(bodyEnds.filter(h => h[0] !== 'a'), [], `${name}: rail-to-body wires must land in row a`);
    const leads = Recipes[name].filter(a => /^place_/.test(a.tool) && a.holeA)
      .flatMap(a => [a.holeA, a.holeB]).map(h => h.toLowerCase());
    assert.deepEqual(leads.filter(h => h[0] === 'a'), [], `${name}: no part lead may sit in row a`);
  });
}

test('the system prompt lands every recipe rail wire in row a and places no part in row a', () => {
  const prompt = promptText();
  // Rail-to-body wire lines in the recipes: "tp_{..} -> x{..}" and "x{..} -> tn_{..}".
  const toBody   = [...prompt.matchAll(/\b(?:tp|tn)_\{[^}]*\}\s*->\s*([a-j])\{[^}]*\}/g)];
  const fromBody = [...prompt.matchAll(/\b([a-j])\{[^}]*\}\s*->\s*(?:tp|tn)_\{[^}]*\}/g)];
  const all = [...toBody, ...fromBody];
  // one LED (2), series (2), separate branches (2)
  assert.ok(all.length >= 6, `expected at least 6 recipe rail-to-body wires, got ${all.length}`);
  assert.deepEqual(all.filter(m => m[1].toLowerCase() !== 'a').map(m => m[0]), [],
    'every recipe rail-to-body wire must land in row a');
  // The separate-branches line names both wires of each group.
  assert.match(prompt, /tp_\{C\+1\}\s*->\s*a\{C\} and a\{C\+6\}\s*->\s*tn_\{C\+6\}/,
    'separate branches: tp_{C+1}->a{C} and a{C+6}->tn_{C+6}');
  // No recipe puts a part lead in row a.
  const placeLines = prompt.split('\n').filter(l => /place_(resistor|led|buzzer|button)/.test(l) && /hole[AB]=/.test(l));
  assert.ok(placeLines.length >= 5, `expected at least 5 recipe place_ lines, got ${placeLines.length}`);
  assert.deepEqual(placeLines.filter(l => /hole[AB]=a\{/.test(l)), [], 'no recipe places a part in row a');
  // The old rail wires behind the parts are gone.
  assert.doesNotMatch(prompt, /tp_\{C\+1\}\s*->\s*[b-e]\{C\}/, 'tp_{C+1} -> b{C} (under the resistor)');
  assert.doesNotMatch(prompt, /c\{C\+6\}\s*->\s*tn_/, 'c{C+6} -> tn_ (between the LED legs)');
  assert.doesNotMatch(prompt, /d\{C\+8\}\s*->\s*tn_/, 'd{C+8} -> tn_ (series ground wire behind LED2)');
});

test('the system prompt worked example at C=2 uses the row-a wires', () => {
  const prompt = promptText();
  assert.match(prompt, /tp_3\s*->\s*a2\b/, 'At C=2: tp_3 -> a2');
  assert.match(prompt, /\ba8\s*->\s*tn_8\b/, 'At C=2: a8 -> tn_8');
  assert.doesNotMatch(prompt, /tp_3\s*->\s*b2\b/, 'old example wire tp_3 -> b2');
  assert.doesNotMatch(prompt, /\bc8\s*->\s*tn_8\b/, 'old example wire c8 -> tn_8');
});

test('the system prompt has a rule that rail wires land in row a', () => {
  const lines = promptText().split('\n');
  assert.ok(lines.some(l => /\brow a\b/i.test(l) && /rail/i.test(l)),
    'a rule line says rail wires land in row a, nearest the rails');
});

// ── Partial replies (no delete_all), issue #14 ─────────────────────────────
// findCircuitProblems sees only the reply's actions, not the board on screen.
// A reply with no delete_all adds to that board, so the LED checks (backwards /
// not connected) can't be judged and are skipped. A reply with any delete_all
// is a full rebuild and is checked as before. The checks that are sound on the
// reply alone (stacked holes, battery short, battery placed but not wired,
// part values) run on every reply.

test('a partial reply of one place_led (d8/d6) comes back unchanged, with no "Heads up"', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'place_led', holeA: 'd8', holeB: 'd6' },
  ] });
  assert.equal(out.reply, 'Added it.');
});

test('a partial reply adding a second LED and a wire has no LED "not connected" line', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'place_led', holeA: 'd8', holeB: 'd6' },
    { tool: 'add_wire', from: 'a10', to: 'tn_10', color: 'black' },
  ] });
  assert.doesNotMatch(out.reply, /LED at d8\/d6 is (not connected|backwards)/);
  assert.doesNotMatch(out.reply, /Heads up/);
});

// Guard: stacking is judged within the reply's own actions. Since #27 a part
// into a hole an earlier action holds is refused and dropped, with a note.
// (The resistor was d8→e12, which is now refused for its span first; d8→d12
// keeps this about the shared hole.)
test('a partial reply that puts a second lead in d8 has that part refused', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'place_led', holeA: 'd8', holeB: 'd6' },
    { tool: 'place_resistor', holeA: 'd8', holeB: 'd12' },
  ] });
  assert.deepStrictEqual(out.actions, [{ tool: 'place_led', holeA: 'd8', holeB: 'd6' }]);
  assert.match(out.reply, /d8 already holds/);
});

// Guard: wires alone joining + to − is a short whatever else is on the board.
test('a partial reply wiring BAT1.0 to BAT1.1 is still flagged as a short', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'add_wire', from: 'BAT1.0', to: 'BAT1.1', color: 'red' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /short/i);
});

// Guard: a battery placed in this reply can't have been wired before it existed.
test('a partial reply placing a battery with no wires still flags both pins as not wired', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'place_battery' },
  ] });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, /BAT1\.0 is not wired/);
  assert.match(out.reply, /BAT1\.1 is not wired/);
});

// Guard: value checks run on every reply.
test('a partial reply placing a resistor with resistance -5 still gets the value note', () => {
  const out = Server.finishAIReply({ reply: 'Added it.', actions: [
    { tool: 'place_resistor', holeA: 'e12', holeB: 'e16', resistance: -5 },
  ] });
  assert.deepStrictEqual(find(out, 'place_resistor'), { tool: 'place_resistor', holeA: 'e12', holeB: 'e16' });
  assert.match(out.reply, /resistance/i);
  assert.match(out.reply, /default/i);
});

// The ONE_LED build with its LED's holeA and holeB swapped.
const backwardsLedBuild = () => Recipes.ONE_LED.map(a =>
  a.tool === 'place_led' ? { ...a, holeA: a.holeB, holeB: a.holeA } : { ...a });

// Guard: a full rebuild keeps its LED checks.
test('a full rebuild with a backwards LED is still flagged', () => {
  const actions = backwardsLedBuild();
  assert.ok(actions.some(a => a.tool === 'delete_all'), 'ONE_LED should be a full rebuild');
  const led = actions.find(a => a.tool === 'place_led');
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, new RegExp(`LED at ${led.holeA}/${led.holeB} is backwards`));
});

// Guard: "full rebuild" means any delete_all in the reply, not only a first one.
test('a reply whose delete_all is not the first action is a full rebuild and keeps its LED checks', () => {
  const actions = [{ tool: 'place_led', holeA: 'j20', holeB: 'j18' }, ...backwardsLedBuild()];
  assert.notEqual(actions[0].tool, 'delete_all');
  assert.ok(actions.some(a => a.tool === 'delete_all'));
  const led = backwardsLedBuild().find(a => a.tool === 'place_led');
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.match(out.reply, /Heads up/);
  assert.match(out.reply, new RegExp(`LED at ${led.holeA}/${led.holeB} is backwards`));
});

// ── 63-column board, issue #22 ─────────────────────────────────────────────
// The prompt's column count and the battery-column note are built from
// circuit3d/js/board-geometry.js, so no board width is typed into server.js.

const GEOMETRY_FILE = require('node:path').join(__dirname, '..', 'circuit3d', 'js', 'board-geometry.js');

test('the built system prompt says "Columns 1-63"', () => {
  const prompt = promptText();
  assert.match(prompt, /Columns 1-63\b/);
  assert.doesNotMatch(prompt, /Columns 1-50\b/, 'the old 50-column line is still there');
});

// A leftover of the OLD 50-column board: 50 as a column or board count
// ("50 columns", "column 50", "Columns 1-50", "a 50-column board", "tp_50",
// "_50"). Not a part's value: 50 followed by a unit ("default 50 mA", the
// motor's start current, #37) is fine. Not part of a longer number (500, 150,
// 0.50) either.
const OLD_BOARD_50 = /(?<![\d.])50(?!\d)(?!\s?(?:(?:mA|µA|uA|A|V|W|ohms?)(?![A-Za-z])|[Ω%°]))/;

test('OLD_BOARD_50 catches 50 as a column or board count, and lets 50 with a unit through', () => {
  for (const line of ['on a 50-column board', 'wire to tp_50', 'tn_50', 'bp_50 and bn_50', 'column 50',
    'the board has 50 columns', '- Columns 1-50. Rows a/b/c/d/e = top half.', 'holes a50 to e50']) {
    assert.match(line, OLD_BOARD_50, `a board leftover: "${line}"`);
  }
  for (const line of ['- place_motor startCurrent: 1 mA–2 A, in amps (default 50 mA)', 'a 50 Ω resistor', '50Ω',
    'at 50%', 'at 50 °C', '50 V', '50 W', '0.05 A', 'default 500 mA', 'R 150 ohm', '0.50 V', 'tp_63']) {
    assert.doesNotMatch(line, OLD_BOARD_50, `a value, not the board: "${line}"`);
  }
});

test('the built system prompt has no 50 left in it as a column or board count (the old 50-column board)', () => {
  const hits = promptText().split('\n').filter(l => OLD_BOARD_50.test(l));
  assert.deepEqual(hits, [], 'lines still mentioning the 50-column board');
});

test('the separate-branches note puts the battery wires on tp_63 and tn_63 of a 63-column board', () => {
  const line = promptText().split('\n').find(l => /Battery wires once/i.test(l));
  assert.ok(line, 'no "Battery wires once" line in the separate-branches recipe');
  assert.match(line, /\btp_63\b/);
  assert.match(line, /\btn_63\b/);
  assert.match(line, /\b63-column board\b/);
});

test('the prompt\'s column count follows board-geometry.js, not a number typed into server.js', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  assert.match(src, /require\([^)]*board-geometry(\.js)?['"]\)/, 'server.js must require circuit3d/js/board-geometry.js');
  assert.doesNotMatch(src, /Columns 1-\d/, 'server.js still types the column count into the prompt');
  assert.doesNotMatch(src, /\b(tp|tn)_\d+ and (tp|tn)_\d+ on a \d+-column board/, 'server.js still types the battery column into the prompt');
  const { COLS } = require(GEOMETRY_FILE);
  assert.match(promptText(), new RegExp(`Columns 1-${COLS}\\b`));
});

test('the recipe builds put the battery wires on tp_63 and tn_63', () => {
  assert.equal(Recipes.HIGHEST_COL, 63, 'recipes.js must read COLS from board-geometry.js');
  for (const name of ['ONE_LED', 'PARALLEL_2', 'SERIES_2']) {
    const ends = Object.fromEntries(batteryWires(Recipes[name]).map(w => [w.from, w.to]));
    assert.deepStrictEqual(ends, { 'BAT1.0': 'tp_63', 'BAT1.1': 'tn_63' }, name);
  }
});

// ── Placement and values from the registry, issue #27 (D1) ─────────────────
// finishAIReply runs for every provider. It checks each place_* action with
// Parts.checkPlacement against the holes the earlier actions use, drops a
// refused one and adds its reason as a note. Values go through
// Parts.checkValue: a bad value is dropped with a note (the part stays), and
// a kit hint (e.g. 350 Ω → 330 Ω) is added as a note.

test('finishAIReply drops a resistor at b2→b32 and the note gives the range "3–5"', () => {
  const actions = Recipes.ONE_LED.map(a => a.tool === 'place_resistor' ? { ...a, holeB: 'b32' } : { ...a });
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.ok(!out.actions.some(a => a.tool === 'place_resistor'), 'the resistor at b2/b32 is dropped');
  assert.equal(out.actions.length, Recipes.ONE_LED.length - 1, 'only the refused resistor is dropped');
  assert.match(out.reply, /3–5/);
  assert.match(out.reply, /\bb32\b/);
});

test('finishAIReply drops a second LED into holes the first LED holds', () => {
  const actions = [...Recipes.ONE_LED.map(a => ({ ...a })), { tool: 'place_led', holeA: 'c8', holeB: 'c6' }];
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED, 'the clashing LED is dropped, the rest kept');
  assert.match(out.reply, /c8 already holds/);
});

test('a refused part does not hold its holes: a later part may use them', () => {
  // The first resistor is refused (b2→b32), so b2 is free for the retry.
  const actions = Recipes.ONE_LED.flatMap(a => a.tool === 'place_resistor'
    ? [{ ...a, holeB: 'b32' }, { ...a }] : [{ ...a }]);
  const out = Server.finishAIReply({ reply: 'Built it.', actions });
  assert.deepStrictEqual(out.actions, Recipes.ONE_LED);
  assert.match(out.reply, /3–5/);
  assert.doesNotMatch(out.reply, /b2 already holds/);
});

for (const [name, bad, range] of [['20 MΩ', 20e6, /10 MΩ/], ['0.5 Ω', 0.5, /1 Ω/]]) {
  test(`finishAIReply drops a resistance of ${name}, out of range, and keeps the resistor`, () => {
    const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ resistance: bad }) });
    assert.deepStrictEqual(find(out, 'place_resistor'), { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' });
    assert.match(out.reply, /resistance/i);
    assert.match(out.reply, range, 'the note gives the allowed range');
  });
}

test('finishAIReply drops a battery voltage of 30, above 24 V, and keeps the battery', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ voltage: 30 }) });
  assert.deepStrictEqual(find(out, 'place_battery'), { tool: 'place_battery' });
  assert.match(out.reply, /voltage/i);
  assert.match(out.reply, /24 V/);
});

test('a 350 Ω resistor is kept at 350, with a note giving the closest kit value, 330 Ω', () => {
  const out = Server.finishAIReply({ reply: 'Built it.', actions: valuedBuild({ resistance: 350 }) });
  assert.equal(find(out, 'place_resistor').resistance, 350);
  assert.match(out.reply, /330 Ω/);
});
