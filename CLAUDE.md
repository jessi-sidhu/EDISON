@AGENTS.md

## Claude Code specifics
- **A GitHub issue is an approved design.** Working an issue counts as bounded work: skip brainstorming and spec writing, restate the plan in 3 to 5 bullets, then implement. Use brainstorming and writing-plans only for architecture and planning work; ask Thandi first when a plan rests on circuit physics.
- **Project skills:**
  - `/start-task`: begin an issue.
  - `/ship`: finish it. Runs the checks, then pushes straight to `dev`.
  - `/promote`: quick test of `dev` (CI green plus a walk of the demo path), then move it to `main`.
  - `/new-task`: write an issue.
  - `/adapt-to-tracks`: re-plan when tracks drop.
  - `/demo-check`: walk the demo on `main` in a browser.
- **QA:** `/qa-pass` is the full `docs/QA.md` run against `dev` in a real browser, at checkpoints (about daily, and before submitting). It files failures as `bug` issues.
- **`/start-task` is an orchestrator.** It sizes the issue, then runs the specialists in `.claude/agents/`:
  - **Full path** (logic, contract, demo path, bugs, more than 2 files): scout → test-writer → builder → reviewer.
  - **Lean path** (at most 2 files of text or style): builder → reviewer.
- **The specialists' limits are enforced, not trusted:**
  - scout, reviewer and qa-tester can't edit files.
  - A hook keeps the test-writer inside `test/` and `e2e/`, and keeps the builder out of them.
- **Other hooks:**
  - `.env` files are blocked for every agent.
  - Claude can't finish while `Plugged/` unit tests fail.
- Verify UI changes in a real browser (Claude in Chrome, or the Playwright MCP) before saying they work. Check the console for errors.
- Look up library APIs with context7 instead of relying on memory.
- Running several agents in parallel on one machine: give each its own git worktree, **inside the repo** at `.worktrees/<issue#>` (e.g. `git worktree add .worktrees/14 -b aarmen/14-slug origin/dev`). `.worktrees/` is git-ignored. Never create worktrees, copies or scratch files next to the repo or on the Desktop; temporary files go in your scratchpad or `/tmp`.
