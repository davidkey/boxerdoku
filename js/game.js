(function () {
  'use strict';

  const THEME = window.BOXER_THEME;
  const R = window.ThemeRender;
  const Gen = window.BoxerGen;

  const EMPTY = 0, MARK = 1, BOXER = 2;
  const STORAGE_KEY = 'boxerdoku:v1';
  const DAILY_EPOCH = new Date(2026, 10, 14); // puzzle #1

  const MODES = {
    daily:  { label: 'Daily',  n: 7 },
    easy:   { label: 'Easy',   n: 5 },
    medium: { label: 'Medium', n: 6 },
    hard:   { label: 'Hard',   n: 7 },
    expert: { label: 'Expert', n: 8 },
    master: { label: 'Master', n: 9 },
  };

  // ---------------------------------------------------------------- storage
  const store = load();
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
    return Object.assign(
      { mode: 'daily', settings: { autoMark: true }, stats: {}, daily: { streak: 0, maxStreak: 0, lastWon: null }, games: {}, seenHelp: false },
      data || {}
    );
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- dates
  function dateKey(d) {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function dailyNumber(d) {
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((a - DAILY_EPOCH) / 86400000) + 1;
  }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateKey(d);
  }

  // ---------------------------------------------------------------- state
  let puzzle = null;   // { n, regions, solution, seed }
  let game = null;     // persisted per-mode record
  let history = [];
  let timerHandle = null;
  let tickStart = 0;

  const $ = (sel) => document.querySelector(sel);
  const board = $('#board');
  const timerEl = $('#timer');

  function startMode(mode, forceNew) {
    store.mode = mode;
    const n = MODES[mode].n;
    let rec = store.games[mode];
    const today = dateKey(new Date());

    if (mode === 'daily') {
      if (!rec || rec.dateKey !== today) {
        rec = newRecord(Gen.hashString('boxerdoku-daily-' + today), n);
        rec.dateKey = today;
      }
    } else if (!rec || forceNew || rec.n !== n) {
      rec = newRecord(Math.floor(Math.random() * 2 ** 31), n);
    }

    store.games[mode] = game = rec;
    puzzle = Gen.generate(n, rec.seed);
    history = [];
    save();
    renderTabs();
    buildBoard();
    update();
    updateSubtitle();
    restartTimer();
  }

  function newRecord(seed, n) {
    return { seed, n, cells: new Array(n * n).fill(EMPTY), elapsed: 0, hints: 0, done: false, counted: false };
  }

  // ---------------------------------------------------------------- board
  let cellEls = [];

  function buildBoard() {
    const { n, regions } = puzzle;
    board.innerHTML = '';
    board.style.setProperty('--n', n);
    board.setAttribute('aria-label', `${n} by ${n} puzzle board`);
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      const g = regions[i];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cell';
      el.dataset.idx = i;
      el.style.setProperty('--region', THEME.regionColors[g % THEME.regionColors.length]);
      if (r === 0 || regions[i - n] !== g) el.classList.add('bt');
      if (r === n - 1 || regions[i + n] !== g) el.classList.add('bb');
      if (c === 0 || regions[i - 1] !== g) el.classList.add('bl');
      if (c === n - 1 || regions[i + 1] !== g) el.classList.add('br');
      cellEls.push(el);
      board.appendChild(el);
    }
  }

  function boxerCells() {
    const boxers = [];
    game.cells.forEach((s, i) => { if (s === BOXER) boxers.push(i); });
    return boxers;
  }

  function computeAutoMarks(boxers) {
    const { n, regions } = puzzle;
    const auto = new Set();
    if (!store.settings.autoMark) return auto;
    for (const b of boxers) {
      const rb = Math.floor(b / n), cb = b % n;
      for (let i = 0; i < n * n; i++) {
        if (i === b || game.cells[i] !== EMPTY) continue;
        const r = Math.floor(i / n), c = i % n;
        if (r === rb || c === cb || regions[i] === regions[b] ||
            (Math.abs(r - rb) <= 1 && Math.abs(c - cb) <= 1)) auto.add(i);
      }
    }
    return auto;
  }

  function update() {
    const boxers = boxerCells();
    const auto = computeAutoMarks(boxers);
    cellEls.forEach((el, i) => {
      const s = game.cells[i];
      const key = s + (auto.has(i) ? 'a' : '');
      if (el.dataset.state !== key) {
        el.dataset.state = key;
        el.innerHTML = '';
        if (s === BOXER) el.appendChild(R.node(R.pieceForRegion(THEME, puzzle.regions[i]), 'piece'));
        else if (s === MARK || auto.has(i)) el.appendChild(R.node(THEME.mark, 'mark'));
      }
      el.classList.toggle('wrong', s === BOXER && !isAnswer(i));
      el.classList.toggle('auto', auto.has(i));
      el.setAttribute('aria-label', cellLabel(i, s));
    });
    $('#count').textContent = `${boxers.length} / ${puzzle.n}`;
    $('#undo').disabled = history.length === 0 || game.done;
    board.classList.toggle('done', game.done);
    if (!game.done && isSolved()) win();
  }

  function cellLabel(i, s) {
    const n = puzzle.n;
    const pos = `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
    return pos + (s === BOXER ? ', boxer' : s === MARK ? ', marked' : ', empty');
  }

  // Puzzles have exactly one solution, so any boxer off it is a mistake.
  function isAnswer(i) {
    return puzzle.solution[Math.floor(i / puzzle.n)] === i % puzzle.n;
  }

  function isSolved() {
    const { n, solution } = puzzle;
    let count = 0;
    for (let i = 0; i < n * n; i++) if (game.cells[i] === BOXER) count++;
    if (count !== n) return false;
    for (let r = 0; r < n; r++) if (game.cells[r * n + solution[r]] !== BOXER) return false;
    return true;
  }

  // ---------------------------------------------------------------- input
  function pushHistory() {
    history.push(game.cells.slice());
    if (history.length > 300) history.shift();
  }

  function setCell(i, s) {
    game.cells[i] = s;
    if (s === BOXER && navigator.vibrate) navigator.vibrate(8);
  }

  function cycle(i) {
    pushHistory();
    const next = (game.cells[i] + 1) % 3;
    setCell(i, next);
    commit();
    if (next === BOXER && !isAnswer(i)) oops(i);
    else pop(i);
  }

  // Immediate feedback for a boxer placed where it can't go.
  function oops(i) {
    const el = cellEls[i];
    el.classList.remove('oops', 'pop');
    void el.offsetWidth;
    el.classList.add('oops');
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    toast('Not there!');
  }

  function commit() {
    save();
    update();
  }

  function pop(i) {
    const el = cellEls[i];
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // Tap cycles empty -> mark -> boxer -> empty. Dragging from an empty cell
  // paints marks; dragging from a marked cell erases marks.
  let drag = null;

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest('.cell');
    return cell && board.contains(cell) ? Number(cell.dataset.idx) : null;
  }

  board.addEventListener('pointerdown', (e) => {
    if (game.done) return;
    const idx = cellFromPoint(e.clientX, e.clientY);
    if (idx === null) return;
    e.preventDefault();
    const s = game.cells[idx];
    drag = { start: idx, last: idx, moved: false, mode: s === EMPTY ? 'paint' : s === MARK ? 'erase' : null, id: e.pointerId };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !drag.mode) return;
    const idx = cellFromPoint(e.clientX, e.clientY);
    if (idx === null || idx === drag.last) return;
    if (!drag.moved) {
      drag.moved = true;
      pushHistory();
      applyDrag(drag.start);
    }
    drag.last = idx;
    applyDrag(idx);
    update();
  });

  function applyDrag(i) {
    if (drag.mode === 'paint' && game.cells[i] === EMPTY) setCell(i, MARK);
    else if (drag.mode === 'erase' && game.cells[i] === MARK) setCell(i, EMPTY);
  }

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (e.type === 'pointercancel') { if (d.moved) commit(); return; }
    if (d.moved) commit();
    else cycle(d.start);
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  // Keyboard support (desktop): Enter / Space on a focused cell.
  board.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || game.done) return;
    const i = Number(cell.dataset.idx), n = puzzle.n;
    const moves = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(i); }
    else if (moves[e.key] !== undefined) {
      const j = i + moves[e.key];
      if (j >= 0 && j < n * n) { e.preventDefault(); cellEls[j].focus(); }
    }
  });
  // Clicks are handled via pointer events; swallow keyboard-generated clicks.
  board.addEventListener('click', (e) => e.preventDefault());

  // ---------------------------------------------------------------- controls
  $('#undo').addEventListener('click', () => {
    if (!history.length || game.done) return;
    game.cells = history.pop();
    commit();
  });

  $('#clear').addEventListener('click', () => {
    if (game.done || game.cells.every((s) => s === EMPTY)) return;
    pushHistory();
    game.cells.fill(EMPTY);
    commit();
  });

  $('#hint').addEventListener('click', () => {
    if (game.done) return;
    const { n, solution } = puzzle;
    let target = -1, msg = '';
    // 1. a boxer in the wrong spot
    target = game.cells.findIndex((s, i) => s === BOXER && !isAnswer(i));
    if (target >= 0) {
      msg = 'That boxer can’t go there';
    } else {
      // 2. a mark covering the answer
      target = game.cells.findIndex((s, i) => s === MARK && isAnswer(i));
      if (target >= 0) msg = 'A boxer belongs under that paw';
    }
    pushHistory();
    if (target >= 0) {
      game.cells[target] = EMPTY;
    } else {
      // 3. place a correct boxer
      const open = [];
      for (let r = 0; r < n; r++) if (game.cells[r * n + solution[r]] !== BOXER) open.push(r * n + solution[r]);
      if (!open.length) { history.pop(); return; }
      target = open[Math.floor(Math.random() * open.length)];
      game.cells[target] = BOXER;
      msg = 'Here’s a good spot';
    }
    game.hints++;
    commit();
    flash(target);
    toast(msg);
  });

  function flash(i) {
    const el = cellEls[i];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  $('#new').addEventListener('click', () => {
    if (store.mode === 'daily') startMode('easy', true);
    else startMode(store.mode, true);
  });

  $('#automark').checked = !!store.settings.autoMark;
  $('#automark').addEventListener('change', (e) => {
    store.settings.autoMark = e.target.checked;
    save();
    update();
  });

  function renderTabs() {
    const tabs = $('#tabs');
    if (!tabs.childElementCount) {
      for (const [key, m] of Object.entries(MODES)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab';
        b.dataset.mode = key;
        b.innerHTML = `<span>${m.label}</span><small>${m.n}×${m.n}</small>`;
        b.addEventListener('click', () => { if (store.mode !== key) startMode(key); });
        tabs.appendChild(b);
      }
    }
    tabs.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.mode === store.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    $('#new').textContent = store.mode === 'daily' ? 'Practice' : 'New puzzle';
  }

  function updateSubtitle() {
    const sub = $('#subtitle');
    if (store.mode === 'daily') {
      const d = new Date();
      sub.textContent = `Daily #${dailyNumber(d)} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else {
      sub.textContent = `${MODES[store.mode].label} · ${puzzle.n}×${puzzle.n}`;
    }
  }

  // ---------------------------------------------------------------- timer
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  }

  function restartTimer() {
    stopTimer();
    timerEl.textContent = fmt(game.elapsed);
    if (game.done || document.hidden) return;
    tickStart = Date.now();
    timerHandle = setInterval(tick, 500);
  }

  function tick() {
    const now = Date.now();
    game.elapsed += now - tickStart;
    tickStart = now;
    timerEl.textContent = fmt(game.elapsed);
  }

  function stopTimer() {
    if (timerHandle) {
      tick();
      clearInterval(timerHandle);
      timerHandle = null;
      save();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (game) {
      // Daily may have rolled over while the app was in the background.
      if (store.mode === 'daily' && game.dateKey !== dateKey(new Date())) startMode('daily');
      else restartTimer();
    }
  });
  window.addEventListener('pagehide', stopTimer);

  // ---------------------------------------------------------------- win
  function win() {
    stopTimer();
    game.done = true;
    const mode = store.mode;
    if (!game.counted) {
      game.counted = true;
      const st = store.stats[mode] || (store.stats[mode] = { won: 0, best: null });
      st.won++;
      if (st.best === null || game.elapsed < st.best) st.best = game.elapsed;
      if (mode === 'daily') {
        const today = game.dateKey;
        const dl = store.daily;
        if (dl.lastWon !== today) {
          dl.streak = dl.lastWon === yesterdayKey() ? dl.streak + 1 : 1;
          dl.maxStreak = Math.max(dl.maxStreak, dl.streak);
          dl.lastWon = today;
        }
      }
    }
    save();
    board.classList.add('done');
    $('#undo').disabled = true;
    celebrate();
    setTimeout(showWin, 900);
  }

  function showWin() {
    const mode = store.mode;
    const st = store.stats[mode];
    const rows = [
      ['Time', fmt(game.elapsed)],
      ['Hints', game.hints],
      ['Best', st && st.best !== null ? fmt(st.best) : '—'],
      mode === 'daily' ? ['Streak', `${store.daily.streak} 🔥`] : ['Solved', st ? st.won : 1],
    ];
    $('#win-stats').innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('#win-title').textContent = game.hints ? 'Good dog!' : 'Best in show!';
    const logo = $('#win-logo');
    logo.innerHTML = '';
    logo.appendChild(R.node(THEME.logo, 'logo-piece'));
    $('#win-next').textContent = mode === 'daily' ? 'Play practice' : 'Next puzzle';
    openDialog('#win');
  }

  $('#win-next').addEventListener('click', () => {
    closeDialog('#win');
    if (store.mode === 'daily') startMode('easy', true);
    else startMode(store.mode, true);
  });

  $('#win-share').addEventListener('click', async () => {
    const title = store.mode === 'daily'
      ? `${THEME.appName} #${dailyNumber(new Date())}`
      : `${THEME.appName} ${MODES[store.mode].label}`;
    const text = `${title} ${R.text(THEME.logo)}\n⏱ ${fmt(game.elapsed)} · ${game.hints ? game.hints + ' hint' + (game.hints > 1 ? 's' : '') : 'no hints'}`
      + (store.mode === 'daily' ? ` · 🔥 ${store.daily.streak}` : '');
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: THEME.appName, text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard'); }
    catch (e) { toast('Couldn’t share'); }
  });

  function celebrate() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = $('#confetti');
    for (let k = 0; k < 28; k++) {
      const piece = THEME.celebrate[k % THEME.celebrate.length];
      const el = R.node(piece, 'confetti');
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDelay = Math.random() * 0.8 + 's';
      el.style.animationDuration = 1.8 + Math.random() * 1.4 + 's';
      el.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      layer.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  }

  // ---------------------------------------------------------------- dialogs / toast
  function openDialog(sel) {
    const d = $(sel);
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  function closeDialog(sel) {
    const d = $(sel);
    if (d.close) d.close(); else d.removeAttribute('open');
  }
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => closeDialog('#' + b.closest('dialog').id)));
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog('#' + d.id); }));

  $('#help-btn').addEventListener('click', () => openDialog('#help'));

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- theme bits in static UI
  function paintStatic() {
    document.title = THEME.appName;
    $('#app-name').textContent = THEME.appName;
    const logo = $('#logo');
    logo.innerHTML = '';
    logo.appendChild(R.node(THEME.logo, 'logo-piece'));
    document.querySelectorAll('[data-piece]').forEach((el) => {
      el.innerHTML = '';
      el.appendChild(R.node(el.dataset.piece === 'mark' ? THEME.mark : THEME.pieces[0], 'inline-piece'));
    });
  }

  // ---------------------------------------------------------------- boot
  paintStatic();
  startMode(MODES[store.mode] ? store.mode : 'daily');
  if (!store.seenHelp) {
    store.seenHelp = true;
    save();
    openDialog('#help');
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
