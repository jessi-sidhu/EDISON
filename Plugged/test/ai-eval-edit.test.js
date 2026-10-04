// The real-AI eval's edit cases (issue #85). No network: grade() gets canned
// replies. A correct edit keeps every correct part and wire where it was; a
// rebuild that moves things or renumbers wires must not pass.
//
// Shapes these tests assume (decided on the issue):
// - A case's `board` may be the board-model shape App.exportBoard() gives
//   (wires { id, from, to }); the Example shape (wires [from, to], numbered
//   W1…Wn) still works.
// - checks.keep = { parts: { LABEL: [holes…] }, wires: ['W1', …] }: after
//   the reply, each part still exists with exactly those holes ('keep.parts.LABEL'
//   when not), and each wire id still exists with the same ends it had on
//   the case's starting board ('keep.wires.Wn' when not).
// - Three edit cases in scripts/ai-eval-cases.js, each with `board` and
//   `markdown` loaded from a file the builder captures from the running app
//   with scripts/capture-board.js (App.exportBoard() + App.exportMarkdown()),
//   saved as { "board": …, "markdown": … }:
//     EDIT-fix          backwards-led.json  "Fix it." on the one-LED build with LED1 backwards
//     EDIT-add-led      one-led.json        "Add a second LED in parallel."
//     EDIT-resistor-1k  one-led.json        "Make the resistor 1k."

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Board = require('../circuit3d/js/board-model.js');
const Sim   = require('../circuit3d/js/simulate.js');
const Eval  = require('../scripts/ai-eval.js');
const CASES = require('../scripts/ai-eval-cases.js');

const BOARDS_DIR = path.join(__dirname, '..', 'scripts', 'ai-eval-boards');
const reply = (actions, text = 'Done.') => ({ reply: text, actions });

// grade, failing as an assertion (not a crash) while it can't take a
// board-model board.
function grade(testCase, r) {
  let got;
  try { got = Eval.grade(testCase, r); } catch (e) {
    assert.fail(`grade threw on ${testCase.id}: ${e.message} (grade must take a board-model board, wires with ids)`);
  }
  return got;
}

// ── The keep check, on a written board ──────────────────────────────────────

// The one-LED build in the board-model shape, as App.exportBoard() sends it.
// Wire W3 was deleted by hand once, so the ids are W1, W2, W4, W5.
const LED_BOARD = {
  parts: [
    { type: 'battery',  label: 'BAT1', values: {} },
    { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: {} },
    { type: 'led',      label: 'LED1', holes: ['c8', 'c6'], values: {} },
  ],
  wires: [
    { id: 'W1', from: 'BAT1.0', to: 'tp_63' },
    { id: 'W2', from: 'BAT1.1', to: 'tn_63' },
    { id: 'W4', from: 'a8', to: 'tn_8' },
    { id: 'W5', from: 'tp_3', to: 'a2' },
  ],
};
const KEEP_ALL = { parts: { R1: ['b2', 'b6'], LED1: ['c8', 'c6'] }, wires: ['W1', 'W2', 'W4', 'W5'] };
const KEEP_CASE = { id: 'T-KEEP', message: 'x', board: LED_BOARD, checks: { keep: KEEP_ALL } };

test('precondition: the written board lights LED1', () => {
  const { components, wires } = Board.toSim(LED_BOARD);
  assert.equal(Sim.analyze(components, wires).parts.LED1.m.on, true);
});

test('keep passes an edit that leaves the kept parts and wires alone', () => {
  assert.deepStrictEqual(grade(KEEP_CASE, reply([{ tool: 'set_value', part: 'R1', resistance: 1000 }])), { pass: true, failed: [] });
  // A new LED and its own wire: nothing kept moves.
  assert.deepStrictEqual(grade(KEEP_CASE, reply([
    { tool: 'place_led', holeA: 'd8', holeB: 'd6' },
    { tool: 'add_wire', from: 'a20', to: 'a24' },
  ])), { pass: true, failed: [] });
});

