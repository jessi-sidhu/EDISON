// ─────────────────────────────────────────────────────────────
//  photo-eval.js — the real-photo eval (issue #175). Drives the real page
//  with Playwright for each labelled breadboard photo: choose the file,
//  pick the column count, tap the 4 corners, Looks right, wait for the
//  confirm screen and then for its crop round to place the legs (#173: the
//  screen opens on the box round's placeholders), then score the confirm
//  screen's live Reading against the hand-labelled truth by node (a body
//  hole's column + half, a-e or f-j; a rail; off).
//
//  RUN (from Plugged/, by a person or the orchestrator, never from npm test,
//  e2e or CI: each photo costs ~13 live Gemini calls):
//    npm run photo-eval                          the eval set, 1 run each
//    npm run photo-eval -- --only e01,e04        ids or id prefixes
//    npm run photo-eval -- --set all --runs 3 --out /tmp/photo-eval.json
//    npm run photo-eval -- --port 5001           reuse a running server
//    npm run photo-eval -- --shots <dir>         save the tap, confirm and placed screens
//  Sets: eval (test/fixtures/photo/eval/), web (test/fixtures/photo/web/:
//  the spike's 6 photos; their rail ends are converted to app rail names,
//  their corners fitted from the labelled taps), all.
//  Without --port it starts `node backend/server.js` on a free port with
//  this shell's environment (the server reads its own key file as usual).
//
//  Requiring this file starts nothing: only the CLI path below does.
// ─────────────────────────────────────────────────────────────

const fs   = require('node:fs');
const os   = require('node:os');
const net  = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PhotoGrid = require('../circuit3d/js/photo-grid.js');

const ROOT     = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test/fixtures/photo');
const SCORED   = ['resistor', 'led'];
const CONFIRM_TIMEOUT_MS = 180000;   // page: 60 s box round, plus slack
const PLACED_TIMEOUT_MS  = 70000;    // after the confirm screen: the page's 45 s crop round, plus slack
const MIN_GAP_MS = 11000;            // the server allows 6 photos a minute per IP

// ── Truth ──────────────────────────────────────────────────

// A hole → its node: '14:a-e' / '14:f-j', 'rail:aOuter', 'off'; null when
// it says nothing about the circuit ('?', 'gap', missing).
function nodeOf(hole) {
  const s = String(hole == null ? '' : hole).trim();
  let m = /^([a-j])(\d+)$/i.exec(s);
  if (m) return `${Number(m[2])}:${'abcde'.includes(m[1].toLowerCase()) ? 'a-e' : 'f-j'}`;
  m = /^rail:(aOuter|aInner|jInner|jOuter):\d+$/.exec(s);
  if (m) return `rail:${m[1]}`;
  return s === 'off' ? 'off' : null;
}

// The web set's photos.json rails ({ 'j:+': -3, … }: each sign's offset in
// pitches, j-on-top frame) → the strip of each side+sign, by the PhotoGrid
// snap rule (under 3.4 pitches from its side's body row is inner). Sides it
// doesn't list keep BB830's (outer +, inner −). Same rule as
// test/photo-import-truth.test.js.
function webRails(photo) {
  const strips = { 'a:+': 'aOuter', 'a:-': 'aInner', 'j:+': 'jInner', 'j:-': 'jOuter' };
  const signs  = { aOuter: '?', aInner: '?', jInner: '?', jOuter: '?' };
  for (const [key, v] of Object.entries(photo.rails || {})) {
    const side = key[0];
    const dist = side === 'a' ? v - 11 : -v;
    strips[key] = side + (dist < 3.4 ? 'Inner' : 'Outer');
    signs[strips[key]] = key[2];
  }
  return { strips, signs };
}

function webHole(h, strips) {
  if (h == null || !String(h).trim()) return null;
  const m = /^rail:([aj]):([+-]):(\d+)$/.exec(String(h).trim());
  return m ? `rail:${strips[m[1] + ':' + m[2]]}:${m[3]}` : String(h).trim();
}

// The web set's photos.json: ≥ 4 labelled holes → the 4 corners, fitted.
function webCorners(photo) {
  const g = PhotoGrid.homography(photo.taps, photo.ncols);
  const n = photo.ncols, taps = {};
  for (const h of ['a1', 'a' + n, 'j' + n, 'j1']) taps[h] = g.toPhoto(g.holeCentre(h)).map(v => Math.round(v * 10) / 10);
  return taps;
}

