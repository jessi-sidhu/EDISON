// Tests for backend/server.js.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Server = require('../backend/server.js');

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
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  const prompt = src.slice(src.indexOf('const SYSTEM_PROMPT'), src.indexOf("].join('\\n');", src.indexOf('const SYSTEM_PROMPT')));
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
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  const prompt = src.slice(src.indexOf('const SYSTEM_PROMPT'), src.indexOf("].join('\\n');", src.indexOf('const SYSTEM_PROMPT')));
  assert.match(prompt, /resistance/);
  assert.match(prompt, /color/);
  assert.match(prompt, /voltage/);
});

// ── One lead per hole, series vs parallel, issue #10 ───────────────────────
// A breadboard hole takes one lead. A build that puts a part leg and a wire
// end (or two part legs) in the same body hole is flagged. Rail holes are
// one net each and are left alone.

const promptText = () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  return src.slice(src.indexOf('const SYSTEM_PROMPT'), src.indexOf("].join('\\n');", src.indexOf('const SYSTEM_PROMPT')));
};
const hole = h => new RegExp(`\\b${h}\\b`, 'i');

test('the recipe builds put at most one lead in each hole', () => {
  for (const [name, build] of Object.entries({ ONE_LED: Recipes.ONE_LED, PARALLEL_2: Recipes.PARALLEL_2, SERIES_2: Recipes.SERIES_2 })) {
    const used = Recipes.holesUsed(build);
    assert.deepEqual(used.filter((h, i) => used.indexOf(h) !== i), [], `${name} reuses a hole`);
  }
});

// The old row-a recipe: a2 holds the resistor and the rail wire, a6 the
// resistor and the LED anode, a8 the LED cathode and the ground wire.
test('findCircuitProblems flags the old stacked row-a build and names a2, a6 and a8', () => {
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
  assert.match(out.reply, /Heads up/);
  for (const h of ['a2', 'a6', 'a8']) assert.match(out.reply, hole(h), `the reply should name ${h}`);
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
