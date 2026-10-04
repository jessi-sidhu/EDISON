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
// for the page).
function askDeepSeek(markdown, userMsg, history, ctx, board) {
  const fallback = deepSeekFallbackModel();
  return withDeadline(deepSeekTimeoutMs(), async signal => {
    const run = extra => deepSeekRounds(markdown, userMsg, history, { ...ctx, signal, ...extra }, board);
    if (!fallback || fallback === DEEPSEEK_MODEL) return run({ model: DEEPSEEK_MODEL });
    try {
      return await run({ model: DEEPSEEK_MODEL, ...(thinkingOn(ctx) ? {} : { requestMs: deepSeekPrimaryTimeoutMs() }) });
    } catch (e) {
      if (signal.aborted || !e.canFallBack) throw e;
      console.warn(`[ask] ${DEEPSEEK_MODEL} failed (${e.message.slice(0, 80)}); retrying on ${fallback}`);
    }
    const result = await run({ model: fallback });
    return Object.defineProperty(result, 'fallbackModel', { value: fallback, enumerable: false });
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
      const canRepair = !!ctx.checkBuild && repairs < MAX_REPAIRS && round + 1 < DEEPSEEK_MAX_ROUNDS;
      const problems  = canRepair || (ctx.checkBuild && repairs > 0) ? safeCheck(ctx.checkBuild, actions, board, check) : [];
      if (repairs > 0) console.log(`[repair] after round ${repairs}: ${problems.length ? `${problems.length} problems left` : 'clean'}`);
      if (!canRepair || !problems.length) break;
      repairs++;
      console.log(`[repair] round ${repairs}: ${problems.length} problems`);
      messages.push(assistantTurn(m, ctx));
      const heading = actions.some(a => a && a.tool === 'delete_all') ? REPAIR_HEADING : EDIT_REPAIR_HEADING;
      messages.push({ role: 'user', content: `${heading}\n${problems.map(p => `- ${p}`).join('\n')}` });
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
        const dup = ctx.duplicate ? ctx.duplicate(action, actions, board) : null;   // a wire already there (#85)
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
  return { reply, actions };
}

// A chat turn is resent in full each round, so this bounds the cost of a
// model that never stops calling tools. A 3-LED build is ~16 calls.
const DEEPSEEK_MAX_ROUNDS = 12;
// Repair rounds a build or edit gets when checkBuild finds problems. They
// count toward DEEPSEEK_MAX_ROUNDS.
const MAX_REPAIRS = 2;
const REPAIR_HEADING = 'Your build has problems. Rebuild it with these fixed (delete_all first, then the whole corrected circuit):';
// The heading for an edit (no delete_all so far): fix in place (issue #85).
const EDIT_REPAIR_HEADING = 'Your build has problems. Fix only these, keeping everything else:';
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
