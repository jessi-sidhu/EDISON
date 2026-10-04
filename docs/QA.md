# QA script

<!-- Guneev owns this file: add, change and retire cases freely (it's the one doc that doesn't need a second teammate).
     /qa-pass runs every case here against `dev`, in a real browser, the way a user would.
     Each case: what to do, and what must be true. Keep expected results concrete (numbers, exact messages) so a
     pass/fail is never a judgment call. At track drop, add the new demo path first. -->

## Setup
- The app runs from `Plugged/`. Start it with `cd Plugged/backend && node server.js`, then open http://localhost:5001.
- The AI needs `Plugged/backend/.env` with a working provider key. Each AI prompt costs about a cent on DeepSeek.
- Sign-in cases need a person to sign in with Google. Agents never type passwords.
- "Fresh board": in the editor, click Clear All, or start a New Circuit from the dashboard.

## AI prompt checks (does the tutor do the right thing?)
| ID | Do | Pass when |
|---|---|---|
| AI-01 | Fresh board. Send: `Build a single LED circuit with a current-limiting resistor.` Accept, then Run Simulation. | The preview appears before anything changes. Accept says "Applied N changes" and doesn't say "could not be applied". The reply has no "Heads up, this build has a problem". The simulation shows `💡 LED ON` at 10–20 mA with no over-current line. |
| AI-02 | Fresh board. Send: `Build 3 LEDs, each with its own resistor.` Accept, then Run Simulation. Then press Ctrl+Z once. | 3 × `💡 LED ON`, each 10–20 mA. One Ctrl+Z removes the whole build. |
| AI-03 | Fresh board. Place a battery, a resistor and an LED **backwards** by hand, and wire them. Send: `Why isn't my LED lighting up?` | The reply says the LED is backwards (reversed, cathode and anode swapped, or flip it). |
| AI-04 | After AI-03, send: `Fix it.` Accept, then Run Simulation. | The LED lights. |
| AI-05 | Send: `What does a resistor do?` | A plain answer. No preview, and no Accept/Decline bar. |

## Logic checks (are the numbers right?)
Build these by hand, then click Run Simulation.
| ID | Circuit | Pass when |
|---|---|---|
| LG-01 | 9 V battery → 470 Ω → red LED → back to battery (series) | `💡 LED ON (14.9 mA)` |
| LG-02 | One 470 Ω feeding **two** red LEDs in parallel | Two `💡 LED ON (7.4 mA)` lines, not 14.9 each |
| LG-03 | LG-01 with the LED turned around | The LED stays dark, and a line says "LED is backwards" |
| LG-04 | Red LED straight across the battery, no resistor | "Short circuit", suggesting a 470 ohm resistor |
| LG-05 | Landing page → Try it out (demo circuit). Simulate, click the push button, simulate again | Released: "Circuit open — no complete path" only. Pressed: `💡 LED ON (14.9 mA)` |

## Core flows
| ID | Do | Pass when |
|---|---|---|
| CF-01 | Landing page → Sign in → Google | The dashboard opens with your name at the top |
| CF-02 | Build any circuit, wait 2 s, go back to the dashboard, open it again | It's the same circuit, with the same parts and wires |
| CF-03 | Dashboard → a circuit's ··· menu → Publish | It appears in the Sparks tab |
| CF-04 | Sign out, then sign back in | Your circuits are still there |
| CF-05 | Whole pass | No red errors in the browser console (except a deliberately stopped AI server) |