// One set's photos → [{ set, id, file, cols, width, height, taps, truth }].
function loadSet(set) {
  const dir    = path.join(FIXTURES, set);
  const photos = JSON.parse(fs.readFileSync(path.join(dir, 'photos.json'), 'utf8'));
  const truth  = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
  return Object.entries(photos).map(([id, p]) => {
    if (set !== 'web') return { set, id, file: path.join(dir, p.file), cols: p.cols, width: p.width, height: p.height, taps: p.taps, truth: truth[id] };
    const { strips, signs } = webRails(p);
    const t = truth[id];
    const fix = e => Object.assign({}, e, { hole: webHole(e.hole, strips) });
    return {
      set, id, file: path.join(dir, p.file), cols: p.ncols, width: p.width, height: p.height, taps: webCorners(p),
      truth: { notes: t.notes, rails: signs,
               parts: t.parts.map(q => Object.assign({}, q, { leads: (q.leads || []).map(fix) })),
               wires: (t.wires || []).map(w => Object.assign({}, w, { ends: w.ends.map(fix) })) },
    };
  });
}

// ── Scoring ────────────────────────────────────────────────

// How many of `want` (nodes, nulls skipped) `got` covers, each got node used once.
function shared(want, got) {
  const pool = got.slice();
  let n = 0;
  for (const w of want) {
    const i = w == null ? -1 : pool.indexOf(w);
    if (i >= 0) { n++; pool.splice(i, 1); }
  }
  return n;
}

// truth items and predicted items (each { type, nodes }) → pairs: the pairs
// sharing the most nodes first; a truth item with no known node takes a
// leftover prediction of its type (found, nothing to score).
function pair(truth, pred) {
  const cand = [];
  truth.forEach((t, i) => pred.forEach((p, j) => {
    const s = t.type === p.type ? shared(t.nodes, p.nodes) : 0;
    if (s > 0) cand.push({ i, j, s });
  }));
  cand.sort((x, y) => y.s - x.s || x.i - y.i || x.j - y.j);
  const tOf = new Map(), pUsed = new Set();
  for (const c of cand) if (!tOf.has(c.i) && !pUsed.has(c.j)) { tOf.set(c.i, c); pUsed.add(c.j); }
  truth.forEach((t, i) => {
    if (tOf.has(i) || t.nodes.some(Boolean)) return;
    const j = pred.findIndex((p, k) => !pUsed.has(k) && p.type === t.type);
    if (j >= 0) { tOf.set(i, { i, j, s: 0 }); pUsed.add(j); }
  });
  return { pairs: [...tOf.values()], invented: pred.filter((_, j) => !pUsed.has(j)) };
}

// truth (truth.json entry) + got (the page's snapped Reading) → the scores.
function score(truth, got) {
  const tParts = truth.parts.filter(p => SCORED.includes(p.type))
    .map(p => ({ type: p.type, nodes: p.leads.map(l => nodeOf(l.hole)), roles: p.leads.map(l => l.pin) }));
  const pParts = got.parts.filter(p => SCORED.includes(p.type))
    .map(p => ({ type: p.type, nodes: p.leads.map(l => nodeOf(l.hole)), roles: p.leads.map(l => l.role) }));
  const tWires = truth.wires.map(w => ({ type: 'wire', nodes: w.ends.map(e => nodeOf(e.hole)) }));
  const pWires = got.wires.map(w => ({ type: 'wire', nodes: w.ends.map(e => nodeOf(e.hole)) }));

  const parts = pair(tParts, pParts), wires = pair(tWires, pWires);
  const right = (t, p, pr) => pr.reduce((n, c) => n + shared(t[c.i].nodes, p[c.j].nodes), 0);
  const known = items => items.reduce((n, t) => n + t.nodes.filter(Boolean).length, 0);

  // LED polarity, where the truth knows it: the anode's node.
  let polRight = 0, polKnown = 0;
  for (const c of parts.pairs) {
    const t = tParts[c.i], p = pParts[c.j];
    const ti = t.roles.indexOf('anode');
    if (t.type !== 'led' || ti < 0 || !t.nodes[ti]) continue;
    polKnown++;
    const pi = p.roles.indexOf('anode');
    if (pi >= 0 && p.nodes[pi] === t.nodes[ti]) polRight++;
  }
  let railRight = 0, railKnown = 0;
  for (const [k, v] of Object.entries(truth.rails || {})) {
    if (v !== '+' && v !== '-') continue;
    railKnown++;
    if (got.rails && got.rails[k] === v) railRight++;
  }
  return {
    parts:    { truth: tParts.length, found: parts.pairs.length, invented: parts.invented.length },
    legs:     { right: right(tParts, pParts, parts.pairs), total: known(tParts) },
    wires:    { truth: tWires.length, found: wires.pairs.length, invented: wires.invented.length },
    ends:     { right: right(tWires, pWires, wires.pairs), total: known(tWires) },
    polarity: { right: polRight, known: polKnown },
    rails:    { right: railRight, known: railKnown },
    other:    got.parts.filter(p => !SCORED.includes(p.type)).length,
  };
}

