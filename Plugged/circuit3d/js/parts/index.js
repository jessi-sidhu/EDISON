// ─────────────────────────────────────────────────────────────
//  parts/index.js — the list of part files.
//
//  Node (backend/server.js, Vitest): require('circuit3d/js/parts') loads
//  the registry, requires every part file below, and returns Parts.
//  Browser: each part file has its own <script> tag in index.html and
//  viewer.html, after parts/registry.js; this file does nothing there.
// ─────────────────────────────────────────────────────────────

(function () {
  // One entry per part file, e.g. 'resistor.js'. Each calls Parts.define().
  const FILES = ['resistor.js', 'led.js', 'battery.js', 'buzzer.js', 'button.js', 'potentiometer.js', 'ldr.js', 'thermistor.js', 'bench_supply.js', 'seven_segment.js', 'diode.js', 'zener.js', 'toggle_switch.js', 'slide_switch.js', 'bulb.js', 'motor.js', 'current_source.js', 'rgb_led.js', 'multimeter.js', 'capacitor.js', 'tl072.js'];

  if (typeof module === 'object' && module.exports) {
    const Parts = require('./registry.js');
    for (const file of FILES) require('./' + file);
    module.exports = Parts;
  }
})();
