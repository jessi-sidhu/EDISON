# Plugged: code guide

This file covers how to work on the app's code. The team process (roles, branches, merging) is in `../AGENTS.md`.

Plugged is a browser 3D breadboard editor with a circuit simulator and an AI tutor that builds circuits, plus Firebase sign-in, a saved-circuit dashboard and a shared gallery ("Sparks"). The demo path is: build or open a circuit, simulate it, and ask the AI to build or fix one, then accept its preview.

## Commands (run from `Plugged/`)
| Do | Command |
|---|---|
| Install (for tests and lint only) | `npm install` |
| Run the app | `cd backend && node server.js`, then open http://localhost:5001 |
| Lint | `npm run check` (Biome; lint only, warnings fail) |
| Unit tests | `npm test` (Vitest; no key, no browser) |
| Browser tests | `npm run e2e` (Playwright; starts its own server on :5090) |
| Run with no AI cost | `AI_PROVIDER=fixture node server.js` (replays recorded answers only) |

## How a request flows
```
board → App.exportMarkdown() → POST /api/ask → ai-providers (DeepSeek / Gemini / claude / fixture)
→ finishAIReply() drops bad actions and flags circuit problems → chat.js shows a preview
→ Accept → Chat.acceptBuild() → App.place* / App.finishWire (one undo step) → simulate.analyze()
```

## Code rules
- **No build step, bundler or framework.** Browser code is plain `<script>` files that share `window.App`. A new file gets a `<script>` tag in `circuit3d/index.html`, in dependency order.
- **Logic goes in a module Node can load**, using the wrapper at the top of `simulate.js`, `ids.js` or `storage.js`: it exports `module.exports` in Node and attaches to `window` in the browser. DOM and Three.js code stays a thin layer on top. If it can't be loaded in Node, it can't be unit-tested.
- **The backend has zero runtime npm packages.** `backend/` uses only Node built-ins. Dev dependencies (Vitest, Biome, Playwright) are fine.
- **Parts are named per type**: `battery_0` is the first battery, from `ids.js`. Never use an index into all components.
- **Change the board only through `App.place*`, `App.finishWire` and `App.clearAll`.** AI builds go through `Chat.acceptBuild` so they undo in one step.
- **The simulator's `analyze()` is pure**, taking components and wires and returning results. The UI reads only `lines`, `ledsOn` and `buzzersOn`. Currents are positive from pin 0 to pin 1, so a lit LED is negative.
- **Saved circuits** go through `storage.js` (`SparkyStorage.projectsKey(uid)`). Never hard-code a `localStorage` key.

## Tests
- Every behaviour change gets a test that fails first.
  - Logic goes in `test/*.test.js` (Vitest).
  - Anything visible goes in `e2e/*.spec.js` (Playwright).
  - Page wiring that Node can't run goes in `test/wiring.test.js`.
- Tests never call a real AI. Unit tests pass a fake `fetch`, and browser tests stub `/api/ask` with `page.route`.
- Google sign-in can't be automated. It's a manual case in `../docs/QA.md`.

## Config and secrets
- **AI keys:** `backend/.env`, which is gitignored. Agents are blocked from reading or writing it, so a person edits it. It's read only at startup, so restart the server after changing it. Variable names are listed in `../.env.example`.
- **Firebase config:** `firebase-config.js` is public by design, and it's the **only** copy, so don't paste it into pages. The Firestore rules are `firestore.rules`, and a person publishes them in the Firebase console.
- **AI cost:** about a cent per build on DeepSeek. Never write loops or scripts that send real prompts; use `AI_PROVIDER=fixture` or stubs.

## Before saying it works
Run `npm run check`, `npm test`, and `npm run e2e` if UI changed. For anything visible, open it in a real browser and check the console for errors.

## Gotchas
- Three.js is **r128**, loaded from a CDN as the global `THREE`. Current Three.js docs and examples use a newer API, so check against r128.
- Vitest is pinned to **3.2**, because Node 20 can't run Vitest 5.
- `require('x.sparky')` fails. Read the file and use `JSON.parse`.
- The frontend is served straight from disk, so a page refresh is enough. Backend changes need a server restart.
- The formatter is off on purpose: the code uses hand-aligned columns. Match the style of the file you're in.
- `circuit3d/index.html` loads its scripts in dependency order. A module used by `app.js` must come before it.
