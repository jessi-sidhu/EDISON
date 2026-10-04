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
- **2026-09-30, #84: the server judges an AI edit by the problems it adds (after minus before)**, so a student's own unfinished wiring never triggers a repair or a Heads up. #85 update: a "Fix it." request (the message matches fix or repair) now gets the full check, every problem left on the board after the edit, so an edit that fails to fix the existing problem gets a repair round; other edits stay after minus before. The repair heading follows the reply: a delete_all rebuild is told to rebuild, an edit to "Fix only these, keeping everything else".
- **2026-09-30: the capacitor and time-stepping join Phase 3** (Aarmen). The alternatives were a separate spec after Phase 3, or a steady-state-only capacitor, which is just an open circuit and never visibly charges. The model is backward Euler (a companion `G = C/h` plus a current source), stepped by the page while simulating. A board with no capacitor keeps today's code path exactly. It lands after Phase 3's #1–#5 are promoted, so the Oct 3 set isn't at risk. Details: `docs/superpowers/specs/2026-09-30-phase-3-see-the-circuit-design.md`, "Time and the capacitor". Thandi checks the physics.
- **2026-10-02, #172: photos are Gemini's alone, and Gemini's calls survive overload instead of falling back** (Aarmen's orchestrator). A real lab-board photo ended `AI_TIMEOUT` on `dev`: Gemini stalled past the 25 s per-call cap, then deepseek-flash got the last 20 s and failed too. Measured that day (spike harness, 6 truth-labelled photos): `gemini-robotics-er-2-preview` answers a trivial call in ~1 s but stalls 9–16 s at times and returned many 503s; 24 crops in flight drew 503s and some 429s. Leads in the right node: ER-2 with default thinking 91–96%, ER-2 low thinking 82%, gemini-3.1-flash-lite 31%, deepseek-flash 38%. So the alternatives (a faster or cheaper model, lower thinking, deepseek as the fallback) all cost accuracy, and deepseek only burned time. Instead: `PHOTO_PROVIDERS` defaults to `gemini`, which gets the whole 45 s; both rounds share one retry rule (`raceGemini`: a 503/429/5xx/network/empty/invalid reply is retried 1–2 s later or after a 429's `retryDelay`, a stall gets one identical call at `PHOTO_HEDGE_MS`, a 400/401/403 is never retried; at most 4 calls a box round, 3 a crop); the crop round keeps at most `PHOTO_LEADS_CONCURRENCY` (16) first calls and retries in flight, a stall resend exempt (with 10 and resends counted, a live round had 9 of 13 crops time out behind the queue). deepseek stays available (`PHOTO_PROVIDERS=gemini,deepseek`) and is asked only after a Gemini 400/401/403, never after a timeout or Gemini's spent retries.
- **2026-10-02, #165: CI is off; the local checks are the gate** (Aarmen). The repo is private, so Actions bills past 2,000 free minutes a month; each push to `dev` ran lint plus 4 browser shards (about 30 billed minutes) and about 50 pushes a day used October's minutes in a day. The alternatives were a public repo (free) or an Actions budget with CI trimmed to lint and unit tests on `dev` (about $1–2 a day). `/ship` already ran lint, unit and the full browser suite locally, and `/promote` runs them again on `dev`. To turn CI back on, restore `ci.yml`'s `pull_request`/`push` triggers once minutes are available.
- **2026-10-01: Phase 4 is the op-amp, a sine function generator and a mini scope; the transistor and MOSFET are scrapped** (Aarmen).
  - **The op-amp (TL072)** is two `E` elements. Each is a mode block: linear, clipped high or low 1.5 V inside the rails, or current-limited at 20 mA. A = 200 000, 50 Ω. The alternative was a curved-physics (Newton) solver, which would have meant rewriting the core.
  - **The sine** is a `V` with `wave`, stepped by the capacitor's clock (#103).
  - **The scope** is a small 2-channel tool, the seed of Phases 5–6.
  - The AI places everything, through part packs, so the demo prompt doesn't grow.
  - Spec: `docs/superpowers/specs/2026-10-01-phase-4-op-amp-and-sine-design.md`.
- **2026-10-01: Aarmen decides the circuit physics too** (Aarmen). Before, a part's model or rating, a simulator rule, a mistake rule, a lab circuit or an expected value in `docs/QA.md` waited for Thandi's sign-off, and `/ship` stopped on it. Now Aarmen decides those like everything else, and Thandi's checks on real parts are advice. Why: the sign-off was blocking shipping (#90 waited on a ¼ W rating). This supersedes "Thandi checks the physics" above and in the Phase 3 spec.
