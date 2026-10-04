// ─────────────────────────────────────────────────────────────
//  ai-eval.js — the real-AI eval (issue #82). Sends each case in
//  scripts/ai-eval-cases.js to the real AI (DeepSeek) N times, applies the
//  reply's actions to a board in Node, simulates it and grades the readings.
//
//  RUN (from Plugged/, by a person or the orchestrator, never from npm test,
//  e2e or CI; each run costs about a cent):
//    npm run ai-eval                      every case, 3 runs each
//    npm run ai-eval -- --only demo       one case, by id or tag
//    npm run ai-eval -- --only bank       the 16 lab prompts (#202, docs/AI-TEST-SET.md)
//    npm run ai-eval -- --runs 5 --json /tmp/eval.json
//  Exits 1 when a demo-tagged case misses pass^N (every run passing).
//  The model fallback (#130) is off, so the configured model is measured
//  alone; DEEPSEEK_FALLBACK_MODEL=<model> npm run ai-eval turns it on.
//
//  Requiring this file starts nothing and calls nothing: backend/server.js
//  (which loads the key) is required only in the CLI path below.
// ─────────────────────────────────────────────────────────────

const fs   = require('node:fs');
const path = require('node:path');

const Board = require('../circuit3d/js/board-model.js');
const Sim   = require('../circuit3d/js/simulate.js');
const Parts = require('../circuit3d/js/parts');
const GEOMETRY = require('../circuit3d/js/board-geometry.js');

const HEADS_UP = 'Heads up, this build has a problem:';
const FALLBACK = 'Edison could not reach the AI service';

// A wanted value: [lo, hi] is a numeric range, anything else must be equal.
function matches(got, want) {
  if (Array.isArray(want) && want.length === 2 && want.every(n => typeof n === 'number')) {
    return typeof got === 'number' && got >= want[0] && got <= want[1];
  }
  if (typeof want === 'object' && want !== null) return JSON.stringify(got) === JSON.stringify(want);
  return got === want;
}

// A case's starting board: the board-model shape App.exportBoard() gives
// (wires { id, from, to }) as it is, or an Example (wires [from, to],
// numbered W1…Wn in order).
function startBoard(b) {
  if (!b) return Board.empty();
  const wires = b.wires || [];
  if (wires.some(Array.isArray)) return Board.fromExample(b);
  return { parts: b.parts || [], wires: wires.map(w => ({ id: w.id, from: w.from, to: w.to })) };
}

const end = e => String(e).toLowerCase();

// checks.keep (issue #85): each part still there with exactly those holes,
// in order, and each wire id still there with the ends it had at the start.
function checkKeep(board, keep, start, fail) {
  for (const [label, holes] of Object.entries(keep.parts || {})) {
    const p = board.parts.find(q => q.label === label);
    if (!p || JSON.stringify((p.holes || []).map(end)) !== JSON.stringify((holes || []).map(end))) fail('keep.parts.' + label);
  }
  for (const id of keep.wires || []) {
    const was = start.wires.find(w => w.id === id);
    const now = board.wires.find(w => w.id === id);
    if (!was || !now || end(was.from) !== end(now.from) || end(was.to) !== end(now.to)) fail('keep.wires.' + id);
  }
}

