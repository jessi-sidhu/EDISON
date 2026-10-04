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
