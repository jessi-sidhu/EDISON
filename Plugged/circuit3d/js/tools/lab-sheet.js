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
//  The lab paper (Edison only): the same sheet is a paper you pull from the
//  board's left edge. A .lab-paper-grip on its right edge (the lab's name,
//  one square per step) drags it to any width (Labs.paperWidth); pulled in
//  past the snap it tucks to the grip alone, and #lab-next, a next-step
//  card, shows on the board's top-left. The paper is docked, so it pushes
//  the canvas, never covers it; while it is out the parts sidebar folds to
//  its icons (html[data-lab-paper="out"], the names on hover). A sheet with
//  a manual (labs/sheets.js: objective, equipment, prelab, data, questions)
//  draws it around the steps: equipment live from the board, pre-lab boxes
//  checked as typed (LabSheets.checkAnswer), and data filled on every
//  plugged:sim (LabSheets.readData). A data row's expected value is the
//  student's own pre-lab answer, never the key. The current step has three
//  buttons: Give me builds that step on the board (LabSheets.giveStep, laid
//  out by U1's own pins, one undo step, never into a hole already in use)
//  and lists where each piece went; Hint shows the step's hint; Explain asks
//  Edison in the chat (an explain ask, one AI call). When every step has
//  passed the paper says the lab is complete. Between runs the sheet checks
//  the board with a quiet DC solve whenever it changes, so a part or the
//  supply confirms the moment it's built; a written-answer step (an answer
//  check) confirms from its question's box.
//
//  LOADING
//  ───────
//  Browser: a <script> after labs/sheets.js. Does nothing in Node.
// ─────────────────────────────────────────────────────────────

