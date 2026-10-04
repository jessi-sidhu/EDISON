# Edison

This is a project project, and we win on the **demo**: a judge must see the core idea work end to end, reliably, in under 3 minutes. Everything below serves that.

## Team
Four people with equal say. Nobody has the final word; decisions follow the two-agree rule below.
- **Aarmen** (`@aarmens702-hub`):
  - Architecture: the docs and contracts, shared with the team, not owned.
  - Fixes the `bug` issues QA files.
  - Tests features as they land on `dev`.
- **Guneev:** QA/QC. He writes very little app code.
  - Owns `docs/QA.md`, the real prompts and circuits with their expected results.
  - Runs `/qa-pass` on `dev` and files what breaks as `bug` issues.
  - Decides when `dev` is ready to promote to `main`.
- **Manav and Armaan:** fast feature sprints from GitHub issues. They merge into `dev` once their checks pass.

If you are an agent working for a teammate: your job is the issue in front of you, nothing more. When the issue is unclear or seems wrong, stop and tell your user to ask the team on the issue. Don't guess at architecture.

## Deciding: any two agree
- A change to anything shared needs the person proposing it **plus one other teammate** approving, on the issue or the PR. Shared means:
  - `docs/API-CONTRACT.md`
  - the architecture
  - a dependency or the lockfile
  - config
  - the schema
  - the root layout
- Anyone can write an issue (`/new-task`) or re-plan at track drop (`/adapt-to-tracks`), but a second teammate has to agree before the result stands.
- If two people disagree, pick the option that keeps the demo path safest and move on. Write the decision under "Key decisions" in `docs/ARCHITECTURE.md` so it isn't re-argued.

## Branches: feature → dev → main
- **`feature` branches** (`<name>/<issue#>-<slug>`) come off `dev`, and their PRs go back into `dev`. The gate is automatic: once `/ship`'s checks and CI pass, the author merges. No one waits on a person.
- **`dev`** is the test branch. Guneev runs `/qa-pass` against it, the way a user would use the app, and files every failure as a `bug` issue. Aarmen works those.
- **`main`** is always demo-ready. To promote, Guneev opens a PR `dev → main` after a clean `/qa-pass`, and one other teammate approves. Nothing else merges to `main`, and `/demo-check` runs against `main`.

## Phases
1. **Build week (pre-event):** Build the real product. The core demo should work end to end on real code, deployed, before the event. Keep modules swappable behind the contracts so they can be reshaped when tracks drop.
2. **Track drop:** Someone runs `/adapt-to-tracks`, a second teammate agrees, and it updates the PRD and plan and re-cuts the issues. Pause feature work until it's done.
3. **Sprint (24h):** Reshape for the chosen track, add sponsor integrations, polish, and rehearse. Work issues in parallel against the `docs/PLAN.md` checkpoints. After the feature freeze, only demo-path bug fixes.

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
1. Start from an issue: `/start-task <number>`. No issue means no work, so ask a teammate to write one or write it yourself with `/new-task`.
2. One issue, one branch off `dev`, one small PR into `dev`. Keep PRs under about 300 changed lines, and split the issue if it's bigger. `/start-task` runs the issue through the specialist agents (see CLAUDE.md).
3. Verify: run the check/test commands. For anything visible, open it in the browser.
4. Finish with `/ship`. It syncs with `dev`, runs the checks, reviews the diff, pushes, and opens a PR into `dev` that closes the issue.

## Boundaries
**Always**
- Stay within the files and folders the issue lists.
- Build against `docs/API-CONTRACT.md`. Use its mock data when the other side isn't ready.
- Pull `dev` before starting and before shipping.

**Get one other teammate to agree first** (comment on the issue, then work on something else while waiting)
- Changing anything shared (see "Deciding").
- Touching a folder someone else is working in (see ARCHITECTURE.md).
- Anything the issue lists as out of scope.

**Never**
- Commit or push to `main` or `dev` directly. Always use a branch and PR. Don't force-push or rewrite history.
- Read, print or commit secrets.
  - Keys live in `.env` files (the app's is `Plugged/backend/.env`), and a person edits them.
  - List each variable's name in `.env.example`.
  - A hook blocks agents from touching `.env` files.
- Merge a PR with failing checks. Fix it, or mark the issue `blocked` and say why.
- Silently change an interface. Propose it on the issue instead.

## Merging
- **Feature PR into `dev`** that touches only your issue's files: merge it yourself (squash) once checks pass.
- **Feature PR into `dev`** that touches shared files: needs one other teammate's approval first.
- **Promotion PR `dev → main`:** opened by Guneev after a clean `/qa-pass`, and needs one other teammate's approval.

## Gotchas
<!-- Add one line each time an agent makes the same mistake twice. Say what to do instead. -->
