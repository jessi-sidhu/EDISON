// ─────────────────────────────────────────────────────────────
//  edison/sections/textbook.js — the course hub's Textbook (spec §5.2,
//  plan E7): a contents list, then one chapter at a time. Each chapter
//  opens with a large Barlow Condensed title and a square live figure
//  (the Elodin opener), then numbered sections in STIX with fine-line SVG
//  diagrams (the Synthetic Sciences engravings).
//
//  Text and figure paths come from CourseData.chapters; captions and
//  diagrams live here. A chapter opens in place, with no #anchor: the
//  router sends any hash but #textbook to Home.
// ─────────────────────────────────────────────────────────────

(function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // A framed viewer takes its UI from ?ui= only; nozoom leaves the wheel to the page's scroll.
  const viewerSrc  = f => `../circuit3d/viewer.html?circuit=${f}&ui=edison&nozoom=1`;
  const editorHref = f => `../circuit3d/index.html?ui=edison&open=${f}`;
  // No-break spaces keep a value with its unit ("10 V", "200 000") and a
  // short equation on one line ("10 − 4 − 6 = 0"), as a printed text sets them.
  const NB = ' ';
  const typeset = s => String(s)
    .replace(/(\d) (?=\d{3}\b|[kmµ]?[VAWΩ](?![\w]))/g, `$1${NB}`)
    .replace(/ ([=×/−+]) /g, `${NB}$1${NB}`);

  const LEDE = {
    1: 'How voltage, current and resistance relate, and how much heat a resistor can take.',
    2: 'Two conservation laws that hold in every circuit, and the two-resistor circuit they explain.',
    3: 'An amplifier with enormous gain, tamed by feedback into one you set with two resistors.',
  };

  // What each live figure shows; "Figure n.k." is added when it is drawn.
  const CAPTION = {
    'edison/figures/ohm.sparky':       'A bench supply at 10 V across R1, a 1 kΩ resistor: 10 mA flows.',
    'edison/figures/divider.sparky':   'R1 (1 kΩ) and R2 (1.5 kΩ) in series on a 10 V supply. Column 31, where they meet, sits at 6 V.',
    'edison/figures/inverting.sparky': 'A TL072 on ±12 V from PS1, with R1 as Rin (10 kΩ) and R2 as Rf (100 kΩ). PS2 supplies the 0.5 V input.',
  };

  // ── The engraved diagrams, by section: 1 px graphite lines, no fills ──
  const v   = (s, sub) => `<tspan class="v">${s}</tspan>` + (sub ? `<tspan class="sub" baseline-shift="sub">${sub}</tspan>` : '');
  // A resistor zigzag `len` long from (x, y), across or down.
  const zig = (x, y, len, down) => {
    const st = Math.round(len / 6 * 100) / 100, a = 7, seg = (d, w) => (down ? `l${w} ${d}` : `l${d} ${w}`);
    return `<path d="M${x} ${y}${seg(st / 2, -a)}${[1, 2, 3, 4, 5].map(i => seg(st, i % 2 ? 2 * a : -2 * a)).join('')}${seg(st / 2, -a)}"/>`;
  };
  // The signal-ground symbol: three bars, each shorter.
  const ground = (x, y) => `<path d="M${x - 14} ${y}h28M${x - 9} ${y + 5}h18M${x - 4} ${y + 10}h8"/>`;
  const svg = (label, body) =>
    `<svg viewBox="0 0 400 236" width="400" height="236" role="img" aria-label="${esc(label)}">${body}</svg>`;

  const DIAGRAM = {
    '1.1': { caption: 'Current against voltage. Each resistor is a straight line through zero with slope 1/R, so doubling R halves the current.',
      svg: svg('Current against voltage for 1 kΩ and 2 kΩ',
        '<line x1="56" y1="190" x2="372" y2="190"/><line x1="56" y1="190" x2="56" y2="26"/>' +
        '<polyline points="366,186 372,190 366,194"/><polyline points="52,32 56,26 60,32"/>' +
        `<path d="${[2, 4, 6, 8, 10, 12].map(n => `M${56 + 24 * n} 190v4M52 ${190 - 12 * n}h4`).join('')}"/>` +
        '<path class="guide" d="M56 70H296V190M56 130H296"/>' +
        '<path d="M56 190L344 46"/><path class="dash" d="M56 190L344 118"/>' +
        '<circle class="dot" cx="296" cy="70" r="3"/><circle class="dot" cx="296" cy="130" r="3"/>' +
        [2, 4, 6, 8, 10, 12].map(n => `<text x="${56 + 24 * n}" y="210" text-anchor="middle">${n}</text>` +
          `<text x="46" y="${194 - 12 * n}" text-anchor="end">${n}</text>`).join('') +
        `<text x="372" y="230" text-anchor="end">${v('V')} in volts</text><text x="66" y="32">${v('I')} in mA</text>` +
        '<text x="350" y="50">1 kΩ</text><text x="350" y="124">2 kΩ</text>' +
        '<text x="304" y="90">10 V, 10 mA</text><text x="304" y="150">10 V, 5 mA</text>') },
    '2.2': { caption: 'Around the loop, clockwise: the supply raises the potential by 10 V, R1 and R2 drop 4 V and 6 V, and 10 − 4 − 6 = 0.',
      svg: svg('A loop of a 10 V supply, R1 and R2, with the loop current I',
        '<line x1="70" y1="40" x2="140" y2="40"/>' + zig(140, 40, 80) +
        '<path d="M220 40H290V75"/>' + zig(290, 75, 80, true) + '<path d="M290 155V190H70V133"/><line x1="70" y1="97" x2="70" y2="40"/>' +
        '<circle cx="70" cy="115" r="18"/><circle class="dot" cx="290" cy="58" r="2.5"/><line x1="290" y1="58" x2="330" y2="58"/>' +
        '<circle cx="334" cy="58" r="3.5"/><circle class="dot" cx="180" cy="190" r="2.5"/><line x1="180" y1="190" x2="180" y2="202"/>' +
        ground(180, 202) +
        '<path d="M151.8 104.7A30 30 0 1 1 151.8 125.3"/><polyline points="150.6,132.2 151.8,125.3 157.2,129.8"/>' +
        '<text x="70" y="111" text-anchor="middle">+</text><text x="70" y="128" text-anchor="middle">−</text>' +
        '<text x="44" y="120" text-anchor="end">10 V</text><text x="180" y="22" text-anchor="middle">R1, 1 kΩ</text>' +
        '<text x="134" y="62" text-anchor="middle">+</text><text x="180" y="66" text-anchor="middle">4 V</text>' +
        '<text x="226" y="62" text-anchor="middle">−</text><text x="272" y="86" text-anchor="middle">+</text>' +
        '<text x="266" y="120" text-anchor="end">6 V</text><text x="272" y="156" text-anchor="middle">−</text>' +
        `<text x="308" y="120">R2, 1.5 kΩ</text><text x="343" y="62">${v('V', 'out')}</text>` +
        `<text x="180" y="174" text-anchor="middle">${v('I')} = 4 mA</text>`) },
    '3.2': { caption: 'The inverting amplifier as a schematic. The + input is grounded, so the − input sits at 0 V and the gain is −Rf / Rin.',
      svg: svg('The inverting amplifier: an op-amp with Rin to the − input and Rf from the output back to it',
        '<polygon points="200,70 200,170 290,120"/><line x1="160" y1="95" x2="200" y2="95"/><line x1="160" y1="145" x2="200" y2="145"/>' +
        '<line x1="290" y1="120" x2="360" y2="120"/><circle cx="364" cy="120" r="3.5"/>' +
        '<line x1="29.5" y1="95" x2="90" y2="95"/><circle cx="26" cy="95" r="3.5"/>' + zig(90, 95, 60) +
        '<line x1="150" y1="95" x2="160" y2="95"/><circle class="dot" cx="160" cy="95" r="2.5"/>' +
        '<path d="M160 95V40H230"/>' + zig(230, 40, 60) + '<path d="M290 40H320V120"/><circle class="dot" cx="320" cy="120" r="2.5"/>' +
        '<path d="M160 145V186"/>' + ground(160, 186) +
        '<line x1="245" y1="95" x2="245" y2="80"/><line x1="245" y1="145" x2="245" y2="160"/>' +
        '<text x="210" y="100" text-anchor="middle">−</text><text x="210" y="150" text-anchor="middle">+</text>' +
        '<text x="251" y="84">+12 V</text><text x="251" y="168">−12 V</text><text x="167" y="115">0 V</text>' +
        `<text x="26" y="82" text-anchor="middle">${v('V', 'in')}</text><text x="120" y="80" text-anchor="middle">${v('R', 'in')}</text>` +
        `<text x="260" y="24" text-anchor="middle">${v('R', 'f')}</text><text x="364" y="106" text-anchor="middle">${v('V', 'out')}</text>`) },
  };

  // ── One chapter ──
  const paragraphs = body => String(body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  function live(f, num, inset) {
    return `
      <figure class="tb-live${inset ? ' tb-inset' : ''}">
        <div class="tb-frame"><iframe src="${esc(viewerSrc(f))}" title="Figure ${num}, a live circuit"${inset ? '' : ' loading="lazy"'}></iframe></div>
        <figcaption><span class="tb-fig-n">Figure ${num}.</span> ${typeset(esc(CAPTION[f] || 'A live circuit.'))} Drag to turn the board.</figcaption>
        <a class="btn btn-outline" href="${esc(editorHref(f))}">Open in the editor</a>
      </figure>`;
  }

  function chapter(ch) {
    const figs = [...new Set(ch.sections.map(s => s.figure).filter(Boolean))];
    let k = 1;
    const next = () => `${ch.n}.${k++}`;
    const opener = figs.length ? live(figs[0], next(), true) : '';
    const shown = new Set(figs.slice(0, 1));   // a later figure is drawn in its section
    const sections = ch.sections.map(s => {
      const d = DIAGRAM[s.n];
      const diagram = d ? `<figure class="tb-diagram">${d.svg}<figcaption><span class="tb-fig-n">Figure ${next()}.</span> ${typeset(esc(d.caption))}</figcaption></figure>` : '';
      let extra = '';
      if (s.figure && !shown.has(s.figure)) { shown.add(s.figure); extra = live(s.figure, next(), false); }
      return `
      <section class="tb-section" aria-labelledby="tb-s-${esc(s.n)}">
        <h4 id="tb-s-${esc(s.n)}" tabindex="-1"><span class="tb-sec-n">${esc(s.n)}</span> ${esc(s.title)}</h4>
        <div class="tb-body">${paragraphs(s.body).map(p => `<p>${typeset(esc(p))}</p>`).join('')}</div>
        ${diagram}${extra}
      </section>`;
    }).join('');
    // The opener lists the chapter's sections; a click scrolls to one (no #anchor).
    const contents = `<ol class="tb-in" aria-label="Sections in chapter ${ch.n}">${ch.sections.map(s => `
            <li><button type="button" data-section="${esc(s.n)}"><span class="tb-sec-n">${esc(s.n)}</span> ${esc(s.title)}</button></li>`).join('')}
          </ol>`;
    return `
      <article class="tb-chapter" data-chapter="${ch.n}" aria-labelledby="tb-ch-${ch.n}">
        <header class="tb-opener">
          <div><h3 id="tb-ch-${ch.n}">${esc(ch.title)}</h3>${LEDE[ch.n] ? `<p class="tb-lede">${typeset(esc(LEDE[ch.n]))}</p>` : ''}
          ${contents}</div>
          ${opener}
        </header>${sections}
      </article>`;
  }

  Course.section('textbook', {
    title: 'Textbook',
    render(el, D) {
      el.innerHTML = `
        <h2>Textbook</h2>
        <p class="tb-intro">Three short chapters for the first weeks of the course. Each chapter opens with a live circuit: drag it to turn the board, or open it in the editor and run it.</p>
        <ol class="tb-toc" aria-label="Chapters">${D.chapters.map(ch => `
          <li><button type="button" data-chapter="${ch.n}"><span class="tb-toc-n">${ch.n}</span> ${esc(ch.title)}</button></li>`).join('')}
        </ol>
        <div class="tb-open"></div>`;
      const toc = el.querySelector('.tb-toc'), box = el.querySelector('.tb-open');

      // Opens chapter n in place; the URL stays on #textbook.
      function open(n) {
        const ch = D.chapters.find(c => c.n === n) || D.chapters[0];
        for (const b of toc.querySelectorAll('button')) {
          if (Number(b.dataset.chapter) === ch.n) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        }
        box.innerHTML = chapter(ch);
        if (box.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
      }
      toc.addEventListener('click', e => {
        const b = e.target.closest('button[data-chapter]');
        if (b) open(Number(b.dataset.chapter));
      });
      box.addEventListener('click', e => {
        const b = e.target.closest('button[data-section]');
        const h = b && document.getElementById(`tb-s-${b.dataset.section}`);
        if (h) { h.scrollIntoView({ block: 'start' }); h.focus({ preventScroll: true }); }   // focus follows, hash untouched
      });
      open(D.chapters[0].n);
    },
  });
})();