// One board's checks (see ai-eval-cases.js), each failure passed to fail().
// `start` is the case's starting board, for checks.keep. `at` ({ t, dt },
// optional): solve one time step at t seconds (a wave source's value then),
// not a plain solve (which reads a wave's offset).
function checkBoard(board, checks, reply, fail, start, at) {
  if (checks.keep) checkKeep(board, checks.keep, start || Board.empty(), fail);
  // An edit, not a rebuild: a delete_all anywhere fails, even one that puts
  // every part and wire back under the same ids (keep can't see that).
  if (checks.noDeleteAll && ((reply && reply.actions) || []).some(a => a && a.tool === 'delete_all')) fail('noDeleteAll');

  if (checks.noHeadsUp && String((reply && reply.reply) || '').includes(HEADS_UP)) fail('noHeadsUp');

  if (checks.parts) {
    for (const [type, n] of Object.entries(checks.parts)) {
      if (!matches(board.parts.filter(p => p.type === type).length, n)) fail('parts.' + type);
    }
  }

  let r = null;
  try {
    const { components, wires } = Board.toSim(board);
    const timed = at && Number.isFinite(at.t);
    r = timed ? Sim.analyze(components, wires, { dt: at.dt || 1e-3, state: {}, t: at.t })
              : Sim.analyze(components, wires);
  } catch {
    fail('simulate');
  }
  const m = label => (r && r.parts && r.parts[label] ? r.parts[label].m : undefined);

  for (const [label, fields] of Object.entries(checks.expect || {})) {
    for (const [field, want] of Object.entries(fields)) {
      const got = m(label);
      if (!got || !matches(got[field], want)) fail(`expect.${label}.${field}`);
    }
  }

  for (const [type, fields] of Object.entries(checks.expectAll || {})) {
    const ofType = board.parts.filter(p => p.type === type);
    for (const [field, want] of Object.entries(fields)) {
      const ok = ofType.length > 0 && ofType.every(p => { const got = m(p.label); return got && matches(got[field], want); });
      if (!ok) fail(`expectAll.${type}.${field}`);
    }
  }

  // A pin's volts vs ground (PartResult r.pins), for a node no part's
  // reading gives: a precision rectifier's output is its diode's cathode.
  for (const [label, pins] of Object.entries(checks.pins || {})) {
    for (const [pin, want] of Object.entries(pins)) {
      const pr = r && r.parts && r.parts[label];
      if (!pr || !matches(pr.r.pins[pin], want)) fail(`pins.${label}.${pin}`);
    }
  }

  if (checks.status) {
    if (!r || r.status !== checks.status) fail('status');
    else if (r.shorted) fail('shorted');
  }
  return r;
}

// ── Lab cases (#202, docs/AI-TEST-SET.md) ──────────────────────
// A case with `lab: { wires }` is graded as a lab bench: every function
// generator is set to 1 Hz before any reading, whatever the AI chose, and
// the built board must pass the wiring checks below. Only the bank cases
// set it, so every other case grades exactly as before and its baseline
// stays comparable.

// A hole's strip, the holes the breadboard itself joins: 'top_5' (a5–e5),
// 'bot_5' (f5–j5) or a whole rail ('tp', 'tn', 'bn', 'bp'); null for
// anything that isn't a hole.
function stripOf(end) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/i.exec(String(end));
  if (!m) return null;
  if (m[3]) return m[3].toLowerCase();
  return ('abcde'.includes(m[1].toLowerCase()) ? 'top_' : 'bot_') + Number(m[2]);
}

// An off-board pin wire end ("PS1.0", "MM1.red") as 'LABEL.<pin index>',
// or null for a hole or a pin no part has.
function terminalOf(end, board) {
  const m = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(end));
  if (!m) return null;
  const part = board.parts.find(p => String(p.label).toLowerCase() === m[1].toLowerCase());
  const def = part && Parts.get(part.type);
  if (!def) return null;
  const k = /^\d+$/.test(m[2]) ? Number(m[2]) : def.pins.indexOf(m[2]);
  return k >= 0 && k < def.pins.length ? `${part.label}.${k}` : null;
}

// Off-board terminals a lab build may leave unwired: a one-rail build uses
// only the bench supply's + and COM.
const OPTIONAL_PINS = { bench_supply: ['neg', 'com2'] };
// The TL072's second op-amp (IN2+, IN2−, OUT2), which may sit unused.
const OPAMP2 = ['in2p', 'in2n', 'out2'];

