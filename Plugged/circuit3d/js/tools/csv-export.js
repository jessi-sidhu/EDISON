// ─────────────────────────────────────────────────────────────
//  tools/csv-export.js — Export CSV (issue #101)
//
//  While simulating, #csv-export-btn (beside Stop) downloads
//  "<circuit name>-readings.csv" from the latest solve: every labelled
//  part's V, I and P, then every net's holes and voltage. Reads only
//  Readings (API-CONTRACT → "Readings", "Page events").
//
//  EXPORTS
//  ───────
//  Browser: window.CsvExport (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  toCSV(readings, board) → string, "\n" line endings, RFC 4180 quoting
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const CsvExport = factory();
  if (typeof module === 'object' && module.exports) module.exports = CsvExport;
  if (root) root.CsvExport = CsvExport;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode   = typeof module === 'object' && module.exports;
  const Readings = inNode ? require('../readings.js') : window.Readings;

  const field = x => {
    const s = String(x);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const row = cells => cells.map(field).join(',');
  // |x| × scale to 2 dp, or an empty cell when the reading is missing.
  const dp2 = (x, scale = 1) => (typeof x === 'number' ? Math.abs(x * scale).toFixed(2) : '');

  function toCSV(readings, board) {
    const lines = [row(['Label', 'Type', 'V (V)', 'I (mA)', 'P (mW)'])];
    (board.components || []).forEach(c => {
      const r = c.label ? readings.part(c.label) : null;
      if (!r) return;
      lines.push(row([c.label, c.type, dp2(r.V), dp2(r.I), dp2(r.P, 1000)]));
    });
    lines.push('', row(['Net', 'Holes', 'V (V)']));
    Readings.nets(board).forEach(net => {
      const v = readings.voltage(net);
      lines.push(row([net.id, net.holes.join(' '), typeof v === 'number' ? v.toFixed(2) : '']));
    });
    return lines.join('\n') + '\n';
  }

  if (typeof document !== 'undefined') wire();

  function wire() {
    let last = null;            // readings of the last solve while simulating

    const btn = document.createElement('button');
    btn.id = 'csv-export-btn';
    btn.className = 'btn-colouring';
    btn.title = 'Download every part\'s V, I and P and every node voltage';
    btn.textContent = 'Export CSV';
    btn.hidden = true;
    btn.disabled = true;
    const after = document.getElementById('colouring-toggle') || document.getElementById('sim-stop-btn');
    if (after) after.after(btn);

    btn.addEventListener('click', () => {
      if (!last) return;
      const text = toCSV(last, { components: App.state.components, wires: App.state.wires });
      const name = String(App.state.circuitName || '').replace(/[^A-Za-z0-9 \-]/g, '').trim() || 'circuit';
      const blob = new Blob([text], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = name + '-readings.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.addEventListener('plugged:sim', e => {
      const d = e.detail || {};
      // A first run that fails never starts the simulation, so no Stop follows.
      const running = App.simRunning || (d.result && d.result.status === 'ok');
      last = running && d.readings ? d.readings : null;
      btn.hidden = btn.disabled = !last;
    });

    document.addEventListener('plugged:sim-stop', () => {
      last = null;
      btn.hidden = btn.disabled = true;
    });
  }

  return { toCSV };
});
