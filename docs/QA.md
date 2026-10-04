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
| AI-06 | Fresh board. Send: `Build one LED circuit.` Look at the preview, Accept, then Run Simulation. | No hole holds two leads: every resistor leg, LED leg and wire end sits in its own hole (for example resistor b2–b6, LED c6/c8, wires into a2 and a8). Both rail wires land in row a, nearest the rails, and no wire passes under the resistor or between the LED's legs. The reply has no "Hole … holds 2 leads" or other "Heads up" line. `💡 LED ON (14.9 mA)`. |
| AI-07 | After AI-06, send: `Add a second LED in parallel.` Accept, then Run Simulation. | Still one resistor and one pair of rail wires. LED2's legs are in the same two columns as LED1's (anode with anode, cathode with cathode), in a free row (for example LED2 d6/d8). The rail wires still land in row a and no wire passes under a part. The reply says the LEDs are in parallel and has no "Heads up". Two `💡 LED ON (7.4 mA)` lines. |
| AI-08 | Fresh board. Send: `Put two LEDs in series.` Accept, then Run Simulation. | One resistor and one current path: LED1's cathode column is LED2's anode column, and only LED2's cathode column is wired to ground (for example resistor b2–b6, LED1 c6/c8, LED2 d8/d10, wires into a2 and a10). The rail wires land in row a and no wire passes under a part. The reply says the LEDs are in series and that they are dimmer or need a lower resistor. No "Heads up". Two `💡 LED ON` lines with the same current, about 10.6 mA at 9 V and 470 Ω. |
| AI-09 | Fresh board. Send: `Make an LED dimmer with a potentiometer.` Accept, then Run Simulation. Then, while it simulates, hover the pot and scroll down one tick at a time. | The build places a potentiometer (RV1) and an LED, and the reply has no "Heads up". The simulation shows `💡 LED ON` (about 3.5 mA with the recipe's 1 kΩ pot at 50 %). Each scroll-down tick moves the pot 5 % (shown in the inspector) and the LED's mA falls and its glow dims; by about 20 % the LED goes off (no `💡 LED ON` line). No console errors. |
| AI-10 | Fresh board. Send: `Build a red LED and a green LED in parallel, each with its own resistor, both switched on and off by one push button.` Accept, then Run Simulation, then click the push button. | "Applied 14 changes", no "Heads up". Released: "Circuit open — no complete path". Pressed: `💡 LED ON (14.9 mA)` (red) and `💡 LED ON (14.5 mA)` (green). Each branch has its own feed wire from the button's output column. |
| AI-11 | Fresh board. Send: `Build a night light that turns an LED on when it gets dark.` Accept, then Run Simulation. Then, while it simulates, hover the light sensor and scroll down one tick at a time. | The build places a light sensor (LDR1), a 4.7 kΩ resistor and an LED, and the reply has no "Heads up". At the default 300 lux the LED is off: no `💡 LED ON` line, since the LDR (about 925 Ω) holds the LED under its 2 V. Scrolling down (darker) takes 500 lux a tick, shown on the inspector's light slider; at 1 lux the simulation shows `💡 LED ON (1.4 mA)` and the LED glows. Scrolling back up turns it off again. No console errors. |
| AI-12 | Fresh board. Send: `Build a temperature alarm that sounds a buzzer when it gets hot` Accept, then Run Simulation. Then, while it simulates, hover the thermistor and scroll up one tick at a time. | The build places a thermistor (TH1), a 3.3 kΩ resistor and a buzzer in one series loop, and the reply has no "Heads up". At the default 25 °C the buzzer is silent: no `BUZZER ON` line (about 0.67 mA). Scrolling up (hotter) adds 7 °C a tick, shown on the inspector's temperature slider; at 32 °C it is still silent, and at 39 °C the simulation shows `BUZZER ON (1.0 mA)`. Scrolling back down silences it again. No console errors. |

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