// ── CLI ────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { set: 'eval', runs: 1, only: null, out: null, port: null, shots: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--set') { out.set = v; i++; if (!['eval', 'web', 'all'].includes(v)) throw new Error('--set is eval, web or all'); }
    else if (a === '--runs') { out.runs = Number(v); i++; if (!Number.isInteger(out.runs) || out.runs < 1) throw new Error('--runs needs a whole number of at least 1'); }
    else if (a === '--only') { out.only = String(v || '').split(',').filter(Boolean); i++; if (!out.only.length) throw new Error('--only needs ids'); }
    else if (a === '--out') { out.out = v; i++; if (!v) throw new Error('--out needs a file'); }
    else if (a === '--port') { out.port = Number(v); i++; if (!Number.isInteger(out.port)) throw new Error('--port needs a port number'); }
    else if (a === '--shots') { out.shots = v; i++; if (!v) throw new Error('--shots needs a folder'); }
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startServer(log) {
  const port  = await freePort();
  const child = spawn(process.execPath, ['backend/server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port) }) });
  const take  = buf => String(buf).split('\n').filter(Boolean).forEach(line => log.push({ t: Date.now(), line }));
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return { port, child }; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('the server did not start: ' + log.map(l => l.line).join(' | '));
}

// One /api/photo or /api/photo/leads response → n: its status, seconds to
// the last byte, provider, model, code, items. The crop round streams NDJSON
// (#173): a line per item, then { done, provider, model, ms }.
async function readNet(r, n) {
  n.status = r.status();
  let text = null;
  try { text = await r.text(); } catch { /* aborted: no body */ }
  n.s = (Date.now() - (n.start || Date.now())) / 1000;
  try {
    let d;
    if (/x-ndjson/i.test(r.headers()['content-type'] || '')) {
      const lines = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      d = Object.assign({ items: lines.filter(o => o.done !== true) }, lines.find(o => o.done === true));
    } else d = JSON.parse(text);
    Object.assign(n, { provider: d.provider, model: d.model });
    if (Array.isArray(d.items)) n.items = { n: d.items.length, timeout: d.items.filter(x => x.error === 'AI_TIMEOUT').length, failed: d.items.filter(x => x.error === 'AI_FAILED').length };
    if (d.code) n.code = d.code;
  } catch { /* not JSON */ }
}

// One photo through the page → { ms, placedMs, outcome, net, got }: ms to the
// confirm screen, placedMs to the crop round's end (its last leg placed).
async function runPhoto(browser, base, photo, shots, tag) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const net = {}, errors = [], reads = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { const k = /\/api\/photo(\/leads)?$/.exec(r.url()); if (k) net[k[0]] = { start: Date.now() }; });
  page.on('response', r => {
    const k = /\/api\/photo(\/leads)?$/.exec(r.url());
    if (k) reads.push(readNet(r, net[k[0]] || (net[k[0]] = {})));
  });
  try {
    await page.goto(base + '/circuit3d/index.html');
    await page.setInputFiles('#photo-file', photo.file);
    await page.waitForSelector('#photo-corners:not([hidden])');
    await page.selectOption('#photo-cols', String(photo.cols));
    const box = await page.locator('#photo-canvas').boundingBox();
    for (const h of ['a1', 'a' + photo.cols, 'j' + photo.cols, 'j1']) {
      const [x, y] = photo.taps[h];
      const cx = box.x + x * box.width / photo.width, cy = box.y + y * box.height / photo.height;
      // A corner off the photo can't be tapped by hand: the click event goes to the canvas directly.
      if (x >= 0 && y >= 0 && x <= photo.width && y <= photo.height) await page.mouse.click(cx, cy);
      else await page.dispatchEvent('#photo-canvas', 'click', { clientX: cx, clientY: cy });
    }
    if (shots) await page.screenshot({ path: path.join(shots, `${tag}-taps.png`) });
    if (await page.isDisabled('#photo-ok')) return { ms: null, outcome: 'BAD_TAPS', net, errors };
    const t0 = Date.now();
    await page.click('#photo-ok');
    await page.waitForFunction(() => !document.getElementById('photo-confirm').hidden || !document.getElementById('photo-error-sample').hidden,
      null, { timeout: CONFIRM_TIMEOUT_MS });
    const ms = Date.now() - t0;
    if (shots) await page.screenshot({ path: path.join(shots, `${tag}-confirm.png`) });
    if (await page.isHidden('#photo-confirm')) return { ms, placedMs: null, outcome: 'ERROR: ' + (await page.textContent('#photo-status')), net, errors };
    // The crop round (#173): over when no id is still placing and no "Placing legs N/M…" shows.
    let placedMs = null, outcome = 'ok';
    try {
      await page.waitForFunction(() => {
        const C = window.PhotoConfirm;
        return !(C && C.placing && C.placing.size) && !document.getElementById('photo-confirm').innerText.includes('Placing legs');
      }, null, { timeout: PLACED_TIMEOUT_MS, polling: 100 });
      placedMs = Date.now() - t0;
    } catch (err) {
      if (err.name !== 'TimeoutError') throw err;
      const left = await page.evaluate(() => window.PhotoConfirm.placing.size).catch(() => '?');
      outcome = `PLACED_TIMEOUT: ${left} still placing after ${PLACED_TIMEOUT_MS / 1000}s`;
    }
    await Promise.race([Promise.allSettled(reads), new Promise(r => setTimeout(r, 5000))]);   // the leads stream's last line
    if (shots) await page.screenshot({ path: path.join(shots, `${tag}-placed.png`) });
    const got = await page.evaluate(() => {
      const g = window.PhotoCapture.grid, R = window.PhotoConfirm.reading;
      const hole = e => (e.hole === '?' || e.hole === 'gap' || !e.hole) && Array.isArray(e.pt) ? g.snap(e.pt).hole : e.hole;
      return {
        rails: R.board && R.board.rails,
        parts: R.parts.map(p => ({ id: p.id, type: p.type, value: p.value, color: p.color, leads: p.leads.map(l => ({ hole: hole(l), role: l.role })) })),
        wires: R.wires.map(w => ({ id: w.id, color: w.color, ends: w.ends.map(e => ({ hole: hole(e) })) })),
      };
    });
    return { ms, placedMs, outcome, net, errors, got };
  } catch (err) {
    return { ms: null, placedMs: null, outcome: 'ERROR: ' + err.message.split('\n')[0], net, errors };
  } finally {
    await page.close();
  }
}

