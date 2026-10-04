// ─────────────────────────────────────────────────────────────
//  ai-providers.js — pluggable backends for /api/ask
//
//  Selected with the AI_PROVIDER env var:
//
//    gemini   (default)  the real Google API. Needs GEMINI_API_KEY.
//    claude              runs the local Claude Code CLI headlessly.
//                        No API key, no quota. ~10-60s per call.
//    fixture             replays a recorded response from disk.
//                        Instant and deterministic, for tests.
//
//  Every provider returns the same { reply, actions } shape that
//  askGemini already returned, so nothing downstream changes.
//
//  Recording fixtures:
//    AI_PROVIDER=claude RECORD_FIXTURES=1 node server.js
//  ...then replay them forever with AI_PROVIDER=fixture, no key needed.
// ─────────────────────────────────────────────────────────────

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Board = require('../circuit3d/js/board-model.js');

const FIXTURE_DIR = path.join(__dirname, '..', 'test', 'fixtures', 'ask');
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 120000);

// ── Fixture key ──────────────────────────────────────────────
// Same request must always map to the same file. History is included
// because a follow-up turn is a different request.
function fixtureKey(markdown, userMsg, history) {
  const norm = JSON.stringify({
    markdown: markdown || '',
    userMsg: userMsg || '',
    history: (history || []).map(h => ({ role: h.role, text: h.text })),
  });
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

// ── Tool description, derived from CIRCUIT_TOOLS ─────────────
// Built from the real schema rather than hand-copied, so it cannot
// drift the way the duplicated prompt in circuit3d/index.html did.
function describeTools(circuitTools) {
  const decls = (circuitTools && circuitTools[0] && circuitTools[0].function_declarations) || [];
  return decls.map(d => {
    const props = (d.parameters && d.parameters.properties) || {};
    const names = Object.keys(props);
    const sig = names.length ? `{${names.join(', ')}}` : '{}';
    return `- ${d.name}${sig}: ${d.description || ''}`;
  }).join('\n');
}

function claudeSystemPrompt(systemPrompt, circuitTools) {
  return [
    systemPrompt,
    '',
    'AVAILABLE TOOLS:',
    describeTools(circuitTools),
    '',
    'OUTPUT FORMAT — this is strict:',
    'Reply with a single JSON object and nothing else. No prose outside it, no markdown fence.',
    '{"reply": "<one or two sentences for the user>", "actions": [{"tool": "<tool name>", ...args}]}',
    'If the user asked a question rather than requesting a build, return an empty actions array.',
  ].join('\n');
}

// ── Claude Code provider ─────────────────────────────────────
function askClaude(markdown, userMsg, history, ctx) {
  const msg = userMsg || 'Analyze my circuit and tell me what to do next.';
  const boardState = markdown || '**Board is EMPTY — no components or wires placed.**';

  const priorTurns = (history || [])
    .filter(h => h && h.text)
    .map(h => `${h.role === 'model' ? 'Assistant' : 'User'}: ${h.text}`)
    .join('\n');

  const prompt = [
    priorTurns ? `CONVERSATION SO FAR:\n${priorTurns}\n` : '',
    `BOARD STATE:\n${boardState}`,
    '',
    `QUESTION: ${msg}`,
  ].join('\n');

  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', prompt,
       '--append-system-prompt', claudeSystemPrompt(ctx.SYSTEM_PROMPT, ctx.CIRCUIT_TOOLS),
       '--model', CLAUDE_MODEL],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error(`claude CLI failed: ${err.message}${stderr ? ` | ${stderr.trim()}` : ''}`));
        }
        try {
          resolve(parseAgentJSON(stdout));
        } catch (e) {
          reject(new Error(`claude CLI returned unparseable output: ${e.message}`));
        }
      }
    );
    // The CLI waits ~3s for piped stdin otherwise, and prints a warning
    // into stdout that breaks JSON parsing.
    child.stdin.end();
  });
}

// ── DeepSeek provider ────────────────────────────────────────
// OpenAI-compatible chat completions with native tool calls. Thinking mode
// is on by default (#205, issue #4): it took the AI test set from 11/48 to
// 24/48. It is slower, bills reasoning tokens and ignores temperature;
// DEEPSEEK_THINKING=0 switches it off (deepSeekRequest).
const DEEPSEEK_URL   = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

