# Sparky — Features

What the app does today. For ideas that are not built yet, see `IDEAS.md`.

---

## 3D circuit editor

`circuit3d/index.html`

### Breadboard
- 700-hole board: 50 columns × 14 rows, rendered in 3D with Three.js.
- Rows a–e and f–j are split by a centre channel. In each column, a–e are connected to each other, and so are f–j.
- Four power rails run the full length of the board: `tp` and `bn` are positive (red), `tn` and `bp` are negative (blue).
- Printed column numbers, row letters and +/− markings, matching a real breadboard.

### Components

| Component | Footprint | Default value | Notes |
| --- | --- | --- | --- |
| Resistor | 4 columns | 470 Ω | Colour bands show its actual value |
| LED | 2 columns | Red, 2.0 V forward | Pin A is the cathode (−), pin B the anode (+). Saved circuits can also use yellow, green, blue and white LEDs. |
| 9V battery | Off the board | 9 V | Wire its + and − terminals to the rails |
| Buzzer | 2 columns | 42 Ω | Plays a tone while current flows |
| Push button | 3 columns | — | Momentary switch: click it during simulation to press or release |

### Placing and wiring
- Place mode shows a see-through preview of the part and highlights the holes it will use.
- A label shows the hole you're hovering over, e.g. "Col 14 Row E".
- `R` rotates a part between horizontal and vertical before placing.
- Wires connect any two holes or pins, in 6 colours: red, yellow, green, blue, black or white.
- Wires are drawn as curved arcs, with short legs going into the holes.

### Editing
- Select mode: click a part or wire to select it, then press Delete. Deleting a part also removes wires attached to its pins.
- Undo and redo (`Ctrl+Z` / `Ctrl+Shift+Z`), up to 60 steps. Covers placing, wiring, deleting, Clear All and opening a file.
- Clear All, with a confirmation prompt.
- Rename the circuit by clicking its name in the top bar.

### Camera and input
- Left-drag to orbit, right-drag to pan, scroll to zoom.
- A Reset View button appears once the camera has moved.
- Works with mouse, touch and pen.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `S` | Select mode |
| `P` | Place mode |
| `W` | Wire mode |
| `R` | Rotate the part being placed |
| `Delete` / `Backspace` | Delete the selection |
| `Esc` | Cancel and go back to select mode |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |

---

## Circuit simulation

`circuit3d/js/simulate.js`

Press **Run Simulation** to check the circuit and see the results:

- LEDs light up in their own colour when enough current flows (1 mA or more).
- Buzzers play a tone.
- Push buttons can be clicked while the simulation runs, and the circuit updates straight away.
- A results panel lists each battery, the current through each LED and buzzer, and any problems.

Problems it detects:

| Problem | What it says |
| --- | --- |
| LED over its 20 mA rating | The minimum resistor needed, rounded up to a standard value |
| LED across the battery with no resistor | Reports a short circuit and suggests a resistor value |
| Wire straight from + to − | Reports a short circuit |
| LED in backwards | Tells you to flip it |
| No complete path | Reports an open circuit, and whether the battery isn't connected at all |
| Empty board or no battery | Says so |

**Limitations:**
- Each path from + to − is calculated on its own, so parts shared between parallel branches get the wrong current.
- It doesn't calculate voltages at points in the middle of a circuit.
- Multiple batteries are each treated separately, so batteries in series don't add up.

These are tracked as issues #8, #9 and #11, and the tests in `test/simulate.test.js` record them.

---

## AI tutor

The chat panel on the right of the editor.

- **Ask questions or ask it to build.** "Why isn't my LED on?" gets an explanation. "Build me 3 LEDs" places the parts and wires.
- **It sees your board.** Every message includes the current parts, wires and board layout.
- **Preview before applying.** Proposed parts and wires appear as see-through previews. Nothing changes until you press Accept; Decline discards them.
- **Warnings.** Before a build reaches you, the server checks it for a battery that isn't wired in, a backwards LED, or an LED that isn't between power and ground. Any problems are added to the reply as warnings.
- **Conversation memory.** It remembers the last 20 messages in the session.
- **Quick-start buttons:** "Build an LED circuit", "Analyze my circuit", "What should I add?"
- **Tools the AI can use:** `delete_all`, `place_battery`, `place_resistor`, `place_led`, `place_buzzer`, `place_button`, `add_wire`.

The AI runs on the server, so the API key never reaches the browser. The `AI_PROVIDER` setting picks the model source:

| Provider | What it uses | Needs |
| --- | --- | --- |
| `gemini` (default) | Google Gemini, `gemini-flash-latest` unless `GEMINI_MODEL` is set | `GEMINI_API_KEY` |
| `claude` | The local Claude Code command-line tool | A Claude Code login |
| `fixture` | Saved responses in `test/fixtures/ask/` | Nothing. Good for testing. |

Requests are limited to 20 per minute per visitor.

---

## Saving and sharing

### In the editor
- **Auto-save** to the browser shortly after every change, with a thumbnail image.
- **Download** the circuit as a `.sparky` file (JSON, including a thumbnail).
- **Open** a `.sparky` file, with a preview of its name, part count and thumbnail before loading.

### Dashboard
`dashboard.html`

- **Sign-in required** (Google, through Firebase). Visitors who aren't signed in go back to the landing page.
- **My Circuits**, a grid of saved circuits:
  - Open, Publish, Download or Delete each one.
  - Create a new circuit.
  - Import one or more `.sparky` files.
- **Sparks**, a community gallery stored in Firestore:
  - Publish a circuit with a name and description.
  - Search by name, author or description.
  - Star favourites and filter to show only starred ones.
  - Fork a spark into My Circuits.
  - Remove your own sparks.
- **Sign out** clears this browser's saved circuits, so the next person using it doesn't see them.

### Landing page
`landing.html`

- Product overview with a Google sign-in button.
- **Try it out** opens the editor with `demo.sparky` already loaded.

### Showcase viewer
`circuit3d/viewer.html`

- Shows `demo.sparky` on a slowly rotating board. There are no editing controls.

---

## Backend

`backend/server.js`

Node 18 or newer, with no npm packages.

- Serves the app's pages. Only listed file types are served, and backend code, source files and hidden files are blocked.
- `POST /api/ask`: the AI tutor endpoint.
- `GET /api/health`: a health check.
- Optional Google OAuth and IBM Cloudant routes. The app doesn't use them; it signs in and stores shared circuits through Firebase instead.

---

## Demo video

`src/`

- A 20-second promo video built with Remotion: an intro, a 3D scene of the AI tutor building a circuit, and a closing screen.
- `npm install`, then `npm run studio` to preview or `npm run build` to render.

---

## Tests

`test/`

- Run with `node --test test/`.
- Tests for the simulator: series circuits, parallel circuits, voltage dividers, backwards LEDs, short circuits, open circuits, batteries in series, empty boards, and how holes are grouped into connected nodes.
