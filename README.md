# Edison

## Setup (5 min)

**Mac**

1. `brew install git node@20 gh`, then install [Claude Code](https://code.claude.com).

**Windows**

1. `winget install Git.Git OpenJS.NodeJS.LTS GitHub.cli`, then install [Claude Code](https://code.claude.com). Claude Code runs its shell through Git Bash (part of Git for Windows), so use the **Git Bash** terminal for every command below.

**Both**

2. `gh auth login`, then `gh auth setup-git`.
3. Clone this repo, then `cd Plugged && npm ci && npx playwright install chromium`.
4. Get `Plugged/backend/.env` from Aarmen. Never commit it.
5. Run `claude` in the repo. **Trust the folder** and **approve the project plugins and MCP servers** when asked.
6. Personal tweaks go in `.claude/settings.local.json` (gitignored), never `.claude/settings.json`.

**Windows only**

- The MCP servers need `cmd /c npx` on Windows. Add them again at local scope, which overrides `.mcp.json` on your machine only. Run these from **PowerShell or cmd, inside the cloned repo** (local scope is saved per project folder, and Git Bash would rewrite `/c` into `C:/`):
  ```
  claude mcp add --scope local context7 -- cmd /c npx -y @upstash/context7-mcp@latest
  claude mcp add --scope local playwright -- cmd /c npx -y @playwright/mcp@latest
  ```
- Cloned before `.gitattributes` landed? Your files may have CRLF line endings, which break the golden tests and hooks. Re-clone, or, with no uncommitted changes (commit or stash first), run `git rm --cached -r . && git reset --hard` once.

## How we work

```
GitHub issue ──/start-task──▶ local branch ──build + verify──▶ /ship (checks) ──▶ push to dev
                                                                                          │
                main (tested, demo-ready) ◀── /promote (CI green + demo walk) ◀───────────┘
```

- **Aarmen decides; Thandi on the physics.** Aarmen writes the code and makes the calls. Anything that rests on circuit physics (a part's model or rating, a simulator rule, an expected reading) goes past Thandi first.
- **Every piece of work is a GitHub issue.** Write one with `/new-task`. Pick one with `/start-task`, or run `/start-task 12` for a specific issue.
- **Your Claude follows the issue.** It touches only the files the issue lists and builds against `docs/API-CONTRACT.md`. If something is unclear, it stops and asks.
- **Finish with `/ship`.** It runs the checks, reviews the diff, and pushes straight to `dev`. No PR and no waiting.
- **Moving to `main` is a quick test.** `/promote`: CI must be green on `dev`, then it walks the demo path in a browser and merges a `dev → main` PR. Do it at the end of each build day, and at sprint checkpoints.
- **Full QA is for checkpoints.** `/qa-pass` runs the real prompts and circuits in `docs/QA.md` about once a day and before submitting, and files what breaks as `bug` issues.
- **`main` is always demo-ready.** `/demo-check` walks the demo story on it.

| Who | Focus |
|---|---|
| Aarmen | All the code: architecture, features, `bug` fixes, `/qa-pass` and `/promote` |
| Thandi | Engineer: circuit design and physical testing; checks the simulator and the expected results in `docs/QA.md` against real parts |

The full rules are in [AGENTS.md](AGENTS.md). The plan and design docs are in [docs/](docs/).

## What's in the harness

| Piece | What it does |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Team rules every agent follows |
| `docs/` | PRD, architecture, API contract, QA script, sprint plan |
| Skills | `/start-task`, `/ship`, `/promote`, `/new-task`, `/adapt-to-tracks`, `/demo-check`, `/qa-pass` |
| Plugins | `superpowers` (planning workflow) and `frontend-design` (polished UI) |
| MCP servers | `context7` (current library docs) and `playwright` (browser testing) |
| Agents | `.claude/agents/`: scout, test-writer, builder, reviewer (run by `/start-task`), qa-tester (run by `/qa-pass`) |
| Hooks | Block `.env` files for every agent; keep test-writer and builder in their lanes; no finishing while `Plugged/` unit tests fail; format on edit; at session start, show your branch, its sync status against `dev`, and your open issues |
| `.github/` | Issue and PR templates, CODEOWNERS for shared files, and CI (lint, unit and browser tests in `Plugged/`) |
