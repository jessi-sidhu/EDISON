# Photo → circuit: status (2026-10-01, end of the school-computer session)

The design is `2026-10-01-photo-to-circuit-design.md`; this note says what's on `dev` and what's next.

## Where it stands
**The photo demo works end to end on `dev` (4ca6af1):** 📷 → tap 4 corners → confirm the dots (move, ⇄, ×, value and colour dropdowns, battery volts, + Add a part, amber flags) → Build it → the board appears as one undo step and simulates → the problems panel says LED1 is backwards → Edison answers the question she typed.

**`main` has not been promoted.** It's still at #128. Run `/promote` next.

| Issue | What | Commit on dev |
|---|---|---|
| #134 | Contract (`docs/API-CONTRACT.md` → "Photo → circuit") | 8b912f0 |
| #135 | `photo-grid.js`: taps → holes, snap, warp | ba9c1d4 |
| #136 | `photo-import.js` core: Reading → actions | e6032a3 |
| #137 | The bridge: long, diagonal, rail and same-node parts | c614afa |
| #138 | `POST /api/photo`: caps, rate limit, errors, fixtures | e0b393f |
| #139 | Live readers: Gemini Robotics-ER boxes, deepseek-flash fallback | 9cb8b93 |
| #140 | 📷 capture: choose, drop or sample, 4 corners, flatten, send | 417fc11 |
| — | Fix for #140's flaky e2e (pixel diff now runs in the page) | 201f2af |
| #141 | Confirm screen 1: dots, move, ⇄, ×, Build it | a6c2827 |
| #143 | Build and help: applyBuild, simulate, PhotoFlags, sparkyAsk context | 8d1e042 |
| #142 | Confirm screen 2: values, colours, battery, add a part, amber | 4ca6af1 |

**Live check:** one real call through `/api/photo` with `PHOTO_PROVIDERS=gemini` returned 200 from `gemini-robotics-er-2-preview` in 21.7 s (12 parts, 6 wires, all 4 rail signs; posted on #139). That photo was unflattened, so it proves the request shape, not accuracy.

## Next (needs Aarmen)
1. **`/promote`** dev → main.
2. **#144, the rehearsed demo board:** needs real photos of Thandi's demo board and `GEMINI_API_KEY` on the machine. The current sample (`circuit3d/samples/demo-board.jpg`) is a placeholder: p6_piranha stretched to 63 columns.
3. **The two crop issues aren't filed yet:** `POST /api/photo/leads` (server) and `photo-crops.js` (browser cuts the crops from #139's boxes). This is the 61% → ~96% accuracy step from the spike.
4. **#145** (iPhone camera, stretch): optional.

## Known, not blocking
- **"LED1 direction" can't happen as built.** The spec's example context line needs a polarity flag, but #141's Build it stays disabled until every LED has one anode and one cathode, so PhotoImport never flags polarity at build time. If "direction" should come from the Reading's `unsure: ['polarity']`, that's a design change (#143's e2e flags an unread LED colour instead).
- **Two undo steps over a non-empty board:** the clear, then the build. The first Ctrl+Z gives the empty board; her old parts come back on the new Untitled, never on her saved record.
- **Empty board + saved circuit open:** applyBuild skips `clearAll`, so the photo board autosaves into that (empty) record.
- **#142 edge cases:**
  - Deleting a battery while another battery's dot is selected leaves a stale selection (`photo-confirm.js` ~375–381; needs 2 power sources).
  - Editing the volts box, then clicking × in the list, can swallow that first click (the `change` handler re-renders, ~348).
- **Live readers:** a battery Gemini sees arrives as an `other` part with `power: []`; the importer assumes 9 V and the confirm screen shows a board-level amber note.
- **The mistakes-panel badge is styled inline** in `tools/mistakes.js`; move it to `css/tools.css` (`.mistake-photo`) if wanted.
- **e2e load flakes on the Windows machine** (pass alone, not photo-related): `ai-timeout.spec.js:9`, `multimeter.spec.js:94/225`, `render-on-demand.spec.js:50/57`, `mistake-checker.spec.js:112`, `labs.spec.js:84`. All time out in `openDemo` / page load when ~12 workers saturate the CPU.
