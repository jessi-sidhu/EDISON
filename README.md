# Edison

## Setup (5 min)

1. Install [Claude Code](https://code.claude.com) and the GitHub CLI (`brew install gh`). Then run `gh auth login` and `gh auth setup-git`.
2. Clone this repo and run `claude` inside it. **Trust the folder** and **approve the project plugins and MCP servers** when asked.
3. Personal tweaks go in `.claude/settings.local.json` (gitignored), never `.claude/settings.json`.

## How we work

```
GitHub issue ──/start-task──▶ branch off dev ──build + verify──▶ /ship ──▶ PR into dev (checks) ──▶ merge
                                                                                          │
                              main (always demo-ready) ◀── PR dev → main ◀── /qa-pass ────┘
```

- **Everyone has an equal say.** A change to anything shared (the API contract, architecture, dependencies, config) needs the proposer plus one other teammate agreeing.
- **Every piece of work is a GitHub issue.** Anyone can write one with `/new-task`. Pick one with `/start-task`, or run `/start-task 12` for a specific issue.
- **Your Claude follows the issue.** It touches only the files the issue lists and builds against `docs/API-CONTRACT.md`. If something is unclear, comment on the issue and ask the team.
- **Finish with `/ship`.** It syncs with `dev`, runs the checks, reviews the diff, and opens a PR into `dev` that closes the issue. If the PR only touches your own files and the checks pass, merge it yourself. Shared files need one other teammate's approval.
- **QA happens on `dev`.** Guneev runs `/qa-pass`, which works through the real prompts and circuits in `docs/QA.md` in a browser and files what breaks as `bug` issues for Aarmen. When a pass comes back clean, he opens a `dev → main` PR and one other teammate approves it.
- **`main` is always demo-ready.** `/demo-check` walks the demo story on it.

| Who | Focus |
|---|---|
| Aarmen | Architecture (shared), fixing `bug` issues, testing features as they land on `dev` |
| Guneev | QA/QC: owns `docs/QA.md` and `/qa-pass`, and decides when `dev` is promoted to `main` |
| Manav, Armaan | Fast feature sprints, merging into `dev` on green checks |

The full rules are in [AGENTS.md](AGENTS.md). The plan and design docs are in [docs/](docs/).

## What's in the harness

| Piece | What it does |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Team rules every agent follows |
| `docs/` | PRD, architecture, API contract, QA script, sprint plan |
| Skills | `/start-task`, `/ship`, `/new-task`, `/adapt-to-tracks`, `/demo-check`, `/qa-pass` |
| Plugins | `superpowers` (planning workflow) and `frontend-design` (polished UI) |
| MCP servers | `context7` (current library docs) and `playwright` (browser testing) |
| Agents | `.claude/agents/`: scout, test-writer, builder, reviewer (run by `/start-task`), qa-tester (run by `/qa-pass`) |
| Hooks | Block `.env` files for every agent; keep test-writer and builder in their lanes; no finishing while `Plugged/` unit tests fail; format on edit; at session start, show your branch, its sync status against `dev`, and your open issues |
| `.github/` | Issue and PR templates, CODEOWNERS for shared files, and CI (lint, unit and browser tests in `Plugged/`) |