// Gemini's schema uses upper-case type names ("OBJECT", "STRING").
function lowerTypes(schema) {
  if (Array.isArray(schema)) return schema.map(lowerTypes);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerTypes(v);
  }
  return out;
}

// CIRCUIT_TOOLS (Gemini function_declarations) -> OpenAI "tools".
function toOpenAITools(circuitTools) {
  const decls = (circuitTools && circuitTools[0] && circuitTools[0].function_declarations) || [];
  return decls.map(d => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description || '',
      parameters: d.parameters ? lowerTypes(d.parameters) : { type: 'object', properties: {} },
    },
  }));
}

// One overall deadline for a whole DeepSeek ask (issue #129): every tool-loop
// and repair round shares it. Read per ask so a test can set it. 240 s by
// default (issue #4): a build with reasoning took up to 195 s.
const deepSeekTimeoutMs = () => Number(process.env.DEEPSEEK_TIMEOUT_MS) || 240000;

// Runs run(signal) against one deadline of `ms`. Past it, the signal aborts
// every request still open and this rejects with code AI_TIMEOUT, even if
// run is between requests. Several calls inside one run (a fallback model,
// #130) share the same deadline.
function withDeadline(ms, run) {
  const controller = new AbortController();
  const error = Object.assign(new Error(`The AI took longer than ${ms} ms`), { code: 'AI_TIMEOUT' });
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { reject(error); controller.abort(error); }, ms);
  });
  return Promise.race([run(controller.signal), expired]).finally(() => clearTimeout(timer));
}

// The fallback model (#130): unset means deepseek-v4-pro, '' turns it off.
// Read per ask, like the timeouts, so a test can change them.
function deepSeekFallbackModel() {
  const v = process.env.DEEPSEEK_FALLBACK_MODEL;
  return v === undefined ? 'deepseek-v4-pro' : v.trim();
}
// How long ONE primary-model request may take before the ask switches,
// with reasoning off only (issue #4, askDeepSeek).
const deepSeekPrimaryTimeoutMs = () => Number(process.env.DEEPSEEK_PRIMARY_TIMEOUT_MS) || 25000;

// One ask under one overall deadline. While a fallback model is set, a 5xx
// or a network error restarts the whole ask once on the fallback with the
// same opening messages, keeping nothing from the primary's rounds. With
// reasoning off (DEEPSEEK_THINKING=0, or explain mode) each primary request
// also gets deepSeekPrimaryTimeoutMs, and running past it switches too; with
// reasoning on (issue #4: a build took 8–195 s) running long never switches.
// A 4xx never falls back. The fallback gets only the time left. A reply from
// the fallback carries a non-enumerable `fallbackModel` (kept out of the JSON
// for the page). Past the deadline, the best build the current run ended its
// turn on (issue #7) is the reply; with none, AI_TIMEOUT.
function askDeepSeek(markdown, userMsg, history, ctx, board) {
  const fallback = deepSeekFallbackModel();
  const fromFallback = r => Object.defineProperty(r, 'fallbackModel', { value: fallback, enumerable: false });
  // The current run's checked builds (issue #7): the fallback's restart gets
  // a new list, keeping nothing from the primary's rounds.
  let attempts = [], onFallback = false;
  return withDeadline(deepSeekTimeoutMs(), async signal => {
    const run = extra => deepSeekRounds(markdown, userMsg, history, { ...ctx, signal, ...extra, attempts: (attempts = []) }, board);
    if (!fallback || fallback === DEEPSEEK_MODEL) return run({ model: DEEPSEEK_MODEL });
    try {
      return await run({ model: DEEPSEEK_MODEL, ...(thinkingOn(ctx) ? {} : { requestMs: deepSeekPrimaryTimeoutMs() }) });
    } catch (e) {
      if (signal.aborted || !e.canFallBack) throw e;
      console.warn(`[ask] ${DEEPSEEK_MODEL} failed (${e.message.slice(0, 80)}); retrying on ${fallback}`);
    }
    onFallback = true;
    return fromFallback(await run({ model: fallback }));
  }).catch(e => {
    const kept = e && e.code === 'AI_TIMEOUT' ? keptAttempt(attempts, 'deadline: kept') : null;
    if (!kept) throw e;
    return onFallback ? fromFallback(kept) : kept;
  });
}