// The wiring checks on a built board → the names of those it fails:
//   dangling   a wire end in a strip with nothing else in it
//   duplicate  two wires join the same two points (a strip, or an
//              off-board terminal)
//   budget     more wires than lab.wires (the clean build's count) + 2
//   idle       a part leg in a strip with nothing else in it, or an
//              off-board terminal with no wire (bar OPTIONAL_PINS); a
//              TL072's second op-amp may be idle, all three of its legs
//   opamp      a TL072's V+ isn't on a supply's + terminal, or its V−
//              isn't on a supply's − or COM (ground)
// "No short" and "no warning" are the status and noHeadsUp checks.
function wiringProblems(board, lab) {
  const out = [];
  const add = name => { if (!out.includes(name)) out.push(name); };

  // Who sits in each strip: part legs and wire ends.
  const strips = new Map();
  const put = (strip, who) => {
    if (!strip) return;
    if (!strips.has(strip)) strips.set(strip, []);
    strips.get(strip).push(who);
  };
  board.parts.forEach(p => (p.holes || []).forEach((h, k) => put(stripOf(h), { label: p.label, k })));
  board.wires.forEach(w => [w.from, w.to].forEach(e => put(stripOf(e), { wire: w.id })));
  const others = (strip, mine) => (strips.get(strip) || []).filter(who => !mine(who)).length;

  for (const w of board.wires) {
    for (const e of [w.from, w.to]) {
      const s = stripOf(e);
      if (s && !others(s, who => who.wire === w.id)) add('dangling');
    }
  }

  const point = e => stripOf(e) || terminalOf(e, board) || String(e).toLowerCase();
  const pairs = board.wires.map(w => [point(w.from), point(w.to)].sort().join(' ~ '));
  if (new Set(pairs).size !== pairs.length) add('duplicate');

  if (lab && Number.isFinite(lab.wires) && board.wires.length > lab.wires + 2) add('budget');

  const wired = new Set(board.wires.flatMap(w => [terminalOf(w.from, board), terminalOf(w.to, board)]).filter(Boolean));
  for (const p of board.parts) {
    const def = Parts.get(p.type);
    if (!def) continue;
    if (p.holes) {
      const idle = p.holes.map((h, k) => { const s = stripOf(h); return !s || !others(s, who => who.label === p.label && who.k === k); });
      const op2 = p.type === 'tl072' ? OPAMP2.map(pin => def.pins.indexOf(pin)) : [];
      if (op2.length && op2.every(k => idle[k])) op2.forEach(k => { idle[k] = false; });
      if (idle.some(Boolean)) add('idle');
    } else {
      const optional = OPTIONAL_PINS[p.type] || [];
      if (def.pins.some((pin, k) => !optional.includes(pin) && !wired.has(`${p.label}.${k}`))) add('idle');
    }
  }

  if (board.parts.some(p => p.type === 'tl072')) {
    let graph = null;
    try { const { components, wires } = Board.toSim(board); graph = Sim.buildGraph(components, wires); } catch { /* the simulate check fails it */ }
    if (graph) {
      const nodes = (type, pins) => graph.filter(g => g.comp.type === type)
        .flatMap(g => pins.map(pin => g.nodes[Parts.get(type).pins.indexOf(pin)]));
      const plus  = new Set([...nodes('bench_supply', ['pos']), ...nodes('battery', ['0'])]);
      const minus = new Set([...nodes('bench_supply', ['neg', 'com', 'com2']), ...nodes('battery', ['1'])]);
      const pin = (g, name) => g.nodes[Parts.get('tl072').pins.indexOf(name)];
      if (graph.some(g => g.comp.type === 'tl072' && !(plus.has(pin(g, 'vpos')) && minus.has(pin(g, 'vneg'))))) add('opamp');
    }
  }
  return out;
}

// set_value actions putting every function generator on the board at 1 Hz.
const oneHertz = board => board.parts.filter(p => p.type === 'function_generator')
  .map(p => ({ tool: 'set_value', part: p.label, frequency: 1 }));

