# Photo eval set: sources and licences

Real breadboard photos for `npm run photo-eval` (issue #175), which runs them through the real page against live Gemini. Each image was turned upright (EXIF), resized to at most 2,048 px on the long edge and re-saved as JPEG; nothing else was changed. The corner taps in `photos.json` are in the resized images' pixels.

| File | Source | Author | Licence |
|---|---|---|---|
| `e01_preamp.jpg` | [Ultrasound-PreAmp-Breadboard.jpg](https://commons.wikimedia.org/wiki/File:Ultrasound-PreAmp-Breadboard.jpg) | Drahkrub ([de.wikipedia.org/wiki/Benutzer:Drahkrub](http://de.wikipedia.org/wiki/Benutzer:Drahkrub)) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `e02_rectifier.jpg` | [Sample_Rectifier_Circuit.jpg](https://commons.wikimedia.org/wiki/File:Sample_Rectifier_Circuit.jpg) | Ablomme1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `e03_dimmer.jpg` | [Light_dimmer_circuit_(Breadboard).jpg](https://commons.wikimedia.org/wiki/File:Light_dimmer_circuit_(Breadboard).jpg) | Benjaminpvera | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `e04_micro_accel.jpg` | [Arduino_Micro_+_MMA7361_Three_Axis_Low-g_Micromachined_Accelerometer.jpg](https://commons.wikimedia.org/wiki/File:Arduino_Micro_%2B_MMA7361_Three_Axis_Low-g_Micromachined_Accelerometer.jpg) | Sho Hashimoto | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `e05_empty30.jpg` | [Breadboard_(28045530760).jpg](https://commons.wikimedia.org/wiki/File:Breadboard_(28045530760).jpg) | The Marmot | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| `e06_empty30_upright.jpg` | [Breadboard_2.jpg](https://commons.wikimedia.org/wiki/File:Breadboard_2.jpg) | Maskaravivek | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `e07_empty63.jpg` | [Bread_board_1480358_59_60_HDR_Enhancer.jpg](https://commons.wikimedia.org/wiki/File:Bread_board_1480358_59_60_HDR_Enhancer.jpg) | Nevit Dilmen | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

The resized copies of the CC BY-SA images are shared under the same licence as their originals.

## Files
- `photos.json`: per photo, `file`, the board's column count `cols` (30 or 63), the resized image's `width` and `height`, and `taps`: the four corner holes `a1`, `aN`, `jN`, `j1` (N = `cols`) → `[x, y]` pixels, in the order the page asks for them. Where the photo has no printed numbers, column 1 is the end chosen in the photo's `notes`.
- `truth.json`: the hand-labelled truth per photo, in the app's hole names (`docs/API-CONTRACT.md` → "Reading v1": body `c14`, rails `rail:<aOuter|aInner|jInner|jOuter>:<col>`, `off`):
  - `notes`: what the photo shows and any labelling choice (which end is column 1, what is off the grid).
  - `rails`: each rail strip's printed sign by side (`'+'`, `'-'` or `'?'`).
  - `parts`: every resistor and LED with `value` (resistance as printed, or LED colour; `null` when unread) and its `leads` (`pin`, `hole`, `conf`); a lead that can't be seen has `hole: null` and a `why`. Other parts (ICs, diodes, modules, pots…) are listed with their type only and are not scored.
  - `wires`: every jumper with its `color` and two `ends` (same shape as leads, no pin); an end that leaves the board is `off`.
  - `conf`: `high`, `med`, or `node` when only the column-half (or rail) is certain. Scoring is by node, so a `node` lead still counts.
- The three empty boards (`e05`–`e07`) are controls: anything read on them is invented.
