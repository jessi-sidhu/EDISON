# Sparky

A 3D circuit designer that runs right in your browser. Drop components onto a breadboard, wire them up, simulate the circuit, and ask the built-in AI tutor for help.

## MIT USE
---

## What can it do?

- **Build circuits in 3D** -- place resistors, LEDs, batteries, buzzers, and push buttons onto a realistic breadboard
- **Draw wires** between any two holes or pins, pick from 6 colors
- **Simulate** -- hit play and watch LEDs light up, click buttons to open/close the circuit in real time
- **AI tutor** -- ask Sparky a question and it explains what's going on, or tell it to build a circuit and it places the parts for you
- **Conversation memory** -- Sparky remembers your conversation within a session so you can build on previous messages
- **Save and load** -- export your circuits as `.sparky` files and share them

## Quick start

Open `circuit3d/index.html` in your browser. That's it. No install, no server, no npm.

The AI tutor needs the backend, because that is where the Gemini key lives. The browser never holds a key: the chat panel posts to same-origin `/api/ask` and the server calls Google.

**Run the backend if you want the AI tutor.** The 3D designer, wiring and simulation all work without it.

`backend/server.js` is a standalone Node 18+ server with zero npm dependencies. It serves the static files and exposes `/api/ask`, which is what the chat panel calls. Sign-in and cloud sharing go through Firebase Auth and Firestore, straight from the browser.

```bash
cd backend

# Create a .env file with your API key
echo "GEMINI_API_KEY=your_gemini_api_key_here" > .env

node server.js
```

Then open `http://localhost:5001`.

## Controls

| Key | What it does |
| --- | --- |
| `S` | Select mode -- click stuff to select it, then Delete to remove |
| `P` | Place mode -- hover to preview, click to drop |
| `W` | Wire mode -- click two holes/pins to connect them |
| `R` | Rotate component before placing |
| `Esc` | Cancel whatever you're doing |
| `Ctrl+Z` | Undo the last placement, wire, delete, Clear All, or file open |
| `Ctrl+Shift+Z` | Redo |

You can also just click components in the sidebar to start placing them.

## How the simulation works

The simulator models the breadboard as a graph. Holes in the same column on the same side of the center channel are electrically connected (just like a real breadboard). Power rails run the full length of the board.

When you hit simulate, it:
1. Maps every hole and wire into electrical nodes using Union-Find
2. Solves the whole circuit at once with nodal analysis: the voltage at every node and the current through every part, so parallel branches share current correctly and batteries in series add up
3. Treats each LED as off or on (its forward voltage plus a small resistance), and settles on the pattern that matches the voltages, so a backwards LED stays dark and a green LED next to a red one only lights if it gets enough voltage
4. Lights up any LED getting enough current, and reports shorts, open circuits, backwards LEDs and LEDs over their 20 mA rating (with the resistor you need)

Push buttons work during simulation too -- click them to toggle the circuit on and off.

## How the AI works

When you send a message, the app snapshots your entire board (components, positions, wires) as a markdown table and sends it to Gemini along with your question and your conversation history.

Gemini uses **function calling** to interact with the board. Instead of generating raw JSON, it calls structured tools like `place_resistor(holeA="a3", holeB="a7")` and `add_wire(from="tp_3", to="a3", color="red")`. The returned tool calls are shown as a ghost preview first, and only get applied to the board when you accept them.

So you can literally type "build me 3 LEDs" and watch it happen.

Before returning the tool calls, the server checks the proposed circuit for problems it can describe: an unpowered battery, a backwards LED, an LED that is not between power and ground. It reports them alongside the reply rather than silently rewriting your circuit.

## Project structure

```
landing.html          Marketing page + Firebase sign-in
dashboard.html        Saved circuits, shared "sparks" (Firestore)

circuit3d/
  index.html          The app
  viewer.html         Auto-rotating showcase of demo.sparky
  css/                 Styling
  js/
    scene.js           Three.js scene setup
    breadboard.js      Procedural breadboard geometry
    components.js      3D component models
    interaction.js     Mouse/keyboard handling
    simulate.js        Circuit simulation engine
    storage.js         Which localStorage key holds whose circuits
    ids.js             Component names (battery_0, led_1) shared with the AI
    history.js         Undo / redo
    board-io.js        Rebuilding a board from saved data
    app.js             Ties everything together
    chat.js            AI chat panel: preview, accept, apply

backend/
  server.js            AI backend + static server (zero npm dependencies)
  ai-providers.js      Gemini, local Claude CLI, or recorded fixtures
  .env                 Your API key (not committed)

test/                  Vitest tests (npm test)
```

The modules that hold logic (`simulate.js`, `storage.js`, `ids.js`, `history.js`, `board-io.js`, `chat.js`) load in the browser as plain scripts and in Node through `module.exports`, which is how the tests reach them.

Everything is vanilla JS. No build tools, no frameworks, no bundler. The 3D components are all built from basic Three.js shapes, so the whole app works offline from the file system (minus the AI).

## Tech stack

| What | How |
| --- | --- |
| 3D | Three.js r128 from CDN |
| Frontend | Plain HTML/CSS/JS |
| AI model | Gemini, called server-side. Defaults to `gemini-flash-latest`, set `GEMINI_MODEL` to pin one |
| AI features | Native function calling, conversation memory, preview before apply |
| Auth + cloud storage | Firebase Auth + Firestore |
| Optional backend | Node.js http module, zero dependencies |

## .env reference

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Your Google Gemini API key ([get one here](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | No | Gemini model id (default: `gemini-flash-latest`) |
| `AI_PROVIDER` | No | `gemini`, `claude` for the local Claude Code CLI, or `fixture` to replay recorded responses with no key |
| `PORT` | No | Server port (default: 5001) |
| `TRUST_PROXY` | No | Set to `1` behind a proxy such as Render, so the AI rate limit (20 requests a minute) applies per visitor instead of to everyone at once |

`GEMINI_API_KEY` is required for the AI tutor unless you set `AI_PROVIDER` to `claude` or `fixture`, which need no key at all.

## Tests

```bash
npm install     # once
npm test
```

The tests use Vitest and need no API key or browser. `AI_PROVIDER=fixture` lets you run the whole app against the recorded AI response in `test/fixtures/ask/`.

---