// A case's `logic` ({ type, mA, none: [state…], one: [state…] }) over its
// graded states, seen[name] = { board, r } → the names it fails: a `none`
// state where any part of `type` carries mA or more, a `one` state where
// not exactly one does, and 'distinct' when two `one` states light the
// same part (#202 case 16: each pair of buttons lights a different LED).
function logicProblems(logic, seen) {
  const lit = name => {
    const s = seen[name];
    if (!s || !s.r || !s.r.parts) return null;
    return s.board.parts.filter(p => p.type === logic.type)
      .filter(p => { const pr = s.r.parts[p.label]; return pr && pr.m && pr.m.current >= logic.mA; })
      .map(p => p.label);
  };
  const out = [];
  for (const name of logic.none || []) { const on = lit(name); if (!on || on.length) out.push(name); }
  const ones = [];
  for (const name of logic.one || []) {
    const on = lit(name);
    if (!on || on.length !== 1) out.push(name);
    else ones.push(on[0]);
  }
  if (new Set(ones).size !== ones.length) out.push('distinct');
  return out;
}

// The case graded against one reply → { pass, failed: [check names] }.
// The reply's actions build one board; the main checks see it plus the
// case's `after`, each state sees it plus the state's own `after`, its
// failures named '<state>.<check>'. A case or state with `t` (and
// optionally `dt`) is solved at that moment of the clock. A lab case adds
// the wiring checks ('wiring.<name>') and its generators run at 1 Hz; a
// case's `logic` is judged across its states ('logic.<state>').
function grade(testCase, reply) {
  const failed = [];
  const failer = prefix => name => { const n = prefix + name; if (!failed.includes(n)) failed.push(n); };

  const start = startBoard(testCase.board);
  const built = Board.apply(start, (reply && reply.actions) || []);
  if (built.errors.length) failer('')('apply');

  let base = built.board;
  if (testCase.lab) {
    for (const name of wiringProblems(built.board, testCase.lab)) failer('')('wiring.' + name);
    base = Board.apply(base, oneHertz(base)).board;
  }

  const gradeState = (after, checks, fail, at) => {
    let board = base;
    if (after && after.length) {
      const then = Board.apply(board, after);
      if (then.errors.length) fail('apply');
      board = then.board;
    }
    return { board, r: checkBoard(board, checks || {}, reply, fail, start, at) };
  };

  gradeState(testCase.after, testCase.checks, failer(''), testCase);
  const seen = {};
  for (const st of testCase.states || []) seen[st.name] = gradeState(st.after, st.checks, failer(st.name + '.'), st);
  if (testCase.logic) for (const name of logicProblems(testCase.logic, seen)) failer('')('logic.' + name);

  return { pass: failed.length === 0, failed };
}

// A thrown error as one printable line: only the part before the first
// ':' ("DeepSeek 401"), never the upstream body, which can echo the key.
function describeError(e) {
  const text = e instanceof Error ? e.message : String(e);
  return text.split(':')[0].trim() || 'unknown error';
}

// One run's outcome: a thrown error or the server's fallback reply is
// 'error' (the AI never answered), else 'pass' or 'fail'.
function outcome(testCase, replyOrError) {
  if (replyOrError instanceof Error || !replyOrError) return 'error';
  if (String(replyOrError.reply || '').startsWith(FALLBACK)) return 'error';
  return grade(testCase, replyOrError).pass ? 'pass' : 'fail';
}

// results: [{ id, tags, outcomes }] → { cases: [{ id, passes, runs, passAll }], exitCode }.
// exitCode is 1 when any demo-tagged case missed a run.
function summarize(results) {
  const cases = results.map(({ id, outcomes }) => {
    const passes = outcomes.filter(o => o === 'pass').length;
    return { id, passes, runs: outcomes.length, passAll: outcomes.length > 0 && passes === outcomes.length };
  });
  const demoMissed = results.some((res, i) => (res.tags || []).includes('demo') && !cases[i].passAll);
  return { cases, exitCode: demoMissed ? 1 : 0 };
}

// argv (after the script name) → { runs, only, json }.
function parseArgs(argv) {
  const out = { runs: 3, only: undefined, json: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--runs needs a whole number of at least 1');
      out.runs = n;
    } else if (a === '--only') {
      out.only = argv[++i];
      if (!out.only) throw new Error('--only needs a case id or tag');
    } else if (a === '--json') {
      out.json = argv[++i];
      if (!out.json) throw new Error('--json needs a file path');
    } else {
      throw new Error(`unknown argument ${JSON.stringify(a)}`);
    }
  }
  return out;
}

