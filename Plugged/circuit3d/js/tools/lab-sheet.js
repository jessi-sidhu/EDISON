// ─────────────────────────────────────────────────────────────
//  tools/lab-sheet.js — the lab sheet panel in the editor (issue #151).
//  The steps and checks are labs/sheets.js.
//
//  LabSheet.open(id) docks #lab-sheet (an <aside>) left of the canvas, so
//  the canvas narrows beside it: the lab code, title and week, an <ol> of
//  steps, each with a .lab-step-status pill ("Not yet", "Passed", "Check
//  failed") and a .lab-step-hint shown only while the step has failed, a
//  stepper footer, and a close button. On every plugged:sim each checked
//  step is LabSheets.evaluate'd against the solve's readings with App.state
//  as the board; plugged:sim-stop starts a new memo (the peak checks'). A
//  manual step toggles when its row is clicked. The sheet never shows a
//  step's expected value. LabSheet.close() removes it.
//
//  LOADING
//  ───────
//  Browser: a <script> after labs/sheets.js. Does nothing in Node.
// ─────────────────────────────────────────────────────────────

(function () {
  if (typeof document === 'undefined') return;

  const WORDS = { pending: 'Not yet', passed: 'Passed', failed: 'Check failed' };

  let current = null;   // { sheet, el, rows[{ li, pill, hint, dot, status }], progress } while a sheet is open
  let memo  = {};     // per run, for peak checks

  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function setStatus(row, status) {
    if (row.status === status) return;
    row.status = status;
    row.li.dataset.status  = status;
    row.dot.dataset.status = status;
    row.pill.textContent   = WORDS[status];
    row.hint.hidden        = status !== 'failed';
    footer();
  }

  function footer() {
    if (!current) return;
    const passed = current.rows.filter(r => r.status === 'passed').length;
    current.progress.textContent = `${passed} of ${current.rows.length} steps passed`;
  }

  // The circuit is framed for the canvas it had; frame it again once the
  // canvas has its narrower size (scene.js's observer has run by then), from
  // a lab's distance (tools/labs.js's FRAME_DISTANCE, #194).
  function reframeOnResize() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      ro.disconnect();
      if (App.frameCircuit) App.frameCircuit({ minDistance: window.Labs ? Labs.FRAME_DISTANCE : undefined });
    });
    ro.observe(wrap);
  }

  function open(id) {
    const sheet = window.LabSheets && LabSheets.get(id);
    if (!sheet) return false;
    close();

    const el = make('aside');
    el.id = 'lab-sheet';
    el.setAttribute('aria-label', `Lab sheet ${sheet.code}`);

    const head = make('header', 'lab-sheet-head');
    const closeBtn = make('button', 'lab-sheet-close', '×');
    closeBtn.type = 'button';
    closeBtn.title = 'Close the lab sheet';
    closeBtn.setAttribute('aria-label', 'Close the lab sheet');
    closeBtn.addEventListener('click', close);
    head.append(make('span', 'lab-sheet-code', sheet.code), make('span', 'lab-sheet-week', sheet.week), closeBtn,
                make('h2', 'lab-sheet-title', sheet.title));

    const list = make('ol', 'lab-steps');
    const dots = make('div', 'lab-stepper');
    const rows = sheet.steps.map(step => {
      const li   = make('li', 'lab-step');
      const pill = make('span', 'lab-step-status');
      const hint = make('div', 'lab-step-hint', step.hint);
      const dot  = make('span', 'lab-stepper-dot');
      dot.title = `Step ${step.n}`;
      li.append(make('span', 'lab-step-n', String(step.n)), make('span', 'lab-step-text', step.text), pill, hint);
      list.append(li);
      dots.append(dot);
      const row = { step, li, pill, hint, dot, status: null };
      if (step.check && step.check.kind === 'manual') {
        li.classList.add('lab-step-manual');
        li.tabIndex = 0;
        li.title = 'Click to tick this step';
        const toggle = () => setStatus(row, row.status === 'passed' ? 'pending' : 'passed');
        li.addEventListener('click', toggle);
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      return row;
    });

    const foot = make('footer', 'lab-sheet-foot');
    const progress = make('span', 'lab-sheet-progress');
    foot.append(dots, progress);
    el.append(head, list, foot);

    current = { sheet, el, rows, progress };
    memo = {};
    rows.forEach(r => setStatus(r, 'pending'));

    const body = document.getElementById('body');
    const wrap = document.getElementById('canvas-wrap');
    if (body && wrap) body.insertBefore(el, wrap); else document.body.append(el);
    reframeOnResize();
    return true;
  }

  function close() {
    if (!current) return;
    current.el.remove();
    current = null;
  }

  document.addEventListener('plugged:sim', e => {
    if (!current) return;
    const readings = e.detail && e.detail.readings;
    for (const row of current.rows) {
      const check = row.step.check;
      if (!check || check.kind === 'manual') continue;
      setStatus(row, LabSheets.evaluate(check, readings, App.state, memo));
    }
  });
  document.addEventListener('plugged:sim-stop', () => { memo = {}; });

  window.LabSheet = { open, close };
})();