async function deepSeekRounds(markdown, userMsg, history, ctx, board) {
  const msg = userMsg || 'Analyze my circuit and tell me what to do next.';
  const boardState = markdown || '**Board is EMPTY — no components or wires placed.**';

  // The server picks this request's tools and the prompt that goes with
  // them. Without that hook, every tool and the one prompt are sent.
  let decls = ctx.toolsFor ? ctx.toolsFor(markdown || '', userMsg || '')
    : ((ctx.CIRCUIT_TOOLS && ctx.CIRCUIT_TOOLS[0] && ctx.CIRCUIT_TOOLS[0].function_declarations) || []);
  const system = ctx.promptFor ? ctx.promptFor(decls) : ctx.SYSTEM_PROMPT;
  console.log(ctx.explain ? '[ask] explain: no tools' : `[ask] tools: ${decls.map(d => d.name).join(', ')}`);

  const messages = [{ role: 'system', content: system }];
  for (const h of history || []) {
    if (h && h.text) messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text });
  }
  messages.push({ role: 'user', content: `BOARD STATE:\n${boardState}\n\nQUESTION: ${msg}${ctx.explain ? `\n\n${EXPLAIN_NOTE}` : ''}` });

  // Explain mode (issue #169): one request with no tools offered, so the
  // answer is text only. A tool call the model makes anyway is ignored.
  if (ctx.explain) {
    const m = await deepSeekTurn(messages, null, ctx);
    const names = ((ctx.CIRCUIT_TOOLS && ctx.CIRCUIT_TOOLS[0] && ctx.CIRCUIT_TOOLS[0].function_declarations) || []).map(d => d.name);
    return { reply: stripToolMarkup(m.content, names) || EXPLAIN_FALLBACK, actions: [] };
  }

  // DeepSeek calls a few tools per turn and waits for their results before
  // calling more, so keep answering until it stops calling tools. The tools
  // only queue actions for the browser preview; nothing runs here. use_parts
  // adds tools for the next round, and a placement the server refuses is
  // answered with the reason so the model can place it again.
  let tools = toOpenAITools([{ function_declarations: decls }]);
  const actions = [];
  let reply = '';
  let repairs = 0;
  // Each build the model ended its turn on, checked (issue #6): its actions
  // with the wire fixes folded in, its reply, its problem count, the repairs
  // sent before it, and whether its board has a part (#7). The best one is
  // returned. askDeepSeek passes the list in, to answer with it at the deadline.
  const attempts = ctx.attempts || [];
  // "Fix it." is judged on the whole board after the edit, not only on the
  // problems the edit adds (issue #85).
  const check = { fullCheck: isFixRequest(userMsg) };
  for (let round = 0; round < DEEPSEEK_MAX_ROUNDS; round++) {
    const m = await deepSeekTurn(messages, tools, ctx);
    if (String(m.content || '').trim()) reply = String(m.content).trim();
    const calls = (m.tool_calls || []).filter(c => c && c.function && c.function.name);
    if (!calls.length) {
      // The model ended its turn. A build or edit the server finds problems
      // in goes back to it with those problems, at most MAX_REPAIRS times,
      // and only while a round is left for the answer.
      if (!ctx.checkBuild) break;
      const build    = foldWireFixes(actions, board);
      const problems = safeCheck(ctx.checkBuild, build, board, check);
      attempts.push({ build, reply, problems: problems.length, round: repairs, hasParts: leavesParts(build, board) });
      if (repairs > 0) console.log(`[repair] after round ${repairs}: ${problems.length ? `${problems.length} problems left` : 'clean'}`);
      if (!problems.length || repairs >= MAX_REPAIRS || round + 1 >= DEEPSEEK_MAX_ROUNDS) break;
      repairs++;
      console.log(`[repair] round ${repairs}: ${problems.length} problems`);
      messages.push(assistantTurn(m, ctx));
      messages.push({ role: 'user', content: repairMessage(problems, actions, board) });
      continue;
    }

    messages.push(assistantTurn(m, ctx, { tool_calls: calls }));
    for (const c of calls) {
      // The model can emit invalid JSON arguments; drop that call, keep the rest.
      let args = null;
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* reported below */ }
      let result;
      if (!args || typeof args !== 'object') {
        result = 'Rejected: the arguments were not valid JSON.';
      } else if (c.function.name === 'use_parts' && ctx.partTools) {
        const { added, text } = ctx.partTools(args.types, decls.map(d => d.name));
        if (added.length) {
          decls = decls.concat(added);
          tools = toOpenAITools([{ function_declarations: decls }]);
          console.log(`[ask] use_parts added: ${added.map(d => d.name).join(', ')}`);
        }
        result = text;
      } else {
        const action = { tool: c.function.name, ...args };
        // A wire already there (#85); one this build added and then deleted is not (#6).
        const dup = ctx.duplicate ? ctx.duplicate(action, foldWireFixes(actions, board), board) : null;
        const why = dup ? null : ctx.refusal ? ctx.refusal(action, actions, board) : null;
        if (dup) result = `Refused: ${dup}`;
        else if (why) result = `Refused: ${why} Nothing was queued; fix it and place it again.`;
        else {
          actions.push(action);
          result = 'Done. Queued for the user to preview.';
        }
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: result });
    }
  }
  // The best checked build (#6), so a repair that made things worse, or one
  // the round cap cut off, is never sent. With none checked, as before.
  return keptAttempt(attempts) || { reply, actions };
}

