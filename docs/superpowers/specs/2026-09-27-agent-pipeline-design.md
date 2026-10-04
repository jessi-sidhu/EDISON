# Per-task agent pipeline and harness hardening — design

Date: 2026-09-27. Approved in conversation, section by section. The user
then asked for the full build in one go.

## Goal

Every teammate's `/start-task` becomes an orchestrator that runs specialist
subagents, so less-experienced sprinters ship reliable work. The same
change fixes the harness gaps found in the 2026-09-27 audit.

## 1. Specialists (`.claude/agents/`)

| Agent | Job | Tools | Enforced limits | Model |
|---|---|---|---|---|
| scout | Reads the issue, contract and files; returns a change map of ~25 lines or fewer | Read, Grep, Glob | Cannot edit or run commands | haiku |
| test-writer | Turns Done-when into failing tests: Vitest for logic, Playwright for browser-visible items | Read, Grep, Glob, Edit, Write, Bash | A hook blocks writes outside `test/` and `e2e/` | inherit |
| builder | Implements until the tests pass | Read, Grep, Glob, Edit, Write, Bash | A hook blocks edits to `test/` and `e2e/`; it reports a wrong test instead of editing it | inherit |
| reviewer | Fresh-context review of the diff against the issue, the code rules and the out-of-scope list | Read, Grep, Glob, Bash | No Edit/Write | inherit |
| qa-tester | Runs `docs/QA.md` in a real browser for `/qa-pass` | Everything except Edit/Write/NotebookEdit/Bash | Cannot change files | inherit |

The test layers:
- **Vitest (`Plugged/test/`)** covers logic.
- **Playwright (`Plugged/e2e/`)** covers the demo path. It is deterministic: `/api/ask` is stubbed in the browser, and runs are guest-only (no Google sign-in).
- **qa-tester** covers real-AI, judgement-based QA.

## 2. Sizing (decided by `/start-task`, which says which path and why)

- **Full path: scout → test-writer → builder → reviewer.** Used if any of these holds:
  - the issue is labelled `demo-critical` or is on the demo path
  - it changes logic (simulator, chat actions, storage, server) or anything in the contract
  - it creates a new file or module, or touches more than 2 files
  - it is a `bug` issue; the test-writer first reproduces the bug
- **Lean path: builder → reviewer.** Used only if all of these hold:
  - 2 files or fewer
  - only text, style or layout
  - not on the demo path
- **Rules for both paths:**
  - The reviewer always runs.
  - The teammate can upgrade to the full path at any time.
- **Retry limits:**
  - The builder gets 2 attempts to reach green; after that it stops and reports.
  - A review failure gets one fix and one re-review; after that the teammate decides.

## 3. Skills

- **`/start-task`:** the orchestrator. It claims the issue, branches off `dev`, sizes the task, then runs the agents in order, passing each agent the previous agent's output. It ends ready for `/ship`.
- **`/ship`:** runs the checks: `npm run check` (Biome lint), `npm test`, and `npm run e2e` when UI files changed. It runs the reviewer agent unless `/start-task` already reviewed the same diff.
- **`/qa-pass`:** hands the browser run to `qa-tester`. The main session starts and stops the server, files issues, and opens the promotion PR.

## 4. Harness fixes

1. **Secrets.**
   - Deny reads of `**/.env`, `**/.env.local` and `**/.env.*.local`. `.env.example` stays readable.
   - A PreToolUse hook blocks reading, writing or `cat`-ing any `.env` file except `.env.example`. It covers the gap where deny rules miss grep and subprocesses.
2. **CI.** Runs in `Plugged/`: lint, unit tests, and a separate e2e job with Chromium.
3. **Biome, lint only.** The formatter is off, because the codebase relies on hand-aligned columns that a formatter would destroy. `npm run check` runs `biome lint`.
4. **Stop hook.** When Plugged files changed, it runs `npm test` before Claude may finish, and blocks with the failures. It respects `stop_hook_active` so it cannot loop.
5. **`.env.example`** lists every variable, with no values.
6. **AGENTS.md files.**
   - `Plugged/AGENTS.md` is the code guide, per the approved outline, minus the file-by-file map. `Plugged/CLAUDE.md` is `@AGENTS.md`.
   - The root `AGENTS.md` points to it, and its secrets rule names `Plugged/backend/.env`.

## Out of scope
- Cross-laptop orchestration: GitHub remains the shared channel.
- Worktree-isolated builders, since those branch from `main`, not `dev`.
- A team-level sprint conductor.
