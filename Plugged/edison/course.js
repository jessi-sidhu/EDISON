// ─────────────────────────────────────────────────────────────
//  edison/course.js — the ENSC 220 course hub's shell: hash routes
//  (#home, #labs, #textbook, #grades, #ta), the left nav, and the
//  Home and Labs sections, drawn from window.CourseData.
//
//  EXPORTS
//  ───────
//  window.Course.section(id, { title, render(el, data) })  registers a section
//  window.Course.show(id)                                  shows one section
//  Each sections/*.js calls Course.section(...) when it loads.
// ─────────────────────────────────────────────────────────────

(function () {
  const sections = Object.create(null);   // no inherited names: #constructor or #__proto__ fall back to Home
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const labHref = id => `../circuit3d/index.html?lab=${id}&ui=edison`;

  function section(id, def) { sections[id] = { title: def.title, render: def.render, drawn: false }; }

  // An unknown or missing id shows Home. Each section draws once, the first time it shows.
  function show(id) {
    if (!sections[id]) id = 'home';
    for (const el of document.querySelectorAll('main > [data-route]')) {
      const on = el.dataset.route === id;
      el.hidden = !on;
      if (on && !sections[id].drawn) { sections[id].render(el, window.CourseData); sections[id].drawn = true; }
    }
    for (const a of document.querySelectorAll('.side nav a')) {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    document.title = `${sections[id].title}: ENSC 220`;
  }

  // ── Home: this week's procedure card and the announcements ──
  // The steps are Lab 2's lab sheet (../circuit3d/labs/sheets.js), the ones
  // the editor checks; the statuses are a sample student's, by step, and
  // any step past them is Not yet. The live sheet is in the editor.
  const SAMPLE = { lab: 'lab2', stage: 'Build', status: 'building',
                   pills: ['Passed', 'Passed', 'Check failed'] };
  const STAGES = ['Pre-lab', 'Build', 'Measure', 'Analyze', 'Submit'];
  const PILL   = { 'Passed': 'passed', 'Not yet': 'pending', 'Check failed': 'failed' };

  function renderHome(el, D) {
    const lab = D.labs.find(l => l.id === SAMPLE.lab);
    const sheet = window.LabSheets ? LabSheets.get(SAMPLE.lab) : null;
    const steps = sheet ? sheet.steps : [];
    const n = Number(lab.code.slice(4));
    el.innerHTML = `
      <h2>This week</h2>
      <article class="procedure-card">
        <div class="card-head">
          <span class="card-code">${esc(lab.code)}</span>
          <h3>${esc(lab.title)}</h3>
          <span class="card-week">${esc(sheet ? sheet.week : '')}</span>
          <p class="card-sample">Sample progress</p>
        </div>
        <ol class="steps">${steps.map((st, i) => {
          const state = SAMPLE.pills[i] || 'Not yet';
          return `
          <li><span class="step-n">${st.n}</span><span class="step-text">${esc(st.text)}</span><span class="pill ${PILL[state]}">${state}</span></li>`;
        }).join('')}
        </ol>
        <div class="card-foot">
          <p class="card-status">Status: ${esc(SAMPLE.status)}</p>
          <ol class="stepper" aria-label="Lab stages">${STAGES.map(s =>
            `<li${s === SAMPLE.stage ? ' aria-current="step"' : ''}>${s}</li>`).join('')}</ol>
          <p class="card-actions">
            <a class="btn" href="${esc(labHref(lab.id))}">Open Lab ${n}</a>
            <a class="btn btn-outline" href="#labs">All labs</a>
          </p>
        </div>
      </article>
      <h2>Announcements</h2>
      <ul class="announcements">${D.announcements.map(a => `
        <li><span class="ann-date">${esc(a.date)}</span><p>${esc(a.text)}</p></li>`).join('')}
      </ul>`;
  }

  // ── Labs: Labs 1–5, open ones link to the editor, locked ones say when they open ──
  const STATUS = { done: 'Submitted', open: 'Open' };

  function renderLabs(el, D) {
    el.innerHTML = `
      <h2>Labs</h2>
      <p class="lede">Each lab opens on the board with its lab sheet beside it. The sheet checks your readings as you build.</p>
      <div class="table-wrap">
      <table class="labs">
        <thead><tr><th scope="col">Lab</th><th scope="col">Title</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
        <tbody>${D.labs.map(l => {
          const locked = l.status === 'locked';
          const action = locked ? '' : `<a href="${esc(labHref(l.id))}">Open Lab ${Number(l.code.slice(4))}</a>`;
          return `
          <tr${locked ? ' aria-disabled="true"' : ''}><td class="lab-code">${esc(l.code)}</td><td>${esc(l.title)}</td><td>${esc(l.due)}</td><td>${esc(locked ? l.opens : STATUS[l.status])}</td><td>${action}</td></tr>`;
        }).join('')}
        </tbody>
      </table>
      </div>`;
  }

  section('home', { title: 'Home', render: renderHome });
  section('labs', { title: 'Labs', render: renderLabs });

  window.Course = { section, show };
  const route = () => show(location.hash.slice(1) || 'home');
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);   // after every sections/*.js has registered
})();
