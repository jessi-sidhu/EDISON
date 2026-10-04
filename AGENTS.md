# Edison

This is a project project, and we win on the **demo**: a judge must see the core idea work end to end, reliably, in under 3 minutes. Everything below serves that.

## Team
Two people.
- **Aarmen** (`@aarmens702-hub`): writes all the code.
  - Architecture, the docs and the contracts.
  - Works every issue, fixes the `bug` issues, and runs `/qa-pass` and `/promote`.
- **Thandi:** engineer. Circuit design and physical testing.
  - Designs circuits and checks them on real parts.
  - Says whether the simulator's numbers and the AI's builds are physically right.
  - Owns the expected results in `docs/QA.md`: the circuits, and the numbers a real board gives.

If you are an agent: your job is the issue in front of you, nothing more. When the issue is unclear or seems wrong, stop and tell Aarmen. Don't guess at architecture.

## Deciding: Aarmen decides, Thandi on the physics
- **Aarmen decides** code, architecture, the contract, dependencies, config and the plan. Say what changed in the commit; no sign-off needed.
- **Ask Thandi first** when a change rests on circuit physics:
  - a new part's model or its ratings
  - a simulator rule
  - what counts as a mistake in a circuit
  - an expected value in `docs/QA.md`
  - a lab circuit
- Write big calls under "Key decisions" in `docs/ARCHITECTURE.md` so they aren't re-argued.

## Branches: dev is the workspace, main is tested
- **`dev`** is the workspace.
  - Work on a local branch off `dev` (`/start-task` makes one).
  - `/ship` runs the checks, rebases onto the latest `dev`, and pushes straight to `dev`. No PR, and no waiting on a person.
  - CI runs on every push to `dev`. If it goes red, whoever broke it fixes it first.
- **`main`** is tested and demo-ready.
  - `/promote`: CI green on `dev`, then a quick walk of the demo path in a browser, then a `dev → main` PR merged by whoever runs it.
  - Promote at natural points: the end of each build day, sprint checkpoints, and before judging.
  - Nothing reaches `main` any other way.
- **`/qa-pass`** is the full QA script with real AI prompts. It's for checkpoints (about once a day, and before submitting), not every promotion. It files `bug` issues.

## Phases
1. **Build week (pre-event):** Build the real product. The core demo should work end to end on real code, deployed, before the event. Keep modules swappable behind the contracts so they can be reshaped when tracks drop.
2. **Track drop:** Aarmen runs `/adapt-to-tracks` (with Thandi on any circuit questions), and it updates the PRD and plan and re-cuts the issues. Pause feature work until it's done.
3. **Sprint (24h):** Reshape for the chosen track, add sponsor integrations, polish, and rehearse. Work issues against the `docs/PLAN.md` checkpoints. After the feature freeze, only demo-path bug fixes.

## Commands
The app is `Plugged/`. Its commands, code rules and gotchas are in `Plugged/AGENTS.md`, which Claude loads automatically when working there. The main ones, run from `Plugged/`:
- `npm run check`: lint
- `npm test`: unit tests
- `npm run e2e`: browser tests
- `cd backend && node server.js`: run the app

## Docs (read the one you need, when you need it)
- `docs/PRD.md`: what we're building and the demo story. Read before any user-facing work.
- `docs/ARCHITECTURE.md`: modules, data flow, and **who works in which folder**. Read before creating a new file or folder.
- `docs/API-CONTRACT.md`: the interfaces and data shapes between modules. **Read before writing code that calls, or is called by, another module.** Build against it exactly, and use its mock data until the real side exists.
- `docs/QA.md`: the test cases `/qa-pass` runs, with the expected result of each.
- `docs/PLAN.md`: sprint timeline and checkpoints.
- `Plugged/AGENTS.md`: how to work on the app's code. Read it before editing anything in `Plugged/`.

## Task loop (every task)
1. Start from an issue: `/start-task <number>`. No issue means no work, so write one with `/new-task`.
2. One issue, one local branch off `dev`, one small change. Keep it under about 300 changed lines, and split the issue if it's bigger. `/start-task` runs the issue through the specialist agents (see CLAUDE.md).
3. Verify: run the check/test commands. For anything visible, open it in the browser.
4. Finish with `/ship`. It runs the checks, rebases onto `dev`, pushes to `dev`, and closes the issue.

## Boundaries
**Always**
- Stay within the files and folders the issue lists.
- Build against `docs/API-CONTRACT.md`. Use its mock data when the other side isn't ready.
- Pull `dev` before starting and before shipping.

**Ask first**
- Thandi, on anything that rests on circuit physics (see "Deciding").
- Aarmen, on anything the issue lists as out of scope.

**Never**
- Push to `main` directly. It only changes through `/promote`.
- Push to `dev` without passing the checks. Use `/ship`.
- Force-push or rewrite history on `dev` or `main`.
- Read, print or commit secrets.
  - Keys live in `.env` files (the app's is `Plugged/backend/.env`), and a person edits them.
  - List each variable's name in `.env.example`.
  - A hook blocks agents from touching `.env` files.
- Leave `dev` red. Fix it, revert your push, or mark the issue `blocked` and say why.
- Silently change an interface. Propose it on the issue instead.

## Merging
- **Into `dev`:** `/ship` pushes once lint, unit tests and (for UI changes) browser tests pass.
- **Into `main`:** only `/promote`. It merges its own PR once `dev` is green and the demo path works.

## Gotchas
<!-- Add one line each time an agent makes the same mistake twice. Say what to do instead. -->
- **The AI prompt is guarded by golden files** (`Plugged/test/fixtures/prompts/`). Adding a part or editing a prompt line can change what the demo's LED request sends. If the golden test fails, look at the diff first. Only if the change is intended, run `UPDATE_GOLDEN=1 npm test`, then do the real-AI demo check (3 runs) before `/ship`.
