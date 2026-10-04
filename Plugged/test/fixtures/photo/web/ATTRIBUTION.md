# Test photos: sources and licences

Real breadboard photos used to test the photo → circuit grid and import code (`docs/superpowers/specs/2026-10-01-photo-to-circuit-design.md`). Each image was turned upright (EXIF), resized to at most 2,048 px on the long edge and re-saved as JPEG; nothing else was changed. The corner taps in `photos.json` are scaled to the resized images.

| File | Source | Author | Licence |
|---|---|---|---|
| `p1_resistors.jpg` | [ElectricCircuit.jpg](https://commons.wikimedia.org/wiki/File:ElectricCircuit.jpg) | ReyungCho | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `p2_leds_buttons.jpg` | [Solderless_Breadboard_with_LEDs.jpg](https://commons.wikimedia.org/wiki/File:Solderless_Breadboard_with_LEDs.jpg) | Ilikefood (en.wikipedia) | Copyrighted free use |
| `p3_bjornr.jpg` | [BjornR_breadboard_01.jpg](https://commons.wikimedia.org/wiki/File:BjornR_breadboard_01.jpg) | BjornR (nl.wikipedia) | Public domain |
| `p4_io_leds.jpg` | [Test_the_IO_pins.jpg](https://commons.wikimedia.org/wiki/File:Test_the_IO_pins.jpg) | Becky Stern | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `p5_multimeter.jpg` | [Multimeter_probes_on_breadboard.jpg](https://commons.wikimedia.org/wiki/File:Multimeter_probes_on_breadboard.jpg) | Zeroping | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `p6_piranha.jpg` | [Flickr 9079851401](https://www.flickr.com/photos/52195472@N00/9079851401) | lungstruck | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

The resized copies of the CC BY-SA images are shared under the same licence as their originals.

## Files
- `photos.json`: per photo, the resized size, the board's column count (`ncols`), the corner taps (`taps`, hole → `[x, y]` pixels; some photos use more than 4 points for a least-squares fit), which side row a is on (`a_top`, `null` = work it out), and the rails' y positions in pitch units with their printed sign (`rails`, e.g. `"j:+": -3.0`).
- `truth.json`: the hand-labelled truth per photo: every part's type, value and the hole of each lead, and every wire's two ends, each with a confidence (`high`, `med`, or `node` when only the column-half is certain). Leads that couldn't be labelled were left out. Hole names follow the board's printed labels.