// breadboard.js's App.boardTopologyText, loaded with a window shim (the
// file has no Node export; the rest of it only defines functions).
function topologyText() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'circuit3d', 'js', 'breadboard.js'), 'utf8');
  const window = { App: { BOARD_GEOMETRY: GEOMETRY } };
  new Function('window', src)(window);
  return window.App.boardTopologyText();
}

// What App.exportMarkdown sends for a fresh board (no parts, no wires).
function emptyBoardMarkdown() {
  return '**Board status: EMPTY — no components or wires placed yet.**\n\n'
    + '## Components\n_None._\n'
    + '\n## Wires\n_None._\n'
    + '\n## Simulation\n' + Sim.simulationSummary([], [], () => '').join('\n') + '\n'
    + '\n' + topologyText() + '\n';
}

// ── CLI ──────────────────────────────────────────────────────

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`ai-eval: ${e.message}\nusage: npm run ai-eval -- [--runs N] [--only <id|tag>] [--json <file>]`);
    process.exit(2);
  }

  const cases = require('./ai-eval-cases.js')
    .filter(c => !args.only || c.id === args.only || (c.tags || []).includes(args.only));
  if (!cases.length) {
    console.error(`ai-eval: no case has id or tag ${JSON.stringify(args.only)}`);
    process.exit(2);
  }

  // The server reads backend/.env itself and picks the provider on require.
  process.env.AI_PROVIDER = 'deepseek';
  // No fallback unless the shell names one (#130): a pass the fallback
  // model answered isn't a pass for the configured model. Set before the
  // require, so the server's env file can't turn it back on.
  if (process.env.DEEPSEEK_FALLBACK_MODEL === undefined) process.env.DEEPSEEK_FALLBACK_MODEL = '';
  const { ask } = require('../backend/server.js');

  const results = [], raw = [];
  for (const c of cases) {
    const outcomes = [];
    const markdown = c.markdown || emptyBoardMarkdown();
    for (let run = 1; run <= args.runs; run++) {
      let res;
      try {
        // The board the browser would send with the markdown (#84).
        res = await ask(markdown, c.message, [], startBoard(c.board));
      } catch (e) {
        res = e instanceof Error ? e : new Error(String(e));
      }
      const o = outcome(c, res);
      outcomes.push(o);
      const graded = o === 'error' ? null : grade(c, res);
      const why = o === 'pass' ? 'PASS'
        : o === 'fail' ? 'FAIL ' + graded.failed.join(', ')
        : 'ERROR ' + (res instanceof Error ? describeError(res) : res && res.reply);
      const by = res && res.fallbackModel ? ` (answered by ${res.fallbackModel})` : '';
      console.log(`${c.id} run ${run}/${args.runs}: ${why}${by}`);
      raw.push({ id: c.id, run, outcome: o, failed: graded ? graded.failed : null,
                 reply: res instanceof Error ? { error: describeError(res) } : res });
    }
    results.push({ id: c.id, tags: c.tags || [], outcomes });
  }

  const summary = summarize(results);
  const runs = args.runs;
  console.log(`\n${'case'.padEnd(18)} ${'passes'.padEnd(8)} pass^${runs}`);
  for (const s of summary.cases) {
    console.log(`${s.id.padEnd(18)} ${(s.passes + '/' + s.runs).padEnd(8)} ${s.passAll ? '✓' : '✗'}`);
  }
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ runs, summary, raw }, null, 2));
    console.log(`\nReplies and grades written to ${args.json}`);
  }
  process.exit(summary.exitCode);
}

if (require.main === module) main();

module.exports = { grade, startBoard, describeError, outcome, summarize, parseArgs, emptyBoardMarkdown,
                   wiringProblems, logicProblems, stripOf };
