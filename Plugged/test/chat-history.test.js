// What the AI is told it did (issue #85). chat.js keeps the conversation as
// { role, text } entries and sends the last 20 with each request. Until now
// the model's entry was its reply even when the user declined the build, so
// the AI thought it had built things it hadn't.
//
// Shape these tests assume (decided on the issue; the browser panel's
// chatHistory is not reachable from Node, so the text comes from one pure
// export the panel calls on Accept and Decline):
// - Chat.modelHistoryText(reply, actions, accepted) → the model entry's text.
//   - No actions (a plain answer): the reply as it is.
//   - Accepted: the reply, then one line starting "Applied:" that names each
//     applied action: its tool and the part label, wire id or wire ends it
//     acts on.
//   - Declined: exactly "(The user declined this build; the board is unchanged.)"
// e2e/edit-in-place.spec.js checks the page sends these in `history`.

const assert = require('node:assert');
const Chat = require('../circuit3d/js/chat.js');

const DECLINED = '(The user declined this build; the board is unchanged.)';

function historyText(reply, actions, accepted) {
  assert.equal(typeof Chat.modelHistoryText, 'function', 'chat.js exports no modelHistoryText(reply, actions, accepted)');
  return Chat.modelHistoryText(reply, actions, accepted);
}

// The lines after the reply, blank lines dropped.
const after = (text, reply) => {
  assert.ok(text.startsWith(reply), `the entry does not start with the reply: ${JSON.stringify(text)}`);
  return text.slice(reply.length).split('\n').filter(l => l.trim());
};

const EDIT = [
  { tool: 'set_value', part: 'R1', resistance: 1000 },
  { tool: 'delete_wire', wire: 'W3' },
  { tool: 'delete_part', part: 'LED1' },
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },
];

test('accepted: the reply, then one "Applied:" line naming each action by tool and label, wire id or ends', () => {
  const reply = 'LED1 was backwards, so I turned it round and set R1 to 1 kΩ.';
  const text = historyText(reply, EDIT, true);
  const rest = after(text, reply);
  assert.equal(rest.length, 1, `exactly one summary line after the reply: ${JSON.stringify(rest)}`);
  const line = rest[0];
  assert.match(line, /^Applied:/, line);
  for (const want of ['set_value', 'R1', 'delete_wire', 'W3', 'delete_part', 'LED1', 'place_led', 'add_wire', 'tp_3', 'a2']) {
    assert.ok(line.includes(want), `the Applied line does not name ${want}: ${line}`);
  }
});

test('accepted: a full build summarises every action on the one line', () => {
  const build = [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  ];
  const rest = after(historyText('Built it.', build, true), 'Built it.');
  assert.equal(rest.length, 1, JSON.stringify(rest));
  for (const want of ['delete_all', 'place_battery', 'BAT1.0', 'tp_63', 'place_resistor']) {
    assert.ok(rest[0].includes(want), `the Applied line does not name ${want}: ${rest[0]}`);
  }
});

test('declined: exactly the declined line, whatever the reply said', () => {
  assert.equal(historyText('Added a second LED in parallel.', [{ tool: 'place_led', holeA: 'd8', holeB: 'd6' }], false), DECLINED);
  assert.equal(historyText('LED1 was backwards; fixed.', EDIT, false), DECLINED);
});

test('a plain answer (no actions) stays as it is, accepted or not', () => {
  const reply = 'Your LED is backwards: its anode is on the ground column.';
  for (const actions of [[], undefined]) {
    assert.equal(historyText(reply, actions, true), reply);
    assert.equal(historyText(reply, actions, false), reply);
  }
});

// #85 review: the Applied line names only what really changed the board.
// modelHistoryText(reply, actions, accepted, failed = []): `failed` is the
// list of actions (the same objects) that could not be applied. The Applied
// line leaves them out and ends with " (N could not be applied)" when N > 0.
test('accepted with failures: the Applied line leaves the failed actions out and says how many could not be applied', () => {
  const reply = 'Removed W9 and set R1 to 1 kΩ.';
  const bad = { tool: 'delete_wire', wire: 'W9' };
  const badPart = { tool: 'set_value', part: 'R7', resistance: 220 };
  const actions = [{ tool: 'set_value', part: 'R1', resistance: 1000 }, bad, badPart];
  const rest = after(Chat.modelHistoryText(reply, actions, true, [bad, badPart]), reply);
  assert.equal(rest.length, 1, JSON.stringify(rest));
  const line = rest[0];
  assert.match(line, /^Applied:/, line);
  assert.ok(line.includes('set_value') && line.includes('R1'), `the applied set_value is named: ${line}`);
  assert.ok(!line.includes('W9'), `the failed delete_wire W9 is named as applied: ${line}`);
  assert.ok(!line.includes('R7'), `the failed set_value R7 is named as applied: ${line}`);
  assert.ok(line.includes(' (2 could not be applied)'), `no " (2 could not be applied)": ${line}`);
});

test('accepted with no failures (failed = [] or left out): no "could not be applied"', () => {
  const actions = [{ tool: 'set_value', part: 'R1', resistance: 1000 }];
  for (const text of [Chat.modelHistoryText('Done.', actions, true), Chat.modelHistoryText('Done.', actions, true, [])]) {
    assert.doesNotMatch(text, /could not be applied/, text);
    assert.match(text, /\nApplied:[^\n]*R1/, text);
  }
});