const frac = (a, b) => `${a}/${b}`;
const secs = ms => (ms == null ? '-' : (ms / 1000).toFixed(1));

function row(r) {
  const s = r.score, p = r.net['/api/photo'] || {}, l = r.net['/api/photo/leads'] || {};
  const leads = l.items ? `${(l.s || 0).toFixed(1)}s ${l.items.n - l.items.timeout - l.items.failed}/${l.items.n}${l.items.timeout ? ` t${l.items.timeout}` : ''}${l.items.failed ? ` f${l.items.failed}` : ''}` : (l.status ? String(l.status) : '-');
  return [r.id + (r.run > 1 ? `#${r.run}` : ''), secs(r.ms), secs(r.placedMs), p.status ? `${p.status} ${p.provider || p.code || ''} ${(p.s || 0).toFixed(1)}s` : '-', leads,
          s ? frac(s.parts.found, s.parts.truth) : '-', s ? frac(s.legs.right, s.legs.total) : '-',
          s ? frac(s.wires.found, s.wires.truth) : '-', s ? frac(s.ends.right, s.ends.total) : '-',
          s ? String(s.parts.invented + s.wires.invented) : '-', r.outcome === 'ok' ? '' : r.outcome];
}

function table(rows) {
  const head = ['photo', 'confirm s', 'placed s', '/api/photo', 'leads', 'parts', 'legs', 'wires', 'ends', 'invented', 'failure'];
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map(r => String(r[i]).length)));
  return all.map(r => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd()).join('\n');
}