(function () {
  if (typeof document === 'undefined') return;

  const WORDS = { pending: 'Not yet', passed: 'Passed', failed: 'Check failed' };
  const GRIP  = 30;     // the grip's width, px
  const RAIL  = 56;     // the parts sidebar folded to its icons, px

  let current = null;   // { sheet, el, rows[{ li, pill, hint, dot, gdot, status }], progress, paper? } while a sheet is open
  let memo  = {};     // per run, for peak checks

  const isEdison = () => document.documentElement.dataset.ui === 'edison';

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
    if (row.gdot) row.gdot.dataset.status = status;
    row.pill.textContent   = WORDS[status];
    row.hint.hidden        = status !== 'failed';
    footer();
  }

  function footer() {
    if (!current) return;
    const passed = current.rows.filter(r => r.status === 'passed').length;
    current.progress.textContent = `${passed} of ${current.rows.length} steps passed`;
    if (current.paper) nextStep(passed);
  }

  // The circuit is framed for the canvas it had; frame it again once the
  // canvas has its narrower size (scene.js's observer has run by then), from
  // a lab's distance (tools/labs.js's FRAME_DISTANCE, #194; in Edison the
  // whole board, beside the paper).
  function reframeOnResize() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      ro.disconnect();
      if (window.Labs) Labs.frame(); else if (App.frameCircuit) App.frameCircuit();
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
      // Classic has no answer boxes, so a written-answer step is ticked there too.
      if (step.check && (step.check.kind === 'manual' || (step.check.kind === 'answer' && !isEdison()))) {
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

    current = { sheet, el, rows, progress, paper: null };
    memo = {};
    if (isEdison()) buildPaper(el, head, list, foot);
    else el.append(head, list, foot);
    rows.forEach(r => setStatus(r, 'pending'));

    const body = document.getElementById('body');
    const wrap = document.getElementById('canvas-wrap');
    if (body && wrap) body.insertBefore(el, wrap); else document.body.append(el);
    if (current.paper) setWidth(Labs.PAPER_WIDTH, false);
    reframeOnResize();
    return true;
  }

  function close() {
    if (!current) return;
    if (current.paper) {
      clearInterval(current.paper.poll);
      current.paper.next.remove();
      current.paper.tip.remove();
      delete document.documentElement.dataset.labPaper;
    }
    current.el.remove();
    current = null;
  }

  // ── The lab paper (Edison) ──────────────────────────────────

  function buildPaper(el, head, list, foot) {
    const { sheet, rows } = current;
    const num = Number(sheet.code.slice(4));
    el.classList.add('lab-paper');

    if (sheet.due) head.insertBefore(make('span', 'lab-sheet-due', `Due ${sheet.due}`), head.querySelector('.lab-sheet-close'));
    const tuck = make('button', 'lab-paper-tuck', 'Tuck');
    tuck.type = 'button';
    tuck.title = 'Tuck the paper away; pull its edge to read it again';
    tuck.addEventListener('click', () => setWidth(0, true));
    head.insertBefore(tuck, head.querySelector('.lab-sheet-close'));

    // The manual around the steps, when the sheet has one.
    const scroll = make('div', 'lab-paper-scroll');
    const manual = !!(sheet.objective || sheet.equipment || sheet.prelab || sheet.data || sheet.questions);
    const answers = {};
    const written = {};   // the questions' written answers, for an answer check
    const sec = (n, title) => {
      const s = make('section', 'lab-paper-sec');
      const h = make('h3', 'lab-paper-h');
      h.append(make('span', 'lab-paper-h-n', String(n)), document.createTextNode(title));
      s.append(h);
      scroll.append(s);
      return s;
    };
    const equip = [];
    const dataCells = [];
    if (manual) {
      const s1 = sec(1, 'Objective');
      if (sheet.objective) s1.append(make('p', '', sheet.objective));
      if (sheet.reading) {
        // The reading links to its textbook page, in a new tab so the lab stays put.
        const p = make('p', 'lab-paper-dim');
        if (sheet.readingHref) {
          const link = make('a', 'lab-paper-reading', sheet.reading);
          link.href = sheet.readingHref;
          link.target = '_blank';
          link.rel = 'noopener';
          p.append(link);
        } else p.textContent = sheet.reading;
        s1.append(p);
      }

      if (sheet.equipment) {
        const t = make('table', 'lab-paper-equip');
        for (const it of sheet.equipment) {
          const tr = make('tr');
          const state = make('td', 'lab-paper-have');
          tr.dataset.label = it.label;
          tr.append(make('td', 'lab-paper-label', it.label), make('td', '', it.text), state);
          t.append(tr);
          equip.push({ label: it.label, tr, state });
        }
        sec(2, 'Equipment').append(t);
      }

      if (sheet.prelab) {
        const s3 = sec(3, 'Pre-lab');
        s3.append(make('p', 'lab-paper-dim', 'Answer before you build. Each answer is checked as you type.'));
        for (const it of sheet.prelab) {
          const q = make('div', 'lab-paper-q');
          const inp = make('input', 'lab-paper-answer');
          inp.type = 'text';
          inp.placeholder = it.unit ? `? ${it.unit}` : '?';
          inp.setAttribute('aria-label', `Answer ${it.n}`);
          inp.autocomplete = 'off';
          inp.spellcheck = false;
          const tick = make('span', 'lab-paper-tick');
          tick.setAttribute('aria-live', 'polite');
          inp.addEventListener('input', () => {
            const r = LabSheets.checkAnswer(it, inp.value);
            tick.textContent = r === 'empty' ? '' : r === 'correct' ? 'Correct' : 'Not yet';
            tick.dataset.result = r;
            answers[it.n] = inp.value.trim();
            fillExpected();
          });
          const body = make('div');
          const ans = make('div', 'lab-paper-ans');
          ans.append(inp, tick);
          body.append(document.createTextNode(it.q), ans);
          q.append(make('span', 'lab-paper-q-n', it.n), body);
          s3.append(q);
        }
      }
      sec(4, 'Procedure').append(list);
    } else {
      scroll.append(list);
    }

    if (manual && sheet.data) {
      const t = make('table', 'lab-paper-data');
      const hr = make('tr');
      for (const h of ['Quantity', 'Expected', 'Simulated']) hr.append(make('th', '', h));
      t.append(hr);
      for (const row of sheet.data) {
        const tr = make('tr');
        const exp = make('td', 'lab-paper-exp'), sim = make('td', 'lab-paper-sim', 'Run to fill');
        tr.append(make('td', '', row.name), exp, sim);
        t.append(tr);
        dataCells.push({ row, exp, sim });
      }
      const s5 = sec(5, 'Data');
      s5.append(t, make('p', 'lab-paper-dim', 'The simulated column fills while the simulation runs. Expected is your pre-lab answer.'));
    }
    if (manual && sheet.questions) {
      const s6 = sec(6, 'Questions');
      for (const it of sheet.questions) {
        const q = make('div', 'lab-paper-q');
        const ta = make('textarea', 'lab-paper-written');
        ta.addEventListener('input', () => { written[it.n] = ta.value; checkAnswers(); });
        ta.placeholder = 'Your answer';
        ta.setAttribute('aria-label', `Answer ${it.n}`);
        const body = make('div');
        body.append(document.createTextNode(it.q), ta);
        q.append(make('span', 'lab-paper-q-n', it.n), body);
        s6.append(q);
      }
    }

    for (const r of rows) stepTools(r, sheet);

    // The current step, pinned under the head: its text and its Give me,
    // Hint and Explain, so the student never scrolls to find what's next.
    const now = make('div', 'lab-paper-now');
    now.setAttribute('aria-live', 'polite');
    const nowTop = make('div', 'lab-now-top');
    const nowStep = make('span', 'lab-now-step'), nowCount = make('span', 'lab-now-count');
    nowTop.append(nowStep, nowCount);
    const nowText = make('div', 'lab-now-text');
    const nowTools = make('div', 'lab-now-tools');
    const nowBtn = (cls, text, title, fn) => {
      const b = make('button', cls, text);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', () => { const cur = currentRow(); if (cur) fn(cur); });
      nowTools.append(b);
      return b;
    };
    const nowGive = nowBtn('lab-now-give', 'Give me', 'Build this step on the board for me', row => giveMe(row));
    nowBtn('lab-now-hint-btn', 'Hint', 'Show a hint for this step', row => toggleHint(row));
    nowBtn('lab-now-explain', 'Explain', 'Ask Edison to explain this step', row => explain(row, sheet));
    const nowHint = make('div', 'lab-now-hint');
    nowHint.hidden = true;
    const nowLast = make('div', 'lab-now-last');
    nowLast.hidden = true;
    now.append(nowTop, nowText, nowTools, nowHint, nowLast);

    const page = make('div', 'lab-paper-sheet');
    page.append(head, now, scroll, foot);

    // The grip: the paper's edge you pull.
    const grip = make('div', 'lab-paper-grip');
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', `Pull the Lab ${num} paper`);
    grip.tabIndex = 0;
    grip.title = 'Pull to read the lab paper';
    const gdots = make('span', 'lab-paper-gdots');
    for (const r of rows) { r.gdot = make('i'); gdots.append(r.gdot); }
    const gcount = make('span', 'lab-paper-gcount');
    grip.append(make('span', 'lab-paper-glabel', `Lab ${num} paper`), gdots, make('span', 'lab-paper-ridges'), gcount);

    el.append(page, grip);

    // The next-step card, on the board while the paper is tucked.
    const next = make('button', 'lab-next');
    next.id = 'lab-next';
    next.type = 'button';
    next.hidden = true;
    next.title = 'Open the lab paper';
    const nTop = make('span', 'lab-next-top'), nText = make('span', 'lab-next-text'), nHint = make('span', 'lab-next-hint');
    nTop.append(make('span', '', `Lab ${num} / next step`), make('span', 'lab-next-count'));
    next.append(nTop, nText, nHint);
    next.addEventListener('click', () => setWidth(Labs.PAPER_WIDTH, true));
    const wrap = document.getElementById('canvas-wrap');
    if (wrap) wrap.append(next);

    // The folded parts' names, on hover or focus.
    const tip = make('div', 'lab-rail-tip');
    tip.id = 'lab-rail-tip';
    tip.hidden = true;
    document.body.append(tip);

    // Between runs, check the board again whenever it changes, so a step
    // confirms the moment it's built.
    const lastKey = { key: '' };
    const poll = setInterval(() => {
      const key = App.state.components.map(c => c.label + (c.holeRefs || []).map(h => h && h.row + h.col).join('.') + JSON.stringify([c.values, c.controls])).join(',') + '|' + App.state.wires.length;
      if (key !== lastKey.key) { lastKey.key = key; haveParts(); quietCheck(); }
    }, 400);

    current.paper = { el, grip, gcount, next, nText, nHint, tip, equip, dataCells, answers, written, poll, w: 0,
                      nowStep, nowCount, nowText, nowTools, nowGive, nowHint, nowLast, nowN: null };

    function fillExpected() {
      for (const c of dataCells) {
        if (c.row.prelab) {
          const a = answers[c.row.prelab];
          c.exp.textContent = a ? withUnit(a, c.row.unit) : `Pre-lab ${c.row.prelab}`;
          c.exp.classList.toggle('lab-paper-wait', !a);
        } else {
          c.exp.textContent = show(c.row.expect, c.row.unit);
        }
      }
    }
    fillExpected();
    haveParts();
    wireGrip(grip);
  }

  const MINUS = '−';
  const withUnit = (a, unit) => (unit && !/[a-zA-Z]$/.test(a) ? `${a} ${unit}` : a).replace(/^-/, MINUS);
  function show(v, unit) {
    if (typeof v === 'string') return v.charAt(0).toUpperCase() + v.slice(1);
    const s = (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/^-/, MINUS);
    return unit ? `${s} ${unit}` : s;
  }

  // Equipment: on the board, on the bench (instruments), or not yet.
  function haveParts() {
    const p = current && current.paper;
    if (!p) return;
    const comps = App.state.components;
    for (const it of p.equip) {
      const c = comps.find(x => x.label === it.label);
      const def = c && window.Parts ? Parts.get(c.type) : null;
      const bench = def && def.place && def.place.kind === 'offboard';
      it.state.textContent = c ? (bench ? 'On bench' : 'On board') : 'Not yet';
      it.tr.dataset.have = c ? 'yes' : 'no';
    }
  }

  function nextStep(passed) {
    const p = current.paper;
    const n = current.rows.length;
    const cur = current.rows.find(r => r.status !== 'passed');
    for (const r of current.rows) r.li.toggleAttribute('data-current', r === cur);
    p.gcount.textContent = `${passed}/${n}`;
    p.next.querySelector('.lab-next-count').textContent = `${passed} of ${n}`;
    p.nText.textContent = cur ? `${cur.step.n}. ${cur.step.text}` : 'Every step passed. The lab is complete.';
    p.nHint.textContent = cur ? 'Pull the paper out for Give me, Hint or Explain: they sit at its top.' : '';
    p.el.toggleAttribute('data-complete', !cur);
    if (!cur) current.progress.textContent = `${passed} of ${n} steps passed. Lab complete.`;
    p.nowStep.textContent = cur ? `Step ${cur.step.n} of ${n}` : 'Lab complete';
    p.nowCount.textContent = `${passed} of ${n} passed`;
    p.nowText.textContent = cur ? cur.step.text : 'Every step passed. Finish the questions below, then export your readings.';
    p.nowTools.hidden = !cur;
    p.nowGive.hidden = !(cur && cur.step.give);
    if (!cur || cur.step.n !== p.nowN) {
      // A new current step: its hint starts folded.
      p.nowN = cur ? cur.step.n : null;
      p.nowHint.hidden = !(cur && cur.li.dataset.hint === 'open');
      if (cur) p.nowHint.textContent = cur.step.hint;
    }
  }

  // Give me, Hint and Explain under a step (shown on the current one), and
  // the list of what Give me placed.
  function stepTools(row, sheet) {
    const tools = make('div', 'lab-step-tools');
    const btn = (cls, text, title, fn) => {
      const b = make('button', cls, text);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      b.addEventListener('keydown', e => e.stopPropagation());
      tools.append(b);
      return b;
    };
    if (row.step.give) btn('lab-step-give', 'Give me', 'Build this step on the board for me', () => giveMe(row));
    btn('lab-step-hint-btn', 'Hint', 'Show a hint for this step', () => toggleHint(row));
    btn('lab-step-explain', 'Explain', 'Ask Edison to explain this step', () => explain(row, sheet));
    row.given = make('ul', 'lab-step-given');
    row.given.hidden = true;
    row.li.append(tools, row.given);
  }

  const currentRow = () => current && current.rows.find(r => r.status !== 'passed');

  // Hint opens the step's hint, in its row and in the pinned bar.
  function toggleHint(row) {
    const open = row.li.dataset.hint !== 'open';
    row.li.dataset.hint = open ? 'open' : 'closed';
    const p = current.paper;
    if (p && currentRow() === row) { p.nowHint.textContent = row.step.hint; p.nowHint.hidden = !open; }
  }

  // Explain asks Edison in the chat (an explain ask: an answer, not an edit).
  function explain(row, sheet) {
    if (typeof window.sparkyAsk !== 'function') return;
    window.sparkyAsk(`Explain step ${row.step.n} of ${sheet.code}, "${row.step.text}": why does it matter, and what should I see on the board when it's right? Don't give me the numbers to measure.`,
      { explain: true });
  }

  // A hole's live record for App.placePart / App.finishWire, or a part's pin
  // end ("PS1.0"); null for anything the board doesn't have.
  function endAt(s) {
    const m = /^([A-Z]+\d+)\.(\d+)$/.exec(s);
    if (m) {
      const c = App.state.components.find(x => x.label === m[1]);
      const pm = c && c.pinMeshes && c.pinMeshes[Number(m[2])];
      return pm ? { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm } : null;
    }
    const ref = App.parseHole(s);
    const h = ref && App.state.breadboard.getHole(ref.col, ref.row);
    return h ? { world: h.world.clone(), holeRef: { col: h.col, row: h.row }, pinMesh: null } : null;
  }

  function giveMe(row) {
    const u1 = App.state.components.find(c => c.label === 'U1');
    const holes = u1 && window.Parts ? Object.fromEntries(Parts.legsOf(u1).map(l => [l.pin, l.hole])) : null;
    const g = LabSheets.giveStep(row.step, holes, current.sheet.seat);
    const said = [];
    if (!g) said.push('Give me lays this step out by the TL072\'s pins, so seat U1 across the centre gap with pin 1 in row f (where the lab starts it), then try again.');
    else {
      const taken = App.holeMap();
      const free = s => !/^[a-j]\d+$|^(tp|tn|bp|bn)_\d+$/.test(s) || !taken.has(s);
      // One undo step for what it builds; a step with nothing to build (5 runs) adds none.
      const build = fn => (g.parts.length || g.wires.length || g.set.length ? App.history.batch(fn) : fn());
      build(() => {
        for (const x of g.set) {
          const c = App.state.components.find(y => y.label === x.label);
          if (c) { App.setValues(c, x.values); said.push(x.says); }
        }
        for (const p of g.parts) {
          if (App.state.components.some(c => c.label === p.label)) { said.push(`${p.label} is already on the board, so it stays where you put it.`); continue; }
          if (!p.holes) {
            // An instrument goes on the bench, on its own spot in front of the board (bench.js).
            if (Bench.refusal(p.type, App.state.components)) { said.push(`${p.label} not placed: ${Bench.refusal(p.type, App.state.components)}`); continue; }
            const spot = Bench.spotFor(p.type, Bench.spotsOf(App.state.components), App.batterySpot ? App.batterySpot() : null);
            if (spot && App.placePart(p.type, spot, p.values, { label: p.label })) said.push(p.says);
            continue;
          }
          if (!p.holes.every(free)) { said.push(`${p.label} not placed: ${p.holes.join(' or ')} is already in use.`); continue; }
          const where = p.holes.map(h => { const ref = App.parseHole(h); return ref && App.state.breadboard.getHole(ref.col, ref.row); });
          if (where.every(Boolean) && App.placePart(p.type, where, p.values, { label: p.label })) said.push(p.says);
        }
        for (const w of g.wires) {
          if (![w.from, w.to].every(free)) { said.push(`Skipped (a hole is already in use): ${w.says}`); continue; }
          const a = endAt(w.from), b = endAt(w.to);
          if (!a || !b) continue;
          App.state.wireStart = a;
          App.finishWire(b);
          said.push(w.says);
        }
      });
      if (g.run && !App.simRunning && App.runSimulation) App.runSimulation();
      if (g.says) said.push(g.says);
      // A manual step that was given is done.
      if (row.step.check && row.step.check.kind === 'manual' && (g.parts.length || g.wires.length || g.set.length)) setStatus(row, 'passed');
      haveParts();
      quietCheck();
    }
    row.given.textContent = '';
    for (const t of said) row.given.append(make('li', '', t));
    row.given.hidden = false;
    // The pinned bar says what step it built and where, until the next Give me.
    const p = current.paper;
    if (p) {
      p.nowLast.textContent = '';
      const list = make('ul');
      for (const t of said) list.append(make('li', '', t));
      p.nowLast.append(make('div', 'lab-now-last-head', `Give me, step ${row.step.n}:`), list);
      p.nowLast.hidden = false;
    }
  }

  // The paper's width: 0 tucks it. settle reframes the board once the
  // canvas has its new size.
  function setWidth(w, settle) {
    const p = current && current.paper;
    if (!p) return;
    p.w = w;
    p.el.style.setProperty('--paper-w', `${w}px`);
    p.el.dataset.paper = w ? 'out' : 'tucked';
    document.documentElement.dataset.labPaper = w ? 'out' : 'tucked';
    p.next.hidden = !!w;
    p.grip.setAttribute('aria-valuenow', String(w));
    if (!w) p.tip.hidden = true;
    if (settle) reframeOnResize();
  }

  // The room the paper may take: the window less the folded rail, the grip and the chat.
  function room() {
    const chat = document.getElementById('sparky-panel');
    return window.innerWidth - RAIL - GRIP - (chat ? chat.getBoundingClientRect().width : 0);
  }

  function wireGrip(grip) {
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const p = current.paper;
      p.el.classList.add('lab-paper-drag');
      let moved = false;
      const startX = e.clientX, startW = p.w;
      const move = ev => {
        if (Math.abs(ev.clientX - startX) > 3) moved = true;
        if (!moved) return;
        // The paper's left edge is the folded rail once it is out.
        const w = Math.max(0, Math.min(ev.clientX - RAIL - GRIP / 2, room() - Labs.PAPER_MIN_BOARD));
        setWidth(w, false);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        p.el.classList.remove('lab-paper-drag');
        // A click without a drag toggles; a drag snaps.
        if (!moved) setWidth(startW ? 0 : Labs.PAPER_WIDTH, true);
        else setWidth(Labs.paperWidth(p.w, room()), true);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });
    grip.addEventListener('keydown', e => {
      const p = current.paper;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWidth(p.w ? 0 : Labs.PAPER_WIDTH, true); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 40 : -40;
        setWidth(Labs.paperWidth((p.w || 0) + step, room()) || (step > 0 ? Labs.PAPER_WIDTH : 0), true);
      }
    });
  }

  // The folded rail's names: a tag beside the hovered or focused part.
  function railTip(e) {
    const p = current && current.paper;
    if (!p || !p.w) return;
    const item = e.target.closest && e.target.closest('#sidebar .comp-item');
    if (!item) { p.tip.hidden = true; return; }
    const name = item.querySelector('.comp-item-name');
    const r = item.getBoundingClientRect();
    p.tip.textContent = name ? name.textContent : '';
    p.tip.style.left = `${r.right + 6}px`;
    p.tip.style.top  = `${r.top + r.height / 2}px`;
    p.tip.hidden = !p.tip.textContent;
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.addEventListener('mouseover', railTip);
    sidebar.addEventListener('focusin', railTip);
    sidebar.addEventListener('mouseleave', () => { if (current && current.paper) current.paper.tip.hidden = true; });
    sidebar.addEventListener('focusout', () => { if (current && current.paper) current.paper.tip.hidden = true; });
  }

  // One step's check against a solve's readings (and the paper's written answers).
  function checkRow(row, readings, runMemo) {
    const check = row.step.check;
    if (!check || check.kind === 'manual') return;
    if (check.kind === 'answer' && !current.paper) return;   // classic: ticked by hand
    setStatus(row, LabSheets.evaluate(check, readings, App.state, runMemo, current.paper ? current.paper.written : null));
  }
  function checkAnswers() {
    if (!current) return;
    for (const row of current.rows) if (row.step.check && row.step.check.kind === 'answer') checkRow(row, null, memo);
  }

  // A quiet DC solve between runs: the steps that need no run (a part placed,
  // a value set, a loop closed, a meter's probes on, the supply wired, an
  // answer written) confirm
  // as the board is built.
  // Nothing on the page changes but the sheet. A measure or a peak is read
  // on a Run only, so it keeps its status.
  const QUIET = ['part', 'set', 'flows', 'probes', 'supply', 'answer'];
  function quietCheck() {
    if (!current || App.simRunning || !window.Sim || !window.Readings) return;
    let readings = null;
    try { readings = Readings.from(Sim.analyze(App.state.components, App.state.wires), App.state); } catch { return; }
    for (const row of current.rows) {
      if (row.step.check && QUIET.includes(row.step.check.kind)) checkRow(row, readings, {});
    }
  }

  document.addEventListener('plugged:sim', e => {
    if (!current) return;
    const readings = e.detail && e.detail.readings;
    for (const row of current.rows) checkRow(row, readings, memo);
    const p = current.paper;
    if (!p || !p.dataCells.length) return;
    haveParts();
    const rows = current.sheet.data;
    for (const c of p.dataCells) {
      const r = LabSheets.readData(c.row, rows, readings, App.state, memo);
      if (r.value === null) continue;
      c.sim.textContent = show(r.value, c.row.unit);
      c.sim.dataset.ok = r.ok ? 'yes' : 'no';
    }
  });
  document.addEventListener('plugged:sim-stop', () => { memo = {}; });

  window.LabSheet = { open, close };
})();