// The attempt with the fewest problems, a tie going to the later one, as
// { reply, actions }, logged as "[repair] <why> round N: K problems"; null
// when there are none. An empty build (no part on its board, #7: the checker
// calls delete_all alone clean) never beats one with parts.
function keptAttempt(attempts, why = 'kept') {
  if (!attempts.length) return null;
  const pool = attempts.some(a => a.hasParts) ? attempts.filter(a => a.hasParts) : attempts;
  const best = pool.reduce((b, a) => (a.problems <= b.problems ? a : b));
  console.log(`[repair] ${why} round ${best.round}: ${best.problems} problems`);
  return { reply: best.reply, actions: best.build };
}

// A board-model board as the browser sends it (issue #84).
const isBoard = b => !!b && Array.isArray(b.parts) && Array.isArray(b.wires);

// Whether the board a build leaves has a part (#7): a rebuild from its last
// delete_all, an edit on the sent board. True if the board can't be read, so
// that build is judged on its problems alone, as before.
function leavesParts(actions, board) {
  const rebuild = lastBuild(actions);
  try {
    return Board.apply(rebuild || !isBoard(board) ? Board.empty() : board, rebuild || actions).board.parts.length > 0;
  } catch {
    return true;
  }
}

// The actions from the last delete_all on, or null without one.
function lastBuild(actions) {
  let i = -1;
  actions.forEach((a, k) => { if (a && a.tool === 'delete_all') i = k; });
  return i < 0 ? null : actions.slice(i);
}

// The actions with their wire fixes folded in (#6): a delete_wire of a wire
// an earlier add_wire here made is dropped with that add_wire, so the checker
// (which ignores delete_wire) and the page's preview see the board the steps
// leave. A delete_wire of a wire on the sent board is an edit, kept. Wire ids
// are Board.apply's, on the sent board. Always a new array; the actions as
// they are if the board can't be read.
function foldWireFixes(actions, board) {
  if (!actions.some(a => a && a.tool === 'delete_wire')) return actions.slice();
  try {
    let now = isBoard(board) ? board : Board.empty();
    const madeBy = new Map();   // a live wire's id → the index of the add_wire that made it
    const drop = new Set();
    actions.forEach((a, i) => {
      const tool = a && a.tool;
      if (tool === 'delete_wire' && madeBy.has(a.wire)) drop.add(madeBy.get(a.wire)).add(i);
      const had = new Set(now.wires.map(w => w.id));
      now = Board.apply(now, [a]).board;
      const live = new Set(now.wires.map(w => w.id));
      for (const id of madeBy.keys()) if (!live.has(id)) madeBy.delete(id);
      if (tool === 'add_wire') for (const id of live) if (!had.has(id)) madeBy.set(id, i);
    });
    return actions.filter((_, i) => !drop.has(i));
  } catch {
    return actions.slice();
  }
}