function totals(results) {
  const ok = results.filter(r => r.score);
  const sum = (k, f) => ok.reduce((n, r) => n + r.score[k][f], 0);
  const spread = k => {
    const times = results.map(r => r[k]).filter(v => v != null).sort((a, b) => a - b);
    return times.length ? [Math.round(times[Math.floor((times.length - 1) / 2)] / 100) / 10, Math.round(times[times.length - 1] / 100) / 10] : [null, null];
  };
  const [medianS, maxS] = spread('ms'), [placedMedianS, placedMaxS] = spread('placedMs');
  return {
    photos: results.length, failures: results.length - ok.length,
    placedTimeouts: results.filter(r => r.outcome.startsWith('PLACED_TIMEOUT')).length,
    medianS, maxS, placedMedianS, placedMaxS,
    parts: { found: sum('parts', 'found'), truth: sum('parts', 'truth') }, legs: { right: sum('legs', 'right'), total: sum('legs', 'total') },
    wires: { found: sum('wires', 'found'), truth: sum('wires', 'truth') }, ends: { right: sum('ends', 'right'), total: sum('ends', 'total') },
    invented: ok.reduce((n, r) => n + r.score.parts.invented + r.score.wires.invented, 0),
    polarity: { right: sum('polarity', 'right'), known: sum('polarity', 'known') }, rails: { right: sum('rails', 'right'), known: sum('rails', 'known') },
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`photo-eval: ${e.message}\nusage: npm run photo-eval -- [--set eval|web|all] [--only <ids>] [--runs N] [--out <file>] [--port N] [--shots <dir>]`);
    process.exit(2);
  }
  if (process.platform === 'darwin') { try { os.setPriority(15); } catch { /* normal priority */ } }

  let photos = (args.set === 'all' ? ['eval', 'web'] : [args.set]).flatMap(loadSet);
  if (args.only) photos = photos.filter(p => args.only.some(o => p.id === o || p.id.startsWith(o)));
  if (!photos.length) { console.error('photo-eval: no photo matches --only'); process.exit(2); }
  if (args.shots) fs.mkdirSync(args.shots, { recursive: true });

  const log = [];
  const server = args.port ? { port: args.port, child: null } : await startServer(log);
  // Never leave our server running: a throw, a process.exit (Playwright's own
  // Ctrl-C handler) or a stop signal takes it down with us.
  process.on('exit', () => server.child && server.child.kill());
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { if (server.child) server.child.kill(sig); process.exit(128 + os.constants.signals[sig]); });
  }
  const results = [];
  let browser = null, last = 0;
  console.log(table([]));
  try {
    const { chromium } = require('@playwright/test');
    browser = await chromium.launch();
    for (let run = 1; run <= args.runs; run++) {
      for (const photo of photos) {
        const wait = last + MIN_GAP_MS - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        last = Date.now();
        const from = Date.now();
        const tag = `${photo.id}${args.runs > 1 ? `-r${run}` : ''}`;
        const r = await runPhoto(browser, `http://localhost:${server.port}`, photo, args.shots, tag);
        const lines = log.filter(l => l.t >= from && /^\[photo(-leads)?\]/.test(l.line)).map(l => l.line);
        const res = Object.assign({ set: photo.set, id: photo.id, run, log: lines }, r, r.got ? { score: score(photo.truth, r.got) } : {});
        results.push(res);
        console.log(table([row(res)]).split('\n')[1]);
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server.child) server.child.kill();
  }

  const t = totals(results);
  console.log('\n' + table(results.map(row)));
  console.log(`\n${t.photos} runs, ${t.failures} failed${t.placedTimeouts ? `, ${t.placedTimeouts} placing timed out` : ''} · ` +
    `confirm screen median ${t.medianS}s, max ${t.maxS}s · legs placed median ${t.placedMedianS}s, max ${t.placedMaxS}s · ` +
    `parts ${t.parts.found}/${t.parts.truth} · legs ${t.legs.right}/${t.legs.total} · wires ${t.wires.found}/${t.wires.truth} · ` +
    `ends ${t.ends.right}/${t.ends.total} · invented ${t.invented} · LED polarity ${t.polarity.right}/${t.polarity.known} · rail signs ${t.rails.right}/${t.rails.known}`);
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), args, totals: t, results }, null, 1));
    console.log(`wrote ${args.out}`);
  }
}

module.exports = { nodeOf, shared, pair, score, webRails, webHole, webCorners, loadSet, parseArgs };

if (require.main === module) main();
