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
- **2026-09-30: the capacitor and time-stepping join Phase 3** (Aarmen). The alternatives were a separate spec after Phase 3, or a steady-state-only capacitor, which is just an open circuit and never visibly charges. The model is backward Euler (a companion `G = C/h` plus a current source), stepped by the page while simulating. A board with no capacitor keeps today's code path exactly. It lands after Phase 3's #1–#5 are promoted, so the Oct 3 set isn't at risk. Details: `docs/superpowers/specs/2026-09-30-phase-3-see-the-circuit-design.md`, "Time and the capacitor". Thandi checks the physics.
