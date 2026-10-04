// ─────────────────────────────────────────────────────────────
//  ai-eval.js — the real-AI eval (issue #82). Sends each case in
//  scripts/ai-eval-cases.js to the real AI (DeepSeek) N times, applies the
//  reply's actions to a board in Node, simulates it and grades the readings.
//
//  RUN (from Plugged/, by a person or the orchestrator, never from npm test,
//  e2e or CI; each run costs about a cent):
//    npm run ai-eval                      every case, 3 runs each
//    npm run ai-eval -- --only demo       one case, by id or tag
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
      if (board.parts.filter(p => p.type === type).length !== n) fail('parts.' + type);
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

  if (checks.status) {
    if (!r || r.status !== checks.status) fail('status');
    else if (r.shorted) fail('shorted');
  }
}

// The case graded against one reply → { pass, failed: [check names] }.
// The reply's actions build one board; the main checks see it plus the
// case's `after`, each state sees it plus the state's own `after`, its
// failures named '<state>.<check>'. A case or state with `t` (and
// optionally `dt`) is solved at that moment of the clock.
function grade(testCase, reply) {
  const failed = [];
  const failer = prefix => name => { const n = prefix + name; if (!failed.includes(n)) failed.push(n); };

  const start = startBoard(testCase.board);
  const built = Board.apply(start, (reply && reply.actions) || []);
  if (built.errors.length) failer('')('apply');

  const gradeState = (after, checks, fail, at) => {
    let board = built.board;
    if (after && after.length) {
      const then = Board.apply(board, after);
      if (then.errors.length) fail('apply');
      board = then.board;
    }
    checkBoard(board, checks || {}, reply, fail, start, at);
  };

  gradeState(testCase.after, testCase.checks, failer(''), testCase);
  for (const st of testCase.states || []) gradeState(st.after, st.checks, failer(st.name + '.'), st);

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

module.exports = { grade, startBoard, describeError, outcome, summarize, parseArgs, emptyBoardMarkdown };
