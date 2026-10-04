# Architecture

<!-- Aarmen keeps this current. Keep modules swappable: each talks to others only through docs/API-CONTRACT.md, so we can reshape the product at track drop without rewriting everything. -->

## Stack
<!-- Framework, database, hosting, AI/ML services, and why each (one line each). -->

## Modules and ownership

| Module | Folder | Working in it | Does | Depends on |
|---|---|---|---|---|
| | | | | |

## Data flow
<!-- The demo story traced through the modules, one line per hop. -->

## Shared files (change with care: other modules depend on them)
- `docs/API-CONTRACT.md`
- Database schema / migrations
- Root layout, navigation, global styles
- Config and lockfile (`package.json`, lockfiles, env handling)

## Key decisions
<!-- Decision, alternatives, why. Append as you go so nobody re-argues settled choices. -->
- **2026-10-02: the Edison landing page is v3: all black, the top only, and a HUD stage** (Aarmen, #166/#167/#171/#164/#168; refs in `docs/design/landing-v3/`). It replaces v2 (#162).
  - **What stays from v2:** the top only, i.e. the wordmark, the headline and the Ask box.
  - **What's gone:** the giant EDISON, the sections below the hero, light mode, the toggle and the wipe.
  - **The page:** all black, in `#101010`/`#F4F4F4` and DM Mono (the free stand-in for Diode's paid Code Saver).
  - **The stage:** under the box is a HUD stage in ref 04's style.
  - **The sequence:** a click plays schematic → glass 3D sketch (Aarmen's storyboard) → simulator → LED lit → "Open in the simulator +".
  - The palette lives in `edison/landing.css`, not `tokens.css`. The course hub and editor keep the engineering-pad look unless Aarmen decides otherwise.
- **2026-10-02: Edison (the UI revamp and the ENSC 220 course hub) is built on its own `edison` branch** (Aarmen). Edison issues (#147–#156) branch off `edison`, rebase onto it and push to it, never to `dev`. CI runs on `edison` pushes (this branch's `ci.yml` only). `dev` is merged into `edison` now and then, as a merge commit, never a force-push, to stay current. Edison reaches `dev` only through one deliberate `edison` → `dev` PR when Aarmen chooses. The alternative, shipping each issue to `dev` behind the `?ui=` flag, was rejected so nothing in Edison can affect `dev`, `main` or the photo work.
- **2026-09-30, #84: the server judges an AI edit by the problems it adds (after minus before)**, so a student's own unfinished wiring never triggers a repair or a Heads up. #85 update: a "Fix it." request (the message matches fix or repair) now gets the full check, every problem left on the board after the edit, so an edit that fails to fix the existing problem gets a repair round; other edits stay after minus before. The repair heading follows the reply: a delete_all rebuild is told to rebuild, an edit to "Fix only these, keeping everything else".
- **2026-09-30: the capacitor and time-stepping join Phase 3** (Aarmen). The alternatives were a separate spec after Phase 3, or a steady-state-only capacitor, which is just an open circuit and never visibly charges. The model is backward Euler (a companion `G = C/h` plus a current source), stepped by the page while simulating. A board with no capacitor keeps today's code path exactly. It lands after Phase 3's #1–#5 are promoted, so the Oct 3 set isn't at risk. Details: `docs/superpowers/specs/2026-09-30-phase-3-see-the-circuit-design.md`, "Time and the capacitor". Thandi checks the physics.
- **2026-10-02, #172: photos are Gemini's alone, and Gemini's calls survive overload instead of falling back** (Aarmen's orchestrator). A real lab-board photo ended `AI_TIMEOUT` on `dev`: Gemini stalled past the 25 s per-call cap, then deepseek-flash got the last 20 s and failed too. Measured that day (spike harness, 6 truth-labelled photos): `gemini-robotics-er-2-preview` answers a trivial call in ~1 s but stalls 9–16 s at times and returned many 503s; 24 crops in flight drew 503s and some 429s. Leads in the right node: ER-2 with default thinking 91–96%, ER-2 low thinking 82%, gemini-3.1-flash-lite 31%, deepseek-flash 38%. So the alternatives (a faster or cheaper model, lower thinking, deepseek as the fallback) all cost accuracy, and deepseek only burned time. Instead: `PHOTO_PROVIDERS` defaults to `gemini`, which gets the whole 45 s; both rounds share one retry rule (`raceGemini`: a 503/429/5xx/network/empty/invalid reply is retried 1–2 s later or after a 429's `retryDelay`, a stall gets one identical call at `PHOTO_HEDGE_MS`, a 400/401/403 is never retried; at most 4 calls a box round, 3 a crop); the crop round keeps at most `PHOTO_LEADS_CONCURRENCY` (16) first calls and retries in flight, a stall resend exempt (with 10 and resends counted, a live round had 9 of 13 crops time out behind the queue). deepseek stays available (`PHOTO_PROVIDERS=gemini,deepseek`) and is asked only after a Gemini 400/401/403, never after a timeout or Gemini's spent retries.
- **2026-10-02, #176: the box round brings in a fast second model when Robotics-ER is silent** (Aarmen's orchestrator, under "fully fix it"). #173's live check (run 2) ended `AI_TIMEOUT` at 45 s with `retries=0`: Robotics-ER's call and its 12 s resend both just hung, no 503 to retry, so #172's rule had nothing to act on (a model-wide stall); the same hit Aarmen's own photo earlier. Measured that day (spike harness, 6 photos): `gemini-3.1-flash-lite` answers trivial calls in ~3 s (max 6 s) with no 503s; its box round finds 81% of parts and its boxes hold 79% of true lead holes, against Robotics-ER 2's 100% / 96%. Rougher, but the crop round still places the legs inside them, and rough boxes beat an error. So when Robotics-ER has no valid answer at `PHOTO_FALLBACK_AT_MS` (25 s), or has spent its 4 calls before then (never after a 400/401/403), the same box request also goes to `PHOTO_FALLBACK_MODEL` (`gemini-3.1-flash-lite`, pinned; '' turns it off) under `raceGemini`'s rules with at most 2 calls, and the first valid answer from either wins (`model` names it, `fallback=yes` in the `[photo]` line). Its crops read only 31% of leads right, so the crop round stays Robotics-ER 2 alone.
- **2026-10-02, #165: CI is off; the local checks are the gate** (Aarmen). The repo is private, so Actions bills past 2,000 free minutes a month; each push to `dev` ran lint plus 4 browser shards (about 30 billed minutes) and about 50 pushes a day used October's minutes in a day. The alternatives were a public repo (free) or an Actions budget with CI trimmed to lint and unit tests on `dev` (about $1–2 a day). `/ship` already ran lint, unit and the full browser suite locally, and `/promote` runs them again on `dev`. To turn CI back on, restore `ci.yml`'s `pull_request`/`push` triggers once minutes are available.
- **2026-10-01: Phase 4 is the op-amp, a sine function generator and a mini scope; the transistor and MOSFET are scrapped** (Aarmen).
  - **The op-amp (TL072)** is two `E` elements. Each is a mode block: linear, clipped high or low 1.5 V inside the rails, or current-limited at 20 mA. A = 200 000, 50 Ω. The alternative was a curved-physics (Newton) solver, which would have meant rewriting the core.
  - **The sine** is a `V` with `wave`, stepped by the capacitor's clock (#103).
  - **The scope** is a small 2-channel tool, the seed of Phases 5–6.
  - The AI places everything, through part packs, so the demo prompt doesn't grow.
  - Spec: `docs/superpowers/specs/2026-10-01-phase-4-op-amp-and-sine-design.md`.
- **2026-10-01: Aarmen decides the circuit physics too** (Aarmen). Before, a part's model or rating, a simulator rule, a mistake rule, a lab circuit or an expected value in `docs/QA.md` waited for Thandi's sign-off, and `/ship` stopped on it. Now Aarmen decides those like everything else, and Thandi's checks on real parts are advice. Why: the sign-off was blocking shipping (#90 waited on a ¼ W rating). This supersedes "Thandi checks the physics" above and in the Phase 3 spec.
