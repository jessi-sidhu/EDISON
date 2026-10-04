// ─────────────────────────────────────────────────────────────
//  edison/sections/grades.js — the course hub's Grades section
//  (a dummy): a table of sample marks from
//  CourseData.grades, and "Push grades to Canvas", which posts to the
//  local server's dummy route (contract "Dummy endpoints").
//
//  Deployed hosting has no Node server, so a 404 or a network error
//  falls back to a local demo sync. The status line reads the same
//  either way and never shows an error.
// ─────────────────────────────────────────────────────────────

(function () {
  const SYNC_URL = '/api/course/canvas/sync';
  const COLUMNS  = [['prelab1', 'Pre-lab 1'], ['lab1', 'Lab 1'], ['lab2', 'Lab 2']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // One decimal, so the points line up in the mono column. A missing mark says so.
  const markCell = v => typeof v === 'number' && Number.isFinite(v)
    ? `<td class="num">${v.toFixed(1)}</td>`
    : '<td class="num missing">Not submitted</td>';

  // The dummy route's answer, or a local one when nothing answers it.
  async function pushToCanvas() {
    try {
      const res = await fetch(SYNC_URL, { method: 'POST', signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const body = await res.json();
        if (body && body.ok && typeof body.syncedAt === 'string') return body;
      }
    } catch { /* no server behind the route (deployed hosting): fall back */ }
    return { demo: true, syncedAt: new Date().toISOString() };
  }

  function render(el, D) {
    el.innerHTML = `
      <h2>Grades</h2>
      <p class="lede">Lab and pre-lab marks for each student. Push them to Canvas when marking is done.</p>
      <div class="sync">
        <button type="button" class="btn push">Push grades to Canvas</button>
        <p class="sync-status" role="status"></p>
      </div>
      <div class="table-wrap">
      <table class="grade-table">
        <caption>Sample data. Names are invented. Marks are out of 10.</caption>
        <thead><tr><th scope="col">Student</th>${COLUMNS.map(([, head]) => `<th scope="col" class="num">${head}</th>`).join('')}</tr></thead>
        <tbody>${D.grades.students.map(s => `
          <tr><th scope="row">${esc(s.name)}</th>${COLUMNS.map(([key]) => markCell(s[key])).join('')}</tr>`).join('')}
        </tbody>
      </table>
      </div>`;

    const push   = el.querySelector('.push');
    const status = el.querySelector('.sync-status');
    push.addEventListener('click', async () => {
      const hadFocus = document.activeElement === push;
      push.disabled = true;
      const sync = await pushToCanvas();
      status.innerHTML = `Synced with Canvas <time datetime="${esc(sync.syncedAt)}">just now</time> (demo)`;
      push.disabled = false;
      if (hadFocus) push.focus();   // disabling a focused button drops focus to <body>
    });
  }

  Course.section('grades', { title: 'Grades', render });
})();
