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
- **2026-10-01: Aarmen decides the circuit physics too** (Aarmen). Before, a part's model or rating, a simulator rule, a mistake rule, a lab circuit or an expected value in `docs/QA.md` waited for Thandi's sign-off, and `/ship` stopped on it. Now Aarmen decides those like everything else, and Thandi's checks on real parts are advice. Why: the sign-off was blocking shipping (#90 waited on a ¼ W rating). This supersedes "Thandi checks the physics" above and in the Phase 3 spec.