test('keep names the part that moved or went: keep.parts.R1, and only it', () => {
  const moved = grade(KEEP_CASE, reply([{ tool: 'delete_part', part: 'R1' }, { tool: 'place_resistor', holeA: 'b3', holeB: 'b7' }]));
  assert.deepStrictEqual(moved, { pass: false, failed: ['keep.parts.R1'] });
  const gone = grade(KEEP_CASE, reply([{ tool: 'delete_part', part: 'R1' }]));
  assert.deepStrictEqual(gone, { pass: false, failed: ['keep.parts.R1'] });
  // Same holes, other way round, is not the same part placement.
  const turned = grade(KEEP_CASE, reply([{ tool: 'delete_part', part: 'LED1' }, { tool: 'place_led', holeA: 'c6', holeB: 'c8' }]));
  assert.deepStrictEqual(turned, { pass: false, failed: ['keep.parts.LED1'] });
});

test('keep names the wire that was redrawn under a new id: keep.wires.W2, and only it', () => {
  // Same ends, but the id is now W6.
  const redrawn = grade(KEEP_CASE, reply([{ tool: 'delete_wire', wire: 'W2' }, { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63' }]));
  assert.deepStrictEqual(redrawn, { pass: false, failed: ['keep.wires.W2'] });
});

test('keep fails a delete_all rebuild with identical holes whose wires come back under other ids', () => {
  // Rebuilt from scratch, wires in another order: W1 is now tp_3 → a2, and
  // W4 and W5 (the board's gap) are gone or moved.
  const rebuilt = grade(KEEP_CASE, reply([
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63' },
  ]));
  assert.strictEqual(rebuilt.pass, false);
  assert.ok(!rebuilt.failed.some(f => f.startsWith('keep.parts.')), `the holes are identical: ${JSON.stringify(rebuilt.failed)}`);
  assert.deepStrictEqual(rebuilt.failed.filter(f => f.startsWith('keep.wires.')).sort(),
    ['keep.wires.W1', 'keep.wires.W2', 'keep.wires.W4', 'keep.wires.W5'], JSON.stringify(rebuilt.failed));
});

test('keep works on an Example-shape board too (wires [from, to] numbered W1…Wn)', () => {
  const example = { parts: LED_BOARD.parts, wires: LED_BOARD.wires.map(w => [w.from, w.to]) };
  const tc = { id: 'T-KEEP-EX', message: 'x', board: example,
               checks: { keep: { parts: { R1: ['b2', 'b6'] }, wires: ['W1', 'W2', 'W3', 'W4'] } } };
  assert.deepStrictEqual(grade(tc, reply([{ tool: 'set_value', part: 'R1', resistance: 1000 }])), { pass: true, failed: [] });
  const got = grade(tc, reply([
    { tool: 'delete_part', part: 'R1' }, { tool: 'place_resistor', holeA: 'b3', holeB: 'b7' },
    { tool: 'delete_wire', wire: 'W1' }, { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63' },
  ]));
  assert.deepStrictEqual({ pass: got.pass, failed: got.failed.sort() }, { pass: false, failed: ['keep.parts.R1', 'keep.wires.W1'] });
});

test('keep sits with the other checks: a moved part and a dark LED are both named', () => {
  const tc = { ...KEEP_CASE, checks: { keep: { parts: { R1: ['b2', 'b6'] } }, expect: { LED1: { on: true } } } };
  const got = grade(tc, reply([{ tool: 'delete_part', part: 'R1' }]));
  assert.deepStrictEqual(got.failed.sort(), ['expect.LED1.on', 'keep.parts.R1']);
});

// ── The three edit cases ────────────────────────────────────────────────────

const caseById = id => CASES.find(c => c.id === id);

function capturedBoard(name) {
  const file = path.join(BOARDS_DIR, name);
  assert.ok(fs.existsSync(file), `missing scripts/ai-eval-boards/${name}: capture it with scripts/capture-board.js`);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(saved.board && Array.isArray(saved.board.parts) && Array.isArray(saved.board.wires), `${name}: no { board: { parts, wires } }`);
  assert.ok(saved.board.wires.every(w => typeof w.id === 'string' && /^W\d+$/.test(w.id)), `${name}: wires without ids; capture App.exportBoard()`);
  assert.ok(typeof saved.markdown === 'string' && saved.markdown.trim(), `${name}: no markdown; capture App.exportMarkdown()`);
  return saved;
}

function editCase(id, file) {
  const c = caseById(id);
  assert.ok(c, `scripts/ai-eval-cases.js has no ${id} case`);
  const saved = capturedBoard(file);
  assert.deepStrictEqual(c.board, saved.board, `${id}: its board is not the one in ${file}`);
  assert.strictEqual(c.markdown, saved.markdown, `${id}: its markdown is not the one in ${file}`);
  assert.ok(c.checks && c.checks.keep, `${id}: no keep check`);
  return { c, board: saved.board };
}

const ofType = (board, type) => board.parts.filter(p => p.type === type);
const one = (board, type) => {
  const list = ofType(board, type);
  assert.equal(list.length, 1, `the captured board should have one ${type}: ${JSON.stringify(board.parts)}`);
  return list[0];
};
const lit = board => {
  const { components, wires } = Board.toSim(board);
  const r = Sim.analyze(components, wires);
  return Object.fromEntries(ofType(board, 'led').map(p => [p.label, !!(r.parts[p.label] && r.parts[p.label].m.on)]));
};

// The board rebuilt from scratch by delete_all, with `change` applied to its
// place actions and its wires added in reverse order, so each id lands on
// other ends. Every hole is the same.
function rebuildWith(board, change = a => a) {
  const all = Board.toActions(board).actions;
  const wires = all.filter(a => a.tool === 'add_wire').reverse();
  const rest  = all.filter(a => a.tool !== 'add_wire' && a.tool !== 'set_control');
  return [...rest.map(change), ...wires, ...all.filter(a => a.tool === 'set_control')];
}

// Two holes in the LED's columns, same half, that nothing uses: where a
// second LED goes in parallel with the first.
function parallelSpot(board, led) {
  const used = new Set();
  for (const p of board.parts) for (const h of p.holes || []) used.add(String(h).toLowerCase());
  for (const w of board.wires) { used.add(String(w.from).toLowerCase()); used.add(String(w.to).toLowerCase()); }
  const [cath, anode] = led.holes.map(h => /^([a-j])(\d+)$/.exec(h));
  const rows = 'abcde'.includes(cath[1]) ? 'abcde' : 'fghij';
  for (const row of rows) {
    const holeA = row + cath[2], holeB = row + anode[2];
    if (!used.has(holeA) && !used.has(holeB)) return { holeA, holeB };
  }
  assert.fail(`no free row in columns ${cath[2]}/${anode[2]} for a parallel LED`);
}

test('the captured boards exist, with wire ids and markdown', () => {
  capturedBoard('one-led.json');
  capturedBoard('backwards-led.json');
});

test('EDIT-fix: turning LED1 round in its holes passes; a rebuild that renumbers the wires fails keep', () => {
  const { c, board } = editCase('EDIT-fix', 'backwards-led.json');
  const led = one(board, 'led');
  assert.deepStrictEqual(Object.values(lit(board)), [false], 'precondition: the captured LED is dark (backwards)');

  const flip = [{ tool: 'delete_part', part: led.label }, { tool: 'place_led', holeA: led.holes[1], holeB: led.holes[0] }];
  const fixed = grade(c, reply(flip, `${led.label} was backwards. I turned it round in the same holes.`));
  assert.deepStrictEqual(fixed, { pass: true, failed: [] }, `the minimal fix fails: ${JSON.stringify(fixed.failed)}`);

  const rebuild = rebuildWith(board, a => (a.tool === 'place_led' ? { ...a, holeA: a.holeB, holeB: a.holeA } : a));
  const got = grade(c, reply(rebuild, 'Rebuilt it with the LED the right way round.'));
  assert.strictEqual(got.pass, false, 'a delete_all rebuild passes EDIT-fix');
  assert.ok(got.failed.some(f => f.startsWith('keep.wires.')), `the rebuild's renumbered wires are not caught: ${JSON.stringify(got.failed)}`);
});

test('EDIT-add-led: one LED placed in parallel passes; a delete_all rebuild with identical holes but new wire ids fails keep.wires', () => {
  const { c, board } = editCase('EDIT-add-led', 'one-led.json');
  const led = one(board, 'led');
  assert.deepStrictEqual(Object.values(lit(board)), [true], 'precondition: the captured LED is lit');

  const add = [{ tool: 'place_led', ...parallelSpot(board, led) }];
  const added = grade(c, reply(add, `Added a second LED in parallel with ${led.label}.`));
  assert.deepStrictEqual(added, { pass: true, failed: [] }, `one parallel LED fails: ${JSON.stringify(added.failed)}`);

  const rebuild = [...rebuildWith(board), ...add];
  const got = grade(c, reply(rebuild, 'Rebuilt it with two LEDs in parallel.'));
  assert.strictEqual(got.pass, false, 'a delete_all rebuild passes EDIT-add-led');
  assert.ok(!got.failed.some(f => f.startsWith('keep.parts.')), `the rebuild keeps every hole: ${JSON.stringify(got.failed)}`);
  assert.ok(got.failed.some(f => f.startsWith('keep.wires.')), `the rebuild's new wire ids are not caught: ${JSON.stringify(got.failed)}`);
});

test('EDIT-resistor-1k: one set_value passes; a rebuild at 1 kΩ fails keep', () => {
  const { c, board } = editCase('EDIT-resistor-1k', 'one-led.json');
  const r = one(board, 'resistor');

  const set = [{ tool: 'set_value', part: r.label, resistance: 1000 }];
  const ok = grade(c, reply(set, `${r.label} is 1 kΩ now.`));
  assert.deepStrictEqual(ok, { pass: true, failed: [] }, `one set_value fails: ${JSON.stringify(ok.failed)}`);

  // The resistor left at its old value is not the edit asked for.
  const unchanged = grade(c, reply([], 'Done.'));
  assert.strictEqual(unchanged.pass, false, 'EDIT-resistor-1k passes a reply that changes nothing');

  const rebuild = rebuildWith(board, a => (a.tool === 'place_resistor' ? { ...a, resistance: 1000 } : a));
  const got = grade(c, reply(rebuild, 'Rebuilt it with a 1 kΩ resistor.'));
  assert.strictEqual(got.pass, false, 'a delete_all rebuild passes EDIT-resistor-1k');
  assert.ok(got.failed.some(f => f.startsWith('keep.')), `the rebuild is not caught by keep: ${JSON.stringify(got.failed)}`);
});

// ── checks.noDeleteAll (#85 review) ─────────────────────────────────────────
// checks.noDeleteAll: true fails, named 'noDeleteAll', when the reply's
// actions contain any delete_all. A rebuild that lands every part and wire
// back under the same ids passes keep, so only this check catches it.

const Recipes = require('./fixtures/recipes.js');

test('noDeleteAll: a reply with a delete_all fails it, named noDeleteAll; one without passes (a non-edit case)', () => {
  const tc = { id: 'T-NODEL', message: 'x', checks: { noDeleteAll: true } };
  assert.deepStrictEqual(grade(tc, reply(Recipes.ONE_LED)), { pass: false, failed: ['noDeleteAll'] });
  // delete_all anywhere counts, not only first.
  assert.deepStrictEqual(grade(tc, reply([...Recipes.ONE_LED.slice(1), { tool: 'delete_all' }])), { pass: false, failed: ['noDeleteAll'] });
  assert.deepStrictEqual(grade(tc, reply(Recipes.ONE_LED.slice(1))), { pass: true, failed: [] });
  // Without the check a delete_all is fine.
  assert.deepStrictEqual(grade({ id: 'T', message: 'x', checks: { parts: { led: 1 } } }, reply(Recipes.ONE_LED)), { pass: true, failed: [] });
});

// The one-LED recipe in its own order (W1 BAT1.0→tp_63, W2 BAT1.1→tn_63,
// W3 tp_3→a2, W4 a8→tn_8), so every kept part and wire id comes back the same.
const SAME_ORDER_REBUILD = {
  'EDIT-fix':         Recipes.ONE_LED,   // the LED the right way round: c8 cathode, c6 anode
  'EDIT-add-led':     [...Recipes.ONE_LED, { tool: 'place_led', holeA: 'd8', holeB: 'd6' }],
  'EDIT-resistor-1k': Recipes.ONE_LED.map(a => (a.tool === 'place_resistor' ? { ...a, resistance: 1000 } : a)),
};

for (const [id, actions] of Object.entries(SAME_ORDER_REBUILD)) {
  test(`${id}: a delete_all rebuild in the recipe's own order (same holes, same wire ids) fails only noDeleteAll`, () => {
    const c = caseById(id);
    assert.ok(c, `scripts/ai-eval-cases.js has no ${id} case`);
    const got = grade(c, reply(actions, 'Rebuilt it.'));
    assert.deepStrictEqual(got, { pass: false, failed: ['noDeleteAll'] },
      `${id}: the same-order rebuild should fail on its delete_all and nothing else: ${JSON.stringify(got)}`);
    assert.strictEqual(c.checks.noDeleteAll, true, `${id}: no checks.noDeleteAll`);
  });
}