// The repair message (#6). A build is asked for fixes: its problems, its
// wires with the ids delete_wire takes (as Board.apply numbers them: a
// rebuild from its last delete_all, an edit on the sent board), and the fix
// tools. A rebuild with nothing powered, or with a part to turn or move
// (decision 2: its checker can't see a delete_part), gets the rebuild
// message instead.
function repairMessage(problems, actions, board) {
  const list = problems.map(p => `- ${p}`).join('\n');
  const rebuild = lastBuild(actions);
  if (rebuild && problems.some(p => UNPOWERED.test(p) || movesAPart(p))) return `${REPAIR_HEADING}\n${list}`;
  let wires = [];
  try {
    wires = Board.apply(rebuild || !isBoard(board) ? Board.empty() : board, rebuild || actions).board.wires;
  } catch { /* a board that can't be read: no wires listed */ }
  const table = wires.length ? ['| id | from | to |', ...wires.map(w => `| ${w.id} | ${w.from} | ${w.to} |`)] : ['None.'];
  return [EDIT_REPAIR_HEADING, list, '', 'Its wires now:', ...table, '', FIX_TOOLS].join('\n');
}

// A chat turn is resent in full each round, so this bounds the cost of a
// model that never stops calling tools. A 3-LED build is ~16 calls.
const DEEPSEEK_MAX_ROUNDS = 12;
// Repair rounds a build or edit gets when checkBuild finds problems. They
// count toward DEEPSEEK_MAX_ROUNDS.
const MAX_REPAIRS = 2;
// A checker problem only a part turned or moved fixes (#6, decision 2): a
// backwards part, no forward path, a part not placed, or a stacked hole
// whose leads include no wire.
function movesAPart(p) {
  if (PART_MOVE.test(p)) return true;
  const stacked = STACKED_HOLE.exec(p);
  return !!stacked && !/\bwires?\b/.test(stacked[1]);
}

// The heading for a rebuild with nothing powered or a part to move (#6): not fixed in place.
const REPAIR_HEADING = 'Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):';
// The heading for every other build or edit: fix in place (issues #85, #6).
const EDIT_REPAIR_HEADING = 'Your build has problems. Fix only these, keeping everything else:';
// The fix message's last line (#6), after the build's wires.
const FIX_TOOLS = 'Fix them with delete_wire (by the id above), add_wire and set_value steps.';
// A checker problem that says a supply powers nothing: a battery's + or a
// bench supply not wired to a rail.
const UNPOWERED = /not wired to a .*rail.*nothing on the board is powered/;
// The checker's part-level wording, and its stacked-hole sentence with the
// leads it names: "Hole b10 holds 2 leads (2 LEDs)".
const PART_MOVE    = /backwards|Swap holeA|forward path|not placed/i;
const STACKED_HOLE = /^Hole \S+ holds \d+ leads \(([^)]*)\)/;
// An explain ask whose answer has no text (issue #169).
const EXPLAIN_FALLBACK = "I couldn't explain that just now.";
// Added to an explain ask's user message (not the system prompt, #169): with
// no tools offered, deepseek-flash still wrote edits as text and named
// problems the simulator didn't find.
const EXPLAIN_NOTE = 'Answer only from the Simulation section above: name each problem, its part and holes, and how to fix it by hand on the real board. '
  + 'Its list of problems is complete: if it lists any, that is everything wrong, so suggest no other wiring changes, extra jumpers or moves; '
  + 'if it lists none, say the simulator found nothing wrong and what to check by hand. '
  + 'Claim nothing the Simulation section does not say. You cannot change the board in this answer, so write no tool calls.';

// An explain reply's text with any tool calls the model wrote as text taken
// out (#169): DeepSeek's DSML blocks (to their end, or the reply's) and tags
// named after a tool, like <delete_wire id="W3" />.
const DSML_BLOCK = /<[｜|]+\s*DSML\s*[｜|]+\s*\w*calls>[\s\S]*?(?:<\/[｜|]+\s*DSML\s*[｜|]+\s*\w*calls>|$)/g;
function stripToolMarkup(text, toolNames) {
  let out = String(text || '').replace(DSML_BLOCK, '');
  const names = (toolNames || []).filter(n => /^\w+$/.test(n));
  if (names.length) out = out.replace(new RegExp(`<\\/?(?:${names.join('|')})\\b[^>]*>`, 'g'), '');
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

// checkBuild's problems, or none if it throws: a broken check never costs a round.
function safeCheck(checkBuild, actions, board, opts) {
  try {
    const problems = checkBuild(actions, board, opts);
    return Array.isArray(problems) ? problems : [];
  } catch (e) {
    console.warn('[repair] check failed:', e.message);
    return [];
  }
}

// A "fix it" / "repair it" message: its edit is checked against the whole
// board after it (checkBuild's fullCheck), in the repair loop and the Heads up.
function isFixRequest(userMsg) {
  return /\b(fix|repair)\b/i.test(String(userMsg || ''));
}

// One request to DeepSeek. Returns the assistant message. With ctx.requestMs
// the request gets its own signal, aborted past that time or with ctx.signal.
// An error the fallback model may answer (#130: this request's timeout, a
// 5xx, a network error) is marked canFallBack.
async function deepSeekTurn(messages, tools, ctx) {
  let signal = ctx.signal, timer = null, timedOut = false, unlink = () => {};
  if (ctx.requestMs) {
    const request = new AbortController();
    const follow = () => request.abort(ctx.signal.reason);
    if (ctx.signal) {
      if (ctx.signal.aborted) follow();
      ctx.signal.addEventListener('abort', follow, { once: true });
      unlink = () => ctx.signal.removeEventListener('abort', follow);
    }
    timer = setTimeout(() => { timedOut = true; request.abort(); }, ctx.requestMs);
    signal = request.signal;
  }
  try {
    return await deepSeekRequest(messages, tools, ctx, signal);
  } catch (e) {
    const overall = ctx.signal && ctx.signal.aborted;
    if (timedOut && !overall) {
      throw Object.assign(new Error(`DeepSeek ${ctx.model || DEEPSEEK_MODEL} took longer than ${ctx.requestMs} ms`), { canFallBack: true });
    }
    if (!overall && (e instanceof TypeError || e.status >= 500)) e.canFallBack = true;
    throw e;
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

// Thinking mode (#205), read per request so the eval or a test can set it:
// on by default (issue #4), so the model reasons before it answers;
// DEEPSEEK_THINKING=0 (or off, false) sends the old non-thinking request.
// Unset or blank counts as on. Explain mode (#169) never thinks.
const thinkingOn = ctx => !ctx.explain && !/^(0|off|false)$/i.test(String(process.env.DEEPSEEK_THINKING || '').trim());

// The assistant message the loop sends back: in thinking mode DeepSeek needs
// each one's reasoning_content in every later request of the same ask.
const assistantTurn = (m, ctx, extra = {}) => ({
  role: 'assistant', content: m.content || '', ...extra,
  ...(thinkingOn(ctx) && m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}),
});

async function deepSeekRequest(messages, tools, ctx, signal) {
  const think  = thinkingOn(ctx);
  const effort = process.env.DEEPSEEK_REASONING_EFFORT;
  const res = await (ctx.fetch || fetch)(DEEPSEEK_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.apiKey || process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ctx.model || DEEPSEEK_MODEL,
      messages,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),   // none in explain mode (#169): both keys left out
      thinking: { type: think ? 'enabled' : 'disabled' },
      // Thinking mode ignores temperature; an explain answer (#169) as steady as it can be.
      ...(think ? (effort ? { reasoning_effort: effort } : {}) : { temperature: ctx.explain ? 0 : 0.3 }),
      max_tokens: think ? (Number(process.env.DEEPSEEK_MAX_TOKENS) || 32000) : 2048,   // 16000 ran out mid-reasoning (issue #4)
    }),
  });

  if (!res.ok) {
    const hint = res.status === 402 ? ' (balance is empty: top up at https://platform.deepseek.com/top_up)' : '';
    throw Object.assign(new Error(`DeepSeek ${res.status}${hint}: ${await res.text()}`), { status: res.status });
  }

  const data = await res.json();
  const choice = (data.choices && data.choices[0]) || {};
  // A reply cut off at max_tokens (in thinking mode, often all reasoning and
  // no tool calls yet) would otherwise look like an empty build (#205).
  if (choice.finish_reason === 'length') console.warn(`[ask] DeepSeek stopped at max_tokens (${think ? 'thinking on' : 'thinking off'}): the reply is cut off`);
  return choice.message || {};
}

// ── Shared parser ────────────────────────────────────────────
function parseAgentJSON(raw) {
  let text = String(raw || '').trim();

  // Strip a markdown fence if the model added one anyway.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // Tolerate leading noise (CLI warnings) by starting at the first brace.
  const start = text.search(/[[{]/);
  if (start > 0) text = text.slice(start);

  const parsed = JSON.parse(text);

  // Accept either the object form or a bare action array.
  const rawActions = Array.isArray(parsed) ? parsed : (parsed.actions || []);
  const actions = rawActions.map(a => {
    if (a.tool) return a;                                   // already our shape
    const { name, args, ...rest } = a;                      // {name, args} shape
    return { tool: name, ...(args || {}), ...rest };
  }).filter(a => a.tool);

  let reply = Array.isArray(parsed) ? '' : (parsed.reply || '');
  if (!reply) {
    reply = actions.length
      ? "Here you go! I've built the circuit for you. Hit Run Simulation to test it out!"
      : '(no response)';
  }
  return { reply: String(reply).trim(), actions };
}

// ── Fixture provider ─────────────────────────────────────────
function fixturePath(key) {
  return path.join(FIXTURE_DIR, `${key}.json`);
}

async function askFixture(markdown, userMsg, history) {
  const key = fixturePath(fixtureKey(markdown, userMsg, history));
  if (!fs.existsSync(key)) {
    throw new Error(
      `No fixture for this request (${path.basename(key)}). ` +
      'Record one with AI_PROVIDER=claude RECORD_FIXTURES=1, or AI_PROVIDER=gemini RECORD_FIXTURES=1.'
    );
  }
  const saved = JSON.parse(fs.readFileSync(key, 'utf8'));
  return { reply: saved.reply, actions: saved.actions || [] };
}

function recordFixture(markdown, userMsg, history, result, provider) {
  try {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const key = fixtureKey(markdown, userMsg, history);
    fs.writeFileSync(fixturePath(key), JSON.stringify({
      recorded_by: provider,
      request: { markdown: markdown || '', userMsg: userMsg || '', history: history || [] },
      reply: result.reply,
      actions: result.actions,
    }, null, 2));
    console.log(`[fixture] recorded ${key}.json via ${provider}`);
  } catch (e) {
    console.warn('[fixture] could not record:', e.message);
  }
}

// ── Dispatcher ───────────────────────────────────────────────
// askGemini is injected so this module does not need the key or the
// fetch logic, which keeps the existing code path untouched.
function makeAsk(askGemini, ctx) {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

  // `board` (issue #84) is the browser's board, optional: the DeepSeek and
  // Gemini paths check an edit against it. `opts.explain` (issue #169): an
  // answer only, so DeepSeek is offered no tools and nothing is queued. The
  // other providers ignore it.
  return async function ask(markdown, userMsg, history, board, opts = {}) {
    if (provider === 'fixture') {
      return askFixture(markdown, userMsg, history);
    }

    // DeepSeek logs the tools it picks per request; the others send every tool.
    if (provider !== 'deepseek') {
      const all = (ctx.CIRCUIT_TOOLS && ctx.CIRCUIT_TOOLS[0] && ctx.CIRCUIT_TOOLS[0].function_declarations) || [];
      console.log(`[ask] tools: ${all.map(d => d.name).join(', ')}`);
    }

    let result;
    if (provider === 'claude') {
      result = await askClaude(markdown, userMsg, history, ctx);
    } else if (provider === 'deepseek') {
      // Same clean-up and circuit checks the Gemini path applies itself; an
      // explain answer has no actions to clean up or check.
      const explain = !!(opts && opts.explain);
      const finish = explain ? (r => ({ reply: r.reply, actions: [] })) : (ctx.finish || (r => r));
      const raw = await askDeepSeek(markdown, userMsg, history, explain ? { ...ctx, explain } : ctx, board);
      result = finish({ ...raw, board, fullCheck: isFixRequest(userMsg) });
      // Which model answered, for the server log only (not enumerable, so not sent).
      if (raw.fallbackModel) Object.defineProperty(result, 'fallbackModel', { value: raw.fallbackModel, enumerable: false });
    } else {
      result = await askGemini(markdown, userMsg, history, board);
    }

    if (process.env.RECORD_FIXTURES === '1') {
      recordFixture(markdown, userMsg, history, result, provider);
    }
    return result;
  };
}

module.exports = { makeAsk, isFixRequest, parseAgentJSON, fixtureKey, describeTools, toOpenAITools, askDeepSeek, withDeadline, DEEPSEEK_MAX_ROUNDS };
