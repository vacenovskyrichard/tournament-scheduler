'use strict';

// ─── App state ─────────────────────────────────────────────────────────────
const state = {
  step: 1,
  sport: 'beach_volleyball',
  teams: ['Tým A', 'Tým B', 'Tým C', 'Tým D'],
  courts: 2,
  startTime: '09:00',
  endTime: '13:00',
  mode: 'print',
  options: [],
  selectedOption: null,
  schedule: [],
  scores: {},
  swiss: null,        // Swiss state (online Swiss only): { totalRounds, courts, fmtId, matchSeq, rounds }
};

const SPORTS = {
  beach_volleyball: { label: 'Plážový volejbal', emoji: '🏐' },
  tennis:           { label: 'Tenis',             emoji: '🎾' },
  padel:            { label: 'Padel',             emoji: '🎾' },
  volleyball:       { label: 'Volejbal',          emoji: '🏐' },
  badminton:        { label: 'Badminton',         emoji: '🏸' },
};

// ─── Persistence (localStorage) ──────────────────────────────────────────────
// We persist only the *inputs* (sport, teams, parameters, mode), the entered
// scores, the current step, and which option was selected. The derived schedule
// holds Date objects that don't survive JSON, so it is deterministically rebuilt
// from these inputs on load (matchId + time generation are reproducible).
const STORAGE_KEY = 'tourneymaker.state.v1';

function saveState() {
  try {
    const snapshot = {
      v: 1,
      step:      state.step,
      sport:     state.sport,
      teams:     state.teams,
      courts:    state.courts,
      startTime: state.startTime,
      endTime:   state.endTime,
      mode:      state.mode,
      scores:    state.scores,
      selectedOptionIndex:
        state.selectedOption && state.options.length
          ? state.options.indexOf(state.selectedOption)
          : null,
      // Swiss rounds are dynamic (not reproducible from inputs), so persist them.
      swiss:     state.swiss,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_) {
    // Storage disabled (private mode) or full — degrade silently to no-persist.
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    return snap && snap.v === 1 ? snap : null;
  } catch (_) {
    return null;
  }
}

function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// ─── DOM helpers ───────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Step navigation ───────────────────────────────────────────────────────
function goToStep(n) {
  state.step = n;
  $$('.step-panel').forEach(el => el.classList.add('hidden'));
  $(`#step${n}`).classList.remove('hidden');
  $$('.step-indicator').forEach((el, i) => {
    el.classList.toggle('active',   i + 1 === n);
    el.classList.toggle('done',     i + 1 < n);
    el.classList.toggle('upcoming', i + 1 > n);
  });
  // Wider main-content on step 3 so the bracket can fit without horizontal scroll.
  $('.main-content').classList.toggle('wide-content', n === 3);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  saveState();
}

// ─── Step 1: Setup ─────────────────────────────────────────────────────────
function renderStep1() {
  renderSportSelector();
  renderTeamList();
  $('#courts').value    = state.courts;
  $('#startTime').value = state.startTime;
  $('#endTime').value   = state.endTime;
  $(`input[name="mode"][value="${state.mode}"]`).checked = true;
  updateAvailableTime();
}

function renderSportSelector() {
  const container = $('#sportSelector');
  container.innerHTML = Object.entries(SPORTS).map(([key, val]) => `
    <button class="sport-btn ${state.sport === key ? 'selected' : ''}" data-sport="${key}">
      <span class="sport-emoji">${val.emoji}</span>
      <span>${val.label}</span>
    </button>
  `).join('');
  container.querySelectorAll('.sport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sport = btn.dataset.sport;
      renderSportSelector();
      saveState();
    });
  });
}

function renderTeamList() {
  const container = $('#teamList');
  container.innerHTML = state.teams.map((name, i) => `
    <div class="team-row" data-index="${i}">
      <span class="team-num">${i + 1}.</span>
      <input type="text" class="team-input" value="${escapeHtml(name)}"
             placeholder="Název týmu ${i + 1}" data-index="${i}" />
      <button class="btn-remove-team" data-index="${i}" title="Odebrat tým">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.team-input').forEach(inp => {
    inp.addEventListener('input', e => {
      state.teams[+e.target.dataset.index] = e.target.value;
      saveState();
    });
  });
  container.querySelectorAll('.btn-remove-team').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = +e.currentTarget.dataset.index;
      if (state.teams.length > 2) {
        state.teams.splice(idx, 1);
        renderTeamList();
        updateAvailableTime();
        saveState();
      }
    });
  });
  updateTeamCount();
}

function addTeam() {
  state.teams.push(`Tým ${String.fromCharCode(65 + state.teams.length)}`);
  renderTeamList();
  updateAvailableTime();
  saveState();
  const inputs = $$('.team-input');
  inputs[inputs.length - 1]?.focus();
  inputs[inputs.length - 1]?.select();
}

function updateTeamCount() {
  const n = state.teams.length;
  $('#teamCount').textContent = `${n} týmů`;
  const warning = $('#teamWarning');
  if (n < 3) {
    warning.textContent = '⚠ Minimum jsou 3 týmy.';
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

function updateAvailableTime() {
  const [sh, sm] = state.startTime.split(':').map(Number);
  const [eh, em] = state.endTime.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin <= 0) {
    $('#availableTime').textContent = '⚠ Neplatný čas';
    return;
  }
  $('#availableTime').textContent = `Dostupný čas: ${minutesToHHMM(totalMin)}`;
}

function validateStep1(silent = false) {
  const [sh, sm] = state.startTime.split(':').map(Number);
  const [eh, em] = state.endTime.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  const fail = (msg) => { if (!silent) showToast(msg, 'error'); return false; };
  if (state.teams.length < 3) return fail('Zadej alespoň 3 týmy.');
  if (state.teams.some(t => !t.trim())) return fail('Všechny týmy musí mít název.');
  if (totalMin < 30) return fail('Turnaj musí trvat alespoň 30 minut.');
  return true;
}

// ─── Step 2: Options ───────────────────────────────────────────────────────
// Deterministic given the current inputs — used both for the user action and for
// restoring the saved state on load.
function computeOptions() {
  const today = new Date();
  const [sh, sm] = state.startTime.split(':').map(Number);
  const [eh, em] = state.endTime.split(':').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
  return generateOptions(state.teams, state.courts, start, end, state.mode === 'online');
}

function generateAndShowOptions() {
  if (!validateStep1()) return;

  state.options = computeOptions();

  if (state.options.length === 0) {
    showToast('Žádný formát se nevejde do zadaného času. Zkus delší čas nebo jiný počet kurtů.', 'error');
    return;
  }

  renderOptions();
  goToStep(2);
}

function renderOptions() {
  const container = $('#optionsList');
  if (state.options.length === 0) {
    container.innerHTML = '<p class="no-options">Žádné možnosti nenalezeny. Zkus jiné parametry.</p>';
    return;
  }

  const [sh, sm] = state.startTime.split(':').map(Number);
  const startDate = new Date(2000, 0, 1, sh, sm);

  container.innerHTML = state.options.map((opt, i) => {
    const pct        = Math.round(opt.fitnessScore * 100);
    const fmtColor   = opt.matchFormat.sortPriority <= 2 ? 'badge-preferred' : 'badge-normal';
    const estEnd     = new Date(startDate.getTime() + opt.estimatedMinutes * 60000);
    const fitnessClass =
      pct >= 85 ? 'fitness-great' :
      pct >= 65 ? 'fitness-good'  :
                  'fitness-low';

    return `
    <div class="option-card ${i === 0 ? 'option-best' : ''}" data-index="${i}">
      ${i === 0 ? '<div class="best-badge">⭐ Nejlepší shoda</div>' : ''}
      <div class="option-header">
        <div class="option-title">${opt.tournamentName}</div>
        <span class="match-format-badge ${fmtColor}">${opt.matchFormat.shortName}</span>
      </div>
      <p class="option-desc">${opt.tournamentDesc}</p>
      <div class="option-stats">
        <div class="stat">
          <span class="stat-label">⏱ Odhadovaný čas</span>
          <span class="stat-value">${minutesToHHMM(opt.estimatedMinutes)}</span>
          <span class="stat-sub">Konec ~${formatTime(estEnd)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">🎮 Zápasů celkem</span>
          <span class="stat-value">${opt.totalMatches}</span>
        </div>
        <div class="stat">
          <span class="stat-label">📊 Zápasy na tým</span>
          <span class="stat-value">${opt.minMatchesPerTeam === opt.maxMatchesPerTeam
            ? opt.minMatchesPerTeam
            : `${opt.minMatchesPerTeam}–${opt.maxMatchesPerTeam}`}</span>
          <span class="stat-sub">${opt.minMatchesPerTeam === opt.maxMatchesPerTeam
            ? 'každý hraje stejně'
            : `min ${opt.minMatchesPerTeam}, max ${opt.maxMatchesPerTeam}`}</span>
        </div>
        <div class="stat">
          <span class="stat-label">📈 Využití času</span>
          <span class="stat-value ${fitnessClass}">${pct}%</span>
        </div>
      </div>
      <div class="format-rules">
        <strong>Formát zápasu:</strong> ${opt.matchFormat.rules}
        · <em>~${opt.matchFormat.duration} min / zápas</em>
      </div>
      <button class="btn btn-select" data-index="${i}">Vybrat tento formát →</button>
    </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-select').forEach(btn => {
    btn.addEventListener('click', e => selectOption(+e.currentTarget.dataset.index));
  });
}

function buildScheduleForSelected() {
  const [sh, sm] = state.startTime.split(':').map(Number);
  const today    = new Date();
  const start    = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
  return buildSchedule(state.selectedOption, state.teams, state.courts, start);
}

function selectOption(idx) {
  state.selectedOption = state.options[idx];
  if (state.selectedOption.type === 'swiss') {
    initSwiss(state.selectedOption);          // dynamic — builds round 1, resets scores
  } else {
    state.swiss    = null;
    state.schedule = buildScheduleForSelected();
    state.scores   = {};
  }
  renderSchedule();
  goToStep(3);
}

// Like selectOption, but keeps the already-restored scores (used on page load).
// Swiss is restored separately in restoreState() from the persisted rounds.
function restoreSelectedOption(idx) {
  state.selectedOption = state.options[idx];
  state.swiss = null;
  state.schedule = buildScheduleForSelected();
  renderSchedule();
}

// ─── Swiss system (online interactive) ──────────────────────────────────────
function initSwiss(option) {
  state.scores = {};
  state.schedule = [];
  state.swiss = {
    teams:       [...state.teams],
    totalRounds: option.swissRounds,
    courts:      state.courts,
    fmtId:       option.matchFormat.id,
    matchSeq:    1,
    rounds:      [],
  };
  const { pairs, byeTeam } = swissInitialPairing(state.swiss.teams);
  swissAppendRound(pairs, byeTeam);
}

// Turn name pairs into match objects with stable sequential ids and append as a
// new round. Courts cycle 1..C; bye (if any) is recorded on the round.
function swissAppendRound(pairs, byeTeam) {
  const sw = state.swiss;
  const matches = pairs.map((p, i) => ({
    id:    sw.matchSeq++,
    t1:    p[0],
    t2:    p[1],
    court: (i % sw.courts) + 1,
  }));
  sw.rounds.push({ matches, byeTeam: byeTeam || null });
}

function swissRoundComplete(round) {
  return round.matches.every(m => matchWinner(state.scores, m.id, state.swiss.fmtId) !== 0);
}

function generateNextSwissRound() {
  const sw = state.swiss;
  if (!sw) return;
  if (sw.rounds.length >= sw.totalRounds) {
    showToast('Všechna plánovaná kola už byla vygenerována.', 'info');
    return;
  }
  const last = sw.rounds[sw.rounds.length - 1];
  if (!swissRoundComplete(last)) {
    showToast('Nejdřív doplň všechny výsledky aktuálního kola.', 'error');
    return;
  }

  const standings  = computeSwissStandings(sw, state.scores, sw.fmtId);
  const history     = [];
  const byeHistory = new Set();
  for (const r of sw.rounds) {
    if (r.byeTeam) byeHistory.add(r.byeTeam);
    for (const m of r.matches) history.push([m.t1, m.t2]);
  }
  const { pairs, byeTeam } = swissPairNextRound(standings, history, byeHistory);
  swissAppendRound(pairs, byeTeam);
  saveState();
  renderSwissView();
  showToast(`Kolo ${sw.rounds.length} vygenerováno.`, 'success');
}

// Per-set score inputs for one side of a Swiss match.
function swissScoreInputs(matchId, fmtId, side) {
  const numSets = setsForFormat(fmtId);
  const labels  = numSets === 1 ? [''] : ['1.set', '2.set', 'TB'];
  let html = '';
  for (let s = 0; s < numSets; s++) {
    const key = `${matchId}_${side}_${s}`;
    const val = state.scores[key] ?? '';
    html += `<input type="number" min="0" max="99" class="sw-score-inp"
                    data-key="${key}" value="${val}" title="${labels[s]}" placeholder="—">`;
  }
  return html;
}

function renderSwissView() {
  const sw  = state.swiss;
  const el  = $('#swissView');
  if (!sw) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');

  const fmtId      = sw.fmtId;
  const standings  = computeSwissStandings(sw, state.scores, fmtId);
  const roundsDone = sw.rounds.length;
  const allRounds  = roundsDone >= sw.totalRounds;
  const lastDone   = swissRoundComplete(sw.rounds[roundsDone - 1]);
  const finished   = allRounds && lastDone;
  const rankByName = new Map(standings.map((s, i) => [s.name, i + 1]));

  // ── Standings table ──
  let standHtml = `
    <div class="card">
      <div class="card-title">📊 Průběžné pořadí ${finished ? '— konečné 🏁' : ''}</div>
      <div class="table-wrapper">
        <table class="sw-standings">
          <thead><tr>
            <th>#</th><th class="sw-th-team">Tým</th>
            <th title="Výhry">V</th><th title="Prohry">P</th><th title="Volný los">Bye</th>
            <th title="Body (výhra = 1)">Body</th>
            <th title="Buchholz — součet bodů soupeřů">Buch.</th>
            <th title="Rozdíl míčů">±</th>
          </tr></thead>
          <tbody>`;
  standings.forEach((s, i) => {
    const medal = finished && i === 0 ? '🥇' : finished && i === 1 ? '🥈' : finished && i === 2 ? '🥉' : '';
    standHtml += `<tr class="${i === 0 && finished ? 'sw-rank-1' : ''}">
      <td class="sw-rank">${i + 1}.</td>
      <td class="sw-team-name">${medal} ${escapeHtml(s.name)}</td>
      <td>${s.wins}</td><td>${s.losses}</td><td>${s.byes || ''}</td>
      <td class="sw-pts">${s.points}</td>
      <td>${s.buchholz}</td>
      <td>${s.diff > 0 ? '+' + s.diff : s.diff}</td>
    </tr>`;
  });
  standHtml += `</tbody></table></div></div>`;

  // ── Rounds ──
  let roundsHtml = '';
  sw.rounds.forEach((round, ri) => {
    const complete = swissRoundComplete(round);
    let rows = '';
    for (const m of round.matches) {
      const w = matchWinner(state.scores, m.id, fmtId);
      rows += `
        <div class="sw-match">
          <span class="sw-court">Kurt ${m.court}</span>
          <span class="sw-side sw-side-l ${w === 1 ? 'sw-won' : ''}">${escapeHtml(m.t1)}</span>
          <span class="sw-scores">${swissScoreInputs(m.id, fmtId, 1)}</span>
          <span class="sw-colon">:</span>
          <span class="sw-scores">${swissScoreInputs(m.id, fmtId, 2)}</span>
          <span class="sw-side sw-side-r ${w === 2 ? 'sw-won' : ''}">${escapeHtml(m.t2)}</span>
        </div>`;
    }
    if (round.byeTeam) {
      rows += `<div class="sw-bye">🆓 <strong>${escapeHtml(round.byeTeam)}</strong> — volný los (bye, +1 výhra)</div>`;
    }
    roundsHtml += `
      <div class="card sw-round ${complete ? 'sw-round-done' : ''}">
        <div class="card-title">
          🔁 Kolo ${ri + 1} <span class="sw-round-of">z ${sw.totalRounds}</span>
          ${complete ? '<span class="sw-done-badge">✓ kompletní</span>' : ''}
        </div>
        ${rows}
      </div>`;
  });

  // ── Action / status ──
  let actionHtml = '';
  if (finished) {
    actionHtml = `<div class="sw-status sw-status-done">🏁 Turnaj dokončen — konečné pořadí je nahoře.</div>`;
  } else if (allRounds && !lastDone) {
    actionHtml = `<div class="sw-status">Doplň výsledky posledního kola pro konečné pořadí.</div>`;
  } else {
    const ready = lastDone;
    actionHtml = `
      <div class="btn-row no-print">
        <button class="btn btn-primary" id="btnSwissNext" ${ready ? '' : 'disabled'}>
          ➕ Generovat kolo ${roundsDone + 1}
        </button>
      </div>
      ${ready ? '' : '<div class="sw-status">Doplň všechny výsledky aktuálního kola a pak vygeneruj další.</div>'}`;
  }

  el.innerHTML = standHtml + roundsHtml + actionHtml;

  // ── Wire score inputs (re-render on each edit, preserving focus) ──
  el.querySelectorAll('.sw-score-inp').forEach(inp => {
    inp.addEventListener('input', e => {
      const v = e.target.value;
      if (v === '' || /^\d{1,2}$/.test(v)) {
        state.scores[e.target.dataset.key] = v;
        saveState();
      }
      withFocusPreserve(() => renderSwissView());
    });
  });
  $('#btnSwissNext')?.addEventListener('click', generateNextSwissRound);
}

// ─── Step 3: Schedule ──────────────────────────────────────────────────────
function renderSchedule() {
  const opt = state.selectedOption;
  if (!opt) return;

  // Header
  $('#scheduleTitle').textContent =
    `${SPORTS[state.sport].emoji} ${SPORTS[state.sport].label} — ${opt.tournamentName}`;
  $('#scheduleSubtitle').textContent =
    `${state.teams.length} týmů · ${state.courts} kurt${state.courts > 1 ? 'y/ů' : ''} · ${opt.matchFormat.shortName}`;

  // Summary pills
  const [sh, sm] = state.startTime.split(':').map(Number);
  const start = new Date(2000, 0, 1, sh, sm);
  const estEnd = new Date(start.getTime() + opt.estimatedMinutes * 60000);
  $('#scheduleSummary').innerHTML = `
    <span class="pill">⏰ ${state.startTime} – ~${formatTime(estEnd)}</span>
    <span class="pill">🎮 ${opt.totalMatches} zápasů</span>
    <span class="pill">📊 ${opt.minMatchesPerTeam === opt.maxMatchesPerTeam
      ? opt.minMatchesPerTeam + ' zápasů/tým'
      : opt.minMatchesPerTeam + '–' + opt.maxMatchesPerTeam + ' zápasů/tým'}</span>
    <span class="pill">${opt.matchFormat.name}</span>
  `;

  // Swiss takes over step 3 with its own interactive view.
  if (opt.type === 'swiss') {
    $('#scheduleCard').classList.add('hidden');
    $('#legendCard').classList.add('hidden');
    $('#groupStandings').innerHTML = '';
    $('#bracketView').innerHTML = '';
    renderSwissView();
    return;
  }

  $('#swissView').classList.add('hidden');
  $('#swissView').innerHTML = '';
  $('#scheduleCard').classList.remove('hidden');
  $('#legendCard').classList.remove('hidden');

  renderScheduleTable();
  renderGroupStandings();
  renderBracket();
  renderLegend();
}

// ─── Schedule table ────────────────────────────────────────────────────────
// Compact grid: rows = time slots, columns = courts. Each cell shows the match
// that runs on that court in that slot. Whole tournament typically fits a single
// A4 page this way.
function renderScheduleTable() {
  const schedule = state.schedule;
  const numCourts = state.courts;

  // Group matches by time slot (preserve schedule order)
  const slots = new Map();   // timeKey → { time, phase, roundName, matches[court] }
  for (const m of schedule) {
    const t = formatTime(m.time);
    if (!slots.has(t)) {
      slots.set(t, { time: t, phase: m.phase, roundName: m.roundName, matches: {} });
    }
    slots.get(t).matches[m.court] = m;
  }

  // Build header: Čas | Kolo | Kurt 1 | … | Kurt N
  const head = $('#scheduleHead');
  if (head) {
    const courtCols = [];
    for (let c = 1; c <= numCourts; c++) courtCols.push(`<th>Kurt ${c}</th>`);
    head.innerHTML = `<tr>
      <th class="th-time">Čas</th>
      <th class="th-round">Kolo / Fáze</th>
      ${courtCols.join('')}
    </tr>`;
  }

  // Build rows
  let html = '';
  let lastPhase = null;
  for (const slot of slots.values()) {
    // Phase transition separator
    if (slot.phase !== lastPhase && lastPhase !== null) {
      const isTransition =
        (lastPhase === 'pool'      && ['semifinal', 'bracket', 'losers', 'final'].includes(slot.phase)) ||
        (lastPhase === 'bracket'   && slot.phase === 'losers') ||
        (lastPhase === 'losers'    && slot.phase === 'final')  ||
        (lastPhase === 'semifinal' && slot.phase === 'final');
      if (isTransition) {
        const label =
          slot.phase === 'losers'    ? '⬇ Losers Bracket' :
          slot.phase === 'bracket'   ? '🏆 Pavouk (Winners Bracket)' :
          slot.phase === 'semifinal' ? '🏆 Vyřazovací část' :
          slot.phase === 'final'     ? '🥇 Finálová část' : '🔄 Další fáze';
        html += `<tr class="phase-separator">
          <td colspan="${numCourts + 2}"><span class="phase-label">${label}</span></td>
        </tr>`;
      }
    }
    lastPhase = slot.phase;

    const cells = [];
    for (let c = 1; c <= numCourts; c++) {
      const m = slot.matches[c];
      if (!m) { cells.push('<td class="court-empty">—</td>'); continue; }
      cells.push(`<td class="match-cell">
        <span class="match-team">${escapeHtml(m.team1Label)}</span>
        <span class="match-vs">×</span>
        <span class="match-team">${escapeHtml(m.team2Label)}</span>
      </td>`);
    }

    html += `<tr class="match-row row-${slot.phase}">
      <td class="time-cell">${slot.time}</td>
      <td class="round-cell">${escapeHtml(slot.roundName)}</td>
      ${cells.join('')}
    </tr>`;
  }

  $('#scheduleBody').innerHTML = html;
}

// ─── Group standings ───────────────────────────────────────────────────────
function getGroupTeams(option, teamNames) {
  const t      = teamNames;
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const groups = [];

  if (option.type === 'pool_knockout') {
    let idx = 0;
    for (let p = 0; p < option.numPools; p++) {
      const teams = [];
      for (let i = 0; i < option.poolSizes[p]; i++) teams.push(t[idx++]);
      groups.push({ label: labels[p], teams, groupType: 'rr' });
    }
  } else if (option.type === 'modified_pool') {
    let idx = 0;
    for (let g = 0; g < option.g4; g++) {
      groups.push({ label: labels[g], teams: t.slice(idx, idx + 4), groupType: 'mod4' });
      idx += 4;
    }
    for (let g = 0; g < option.g3; g++) {
      groups.push({ label: labels[option.g4 + g], teams: t.slice(idx, idx + 3), groupType: 'rr3' });
      idx += 3;
    }
  }

  return groups;
}

function computeGroupStandings(groups, schedule, scores, fmtId) {
  return groups.map(grp => {
    const teamSet   = new Set(grp.teams);
    const standings = grp.teams.map(name => ({ name, w: 0, l: 0, d: 0, played: 0 }));

    for (const m of schedule) {
      if (m.phase !== 'pool') continue;
      if (!teamSet.has(m.team1Label) || !teamSet.has(m.team2Label)) continue;
      const winner = matchWinner(scores, m.id, fmtId);
      if (winner === 0) continue;
      const t1 = standings.find(s => s.name === m.team1Label);
      const t2 = standings.find(s => s.name === m.team2Label);
      if (!t1 || !t2) continue;
      t1.played++; t2.played++;
      if (winner === 1) { t1.w++; t2.l++; }
      else              { t2.w++; t1.l++; }
    }

    standings.sort((a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name));
    return { ...grp, standings };
  });
}

// Build a label → real team name map for auto-propagation through the bracket.
// Resolves "1. Sk.A" → group leader, "Vít. P1" → KO match winner, etc.
function buildResolvedNames(option, schedule, scores) {
  const resolved = {};
  if (!option || !['pool_knockout', 'modified_pool'].includes(option.type)) return resolved;

  const fmtId = option.matchFormat.id;

  // Group ranks → "1. Sk.X", "2. Sk.X", …
  const groups = getGroupTeams(option, state.teams);
  const withStandings = computeGroupStandings(groups, schedule, scores, fmtId);
  for (const grp of withStandings) {
    grp.standings.forEach((s, rank) => {
      if (s.played > 0) {
        resolved[`${rank + 1}. Sk.${grp.label}`] = s.name;
      }
    });
  }

  // KO winners / losers → "Vít. P1", "Por. SF1", …
  // Iterate to fixed point so winners propagate through multiple rounds.
  const koMatches = schedule.filter(m =>
    ['semifinal', 'final', 'bracket'].includes(m.phase) && m.koLabel
  );
  const isPlaceholder = s => /^(\d+\. Sk\.|Vít\.\s|Por\.\s)/.test(String(s || ''));

  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (const m of koMatches) {
      const t1 = resolved[m.team1Label] || m.team1Label;
      const t2 = resolved[m.team2Label] || m.team2Label;
      if (isPlaceholder(t1) || isPlaceholder(t2)) continue;
      const winner = matchWinner(scores, m.id, fmtId);
      if (winner === 0) continue;
      const winnerName = winner === 1 ? t1 : t2;
      const loserName  = winner === 1 ? t2 : t1;
      const wk = `Vít. ${m.koLabel}`;
      const lk = `Por. ${m.koLabel}`;
      if (resolved[wk] !== winnerName) { resolved[wk] = winnerName; changed = true; }
      if (resolved[lk] !== loserName)  { resolved[lk] = loserName;  changed = true; }
      // Legacy SF feeder variants used by pushKnockout:
      if (/^SF\d+$/.test(m.koLabel)) {
        const n = m.koLabel.slice(2);
        if (resolved[`Vít. SF ${n}`] !== winnerName) { resolved[`Vít. SF ${n}`] = winnerName; changed = true; }
        if (resolved[`Por. SF ${n}`] !== loserName)  { resolved[`Por. SF ${n}`] = loserName;  changed = true; }
      }
    }
    if (!changed) break;
  }
  return resolved;
}

function renderGroupStandings() {
  const opt = state.selectedOption;
  const el  = $('#groupStandings');
  if (!opt || !['pool_knockout', 'modified_pool'].includes(opt.type)) {
    el.innerHTML = ''; return;
  }

  const isOnline = state.mode === 'online';
  const fmtId    = opt.matchFormat.id;
  const numSets  = setsForFormat(fmtId);
  const groups   = getGroupTeams(opt, state.teams);
  const withStandings = computeGroupStandings(groups, state.schedule, state.scores, fmtId);

  const seedOf = name => state.teams.indexOf(name) + 1;
  const setLabels = numSets === 1 ? [''] : ['1.set', '2.set', 'TB'];

  let html = '<div class="card"><div class="card-title">📊 Skupinové tabulky</div><div class="groups-stack">';

  for (const grp of withStandings) {
    // 4-team modified-format groups get a mini bracket instead of a cross-table:
    // M1 (1v4), M2 (2v3), then M3 (winners → 1./2.) and M4 (losers → 3./4.).
    if (grp.groupType === 'mod4') {
      html += renderModMiniBracket(grp, { fmtId, numSets, setLabels, isOnline, seedOf });
      continue;
    }

    const teams = grp.teams;
    const N     = teams.length;

    // Build N×N match matrix using pool matches that involve only this group's teams
    const matchMatrix = Array.from({ length: N }, () => new Array(N).fill(null));
    const teamSet = new Set(teams);
    const matches = state.schedule.filter(m =>
      m.phase === 'pool' && teamSet.has(m.team1Label) && teamSet.has(m.team2Label)
    );
    for (const m of matches) {
      const i = teams.indexOf(m.team1Label);
      const j = teams.indexOf(m.team2Label);
      if (i >= 0 && j >= 0) {
        matchMatrix[i][j] = { match: m, orient: 'direct'  };
        matchMatrix[j][i] = { match: m, orient: 'reverse' };
      }
    }

    // Match order labels — in scheduled order
    const matchOrderLabels = matches.map(m => {
      const i = teams.indexOf(m.team1Label);
      const j = teams.indexOf(m.team2Label);
      return `${formatTime(m.time)} ${grp.label}${i + 1}–${grp.label}${j + 1}`;
    });

    // Determine court(s) used by this group
    const courts = [...new Set(matches.map(m => m.court))].sort();
    const courtLabel = courts.length === 1
      ? `(kurt ${courts[0]})`
      : courts.length > 1 ? `(kurty ${courts.join(', ')})` : '';

    // Standings lookup (online: from computeGroupStandings; print: blanks)
    const rankByName = new Map();
    const ptsByName  = new Map();
    grp.standings.forEach((s, rank) => {
      rankByName.set(s.name, rank + 1);
      ptsByName.set(s.name, s.played > 0 ? s.w : null);
    });

    // Header row: "Týmy" / "Nasazení" / N opponent columns / "Body" / "Pořadí"
    let head = '<thead><tr>';
    head += '<th class="ct-team-h">Týmy</th>';
    head += '<th class="ct-seed-h">Nasazení</th>';
    for (let k = 0; k < N; k++) head += '<th class="ct-opp-h">/</th>';
    head += '<th class="ct-pts-h">Body</th>';
    head += '<th class="ct-rank-h">Pořadí</th>';
    head += '</tr></thead>';

    let body = '<tbody>';
    for (let i = 0; i < N; i++) {
      const tname  = teams[i];
      const tlabel = `${grp.label}${i + 1}`;

      body += `<tr>`;
      body += `<td class="ct-team"><span class="ct-team-code">${escapeHtml(tlabel)}:</span> <span class="ct-team-name">${escapeHtml(tname)}</span></td>`;
      body += `<td class="ct-seed">${seedOf(tname)}</td>`;

      for (let j = 0; j < N; j++) {
        if (i === j) {
          body += '<td class="ct-cell ct-x"></td>';
          continue;
        }
        const cell = matchMatrix[i][j];
        if (!cell) {
          body += '<td class="ct-cell ct-empty"></td>';
          continue;
        }
        const m        = cell.match;
        const isDirect = cell.orient === 'direct';
        const team1    = isDirect ? 1 : 2;
        const team2    = isDirect ? 2 : 1;

        const setRows = [];
        for (let s = 0; s < numSets; s++) {
          const k1 = `${m.id}_${team1}_${s}`;
          const k2 = `${m.id}_${team2}_${s}`;
          const v1 = state.scores[k1] ?? '';
          const v2 = state.scores[k2] ?? '';
          const label = numSets === 1 ? '' : `<span class="ct-set-lbl">${setLabels[s]}</span>`;
          if (isOnline) {
            setRows.push(`<div class="ct-set-row">${label}
              <input type="number" min="0" max="99" class="ct-score-inp"
                     data-key="${k1}" value="${v1}" placeholder="—">
              <span class="ct-sep">:</span>
              <input type="number" min="0" max="99" class="ct-score-inp"
                     data-key="${k2}" value="${v2}" placeholder="—">
            </div>`);
          } else {
            setRows.push(`<div class="ct-set-row">${label}
              <span class="ct-box"></span><span class="ct-sep">:</span><span class="ct-box"></span>
            </div>`);
          }
        }
        body += `<td class="ct-cell ct-cell-sets ct-sets-${numSets}">${setRows.join('')}</td>`;
      }

      const pts  = isOnline && ptsByName.get(tname) != null ? ptsByName.get(tname) : '';
      const rank = isOnline && rankByName.has(tname) && ptsByName.get(tname) != null
        ? rankByName.get(tname) + '.' : '';
      body += `<td class="ct-pts">${pts}</td>`;
      body += `<td class="ct-rank">${rank}</td>`;
      body += '</tr>';
    }
    body += '</tbody>';

    html += `
      <div class="cross-table-wrap">
        <div class="ct-header">Skupina ${grp.label} <span class="ct-header-court">${courtLabel}</span></div>
        <table class="cross-table">
          ${head}
          ${body}
        </table>
        ${matchOrderLabels.length > 0
          ? `<div class="ct-order"><strong>Pořadí zápasů:</strong> ${matchOrderLabels.join('&nbsp;&nbsp;&nbsp;')}</div>`
          : ''}
      </div>
    `;
  }

  html += '</div></div>';
  el.innerHTML = html;

  if (isOnline) {
    el.querySelectorAll('.ct-score-inp, .mb-score-inp').forEach(inp => {
      inp.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '' || /^\d{1,2}$/.test(v)) {
          state.scores[e.target.dataset.key] = v;
          saveState();
        }
        withFocusPreserve(() => { renderGroupStandings(); renderBracket(); });
      });
    });
  }
}

// Mini-bracket renderer for 4-team modified pool groups.
// Layout: M1 (1v4) + M2 (2v3) on the left, M3 (Finále) + M4 (O 3. místo) on the right.
function renderModMiniBracket(grp, ctx) {
  const { fmtId, numSets, setLabels, isOnline, seedOf } = ctx;
  const teams = grp.teams;
  const lbl   = grp.label;
  const scores = state.scores;
  const schedule = state.schedule;

  const find = (a, b) => schedule.find(m => m.team1Label === a && m.team2Label === b);
  const m1 = find(teams[0], teams[3]);                                // 1 vs 4
  const m2 = find(teams[1], teams[2]);                                // 2 vs 3
  const m3 = find(`Vít. M1 sk.${lbl}`, `Vít. M2 sk.${lbl}`);          // winners → 1./2.
  const m4 = find(`Por. M1 sk.${lbl}`, `Por. M2 sk.${lbl}`);          // losers  → 3./4.

  // Resolve placeholder names from M1/M2 results (used in M3/M4 + final ranks)
  const w1 = m1 ? matchWinner(scores, m1.id, fmtId) : 0;
  const w2 = m2 ? matchWinner(scores, m2.id, fmtId) : 0;
  const winM1 = w1 === 1 ? teams[0] : w1 === 2 ? teams[3] : null;
  const losM1 = w1 === 1 ? teams[3] : w1 === 2 ? teams[0] : null;
  const winM2 = w2 === 1 ? teams[1] : w2 === 2 ? teams[2] : null;
  const losM2 = w2 === 1 ? teams[2] : w2 === 2 ? teams[1] : null;

  const scoreCells = (match, team1Idx, team2Idx) => {
    if (!match) return ['', ''];
    const cells = [[], []];
    [team1Idx, team2Idx].forEach((teamN, side) => {
      for (let s = 0; s < numSets; s++) {
        const key = `${match.id}_${teamN}_${s}`;
        const val = scores[key] ?? '';
        cells[side].push(isOnline
          ? `<input type="number" min="0" max="99" class="mb-score-inp"
                 data-key="${key}" value="${val}" title="${setLabels[s]}">`
          : `<span class="mb-score-box" title="${setLabels[s]}"></span>`);
      }
    });
    return cells.map(c => c.join(''));
  };

  // Renders one match row. `seedTeam1/2` are optional (only used for M1/M2).
  const matchRow = (match, label1, label2, badge, name1, name2, seedTeam1, seedTeam2, resolvedName1, resolvedName2) => {
    const [s1Html, s2Html] = scoreCells(match, 1, 2);
    const matchWinSide = match ? matchWinner(scores, match.id, fmtId) : 0;
    const teamRow = (name, label, seed, isWinner, scoreHtml) => `
      <div class="mb-team ${isWinner ? 'mb-team-won' : ''}">
        <div class="mb-team-info">
          <span class="mb-team-label">${escapeHtml(label)}${seed != null ? ' · nasazení ' + seed : ''}</span>
          <span class="mb-team-name">${escapeHtml(name || '')}</span>
        </div>
        <div class="mb-scores">${scoreHtml}</div>
      </div>`;
    return `
      <div class="mb-match">
        <div class="mb-badge">${badge}</div>
        ${teamRow(resolvedName1 != null ? resolvedName1 : name1, label1, seedTeam1, matchWinSide === 1, s1Html)}
        ${teamRow(resolvedName2 != null ? resolvedName2 : name2, label2, seedTeam2, matchWinSide === 2, s2Html)}
      </div>`;
  };

  // Final ranking (winner of M3 = 1., loser = 2., winner of M4 = 3., loser of M4 = 4.)
  const wm3 = m3 ? matchWinner(scores, m3.id, fmtId) : 0;
  const wm4 = m4 ? matchWinner(scores, m4.id, fmtId) : 0;
  const rank1 = wm3 === 1 ? winM1 : wm3 === 2 ? winM2 : '';
  const rank2 = wm3 === 1 ? winM2 : wm3 === 2 ? winM1 : '';
  const rank3 = wm4 === 1 ? losM1 : wm4 === 2 ? losM2 : '';
  const rank4 = wm4 === 1 ? losM2 : wm4 === 2 ? losM1 : '';

  // Determine court(s) for header
  const courts = [...new Set([m1, m2, m3, m4].filter(Boolean).map(m => m.court))].sort();
  const courtLabel = courts.length === 1 ? `(kurt ${courts[0]})` :
                     courts.length > 1   ? `(kurty ${courts.join(', ')})` : '';

  // Match order labels — show schedule order
  const orderItems = [m1, m2, m3, m4].filter(Boolean).map(m => {
    const tag = m === m1 ? 'M1' : m === m2 ? 'M2' : m === m3 ? 'M3' : 'M4';
    return `<span>${formatTime(m.time)} ${tag}</span>`;
  });

  return `
    <div class="mb-wrap">
      <div class="mb-header">Skupina ${lbl} <span class="mb-header-sub">(mod. 4 týmy)</span> <span class="mb-header-court">${courtLabel}</span></div>
      <div class="mb-grid">
        ${matchRow(m1, `${lbl}1`, `${lbl}4`, 'M1', teams[0], teams[3], seedOf(teams[0]), seedOf(teams[3]))}
        ${matchRow(m2, `${lbl}2`, `${lbl}3`, 'M2', teams[1], teams[2], seedOf(teams[1]), seedOf(teams[2]))}
        ${matchRow(m3, 'Vít. M1', 'Vít. M2', `M3 — o 1./2. místo ve sk. ${lbl}`, '', '', null, null, winM1, winM2)}
        ${matchRow(m4, 'Por. M1', 'Por. M2', `M4 — o 3./4. místo ve sk. ${lbl}`, '', '', null, null, losM1, losM2)}
      </div>
      <div class="mb-podium">
        <div class="mb-rank"><strong>1${lbl}</strong> ${escapeHtml(rank1 || '_____')}</div>
        <div class="mb-rank"><strong>2${lbl}</strong> ${escapeHtml(rank2 || '_____')}</div>
        <div class="mb-rank"><strong>3${lbl}</strong> ${escapeHtml(rank3 || '_____')}</div>
        <div class="mb-rank"><strong>4${lbl}</strong> ${escapeHtml(rank4 || '_____')}</div>
      </div>
      ${orderItems.length ? `<div class="mb-order"><strong>Pořadí zápasů:</strong> ${orderItems.join('&nbsp;&nbsp;&nbsp;')}</div>` : ''}
    </div>
  `;
}

// ─── Bracket visualization ─────────────────────────────────────────────────
function renderBracket() {
  const opt = state.selectedOption;
  const el  = $('#bracketView');
  if (!opt) { el.innerHTML = ''; return; }

  const koPhases  = new Set(['semifinal', 'final', 'bracket', 'losers']);
  const koMatches = state.schedule.filter(m => koPhases.has(m.phase));
  if (koMatches.length === 0) { el.innerHTML = ''; return; }

  const isOnline   = state.mode === 'online';
  const fmtId      = opt.matchFormat.id;
  const numSets    = setsForFormat(fmtId);
  const setLabels  = numSets === 1 ? [''] : ['1.set', '2.set', 'TB'];
  const resolved   = buildResolvedNames(opt, state.schedule, state.scores);

  // Pretty label for a feeder slot. Prefer resolved team name; fall back to a
  // human-readable placeholder.
  const feederLabel = (rawLabel) => {
    const resolvedName = resolved[rawLabel];
    if (resolvedName) return resolvedName;
    let mm;
    if ((mm = rawLabel.match(/^([12])\. Sk\.(.+)$/)))         return `${mm[1]}. ze skupiny ${mm[2]}`;
    if ((mm = rawLabel.match(/^Vít\. SF ?(\d+)$/)))           return `vítěz SF${mm[1]}`;
    if ((mm = rawLabel.match(/^Por\. SF ?(\d+)$/)))           return `poražený SF${mm[1]}`;
    if ((mm = rawLabel.match(/^Vít\. ČF ?(\d+)$/)))           return `vítěz P${mm[1]}`;
    if ((mm = rawLabel.match(/^Vít\. P(\d+)$/)))              return `vítěz P${mm[1]}`;
    if ((mm = rawLabel.match(/^Por\. P(\d+)$/)))              return `poražený P${mm[1]}`;
    if ((mm = rawLabel.match(/^Por\. M(\d) sk\.(.+)$/)))      return `poražený M${mm[1]} sk.${mm[2]}`;
    if ((mm = rawLabel.match(/^Vít\. M(\d) sk\.(.+)$/)))      return `vítěz M${mm[1]} sk.${mm[2]}`;
    return rawLabel;
  };
  const isResolved = label => !!resolved[label];

  const kindOf = (roundName) => {
    if (/Předkolo|Osmifinále|Čtvrtfinále/i.test(roundName)) return 'p';
    if (/Semifinále/i.test(roundName))                       return 'sf';
    if (/^O 3\. místo/.test(roundName))                      return 'f3';
    if (/Finále|Grand/i.test(roundName))                     return 'f1';
    if (/^WB /.test(roundName))                              return 'wb';
    if (/^LB /.test(roundName))                              return 'lb';
    return 'x';
  };

  // Group by roundName (preserve schedule insertion order)
  const byRound = new Map();
  for (const m of koMatches) {
    if (!byRound.has(m.roundName)) byRound.set(m.roundName, []);
    byRound.get(m.roundName).push(m);
  }

  let html = '<div class="card"><div class="card-title">🏆 Pavouk</div><div class="bracket-view">';

  for (const [roundName, matches] of byRound) {
    const phase = matches[0].phase;
    const kind  = kindOf(roundName);

    html += `<div class="bracket-round bround-${phase} bround-kind-${kind}">`;
    html += `<div class="bracket-round-label">${roundName}</div>`;
    html += `<div class="bracket-round-matches">`;

    for (const m of matches) {
      const badge  = m.koLabel || '';
      const winner = isOnline ? matchWinner(state.scores, m.id, fmtId) : 0;
      const w1 = winner === 1, w2 = winner === 2;
      const t1Name = resolved[m.team1Label] || '';
      const t2Name = resolved[m.team2Label] || '';
      const t1Placeholder = feederLabel(m.team1Label);
      const t2Placeholder = feederLabel(m.team2Label);

      // Per-set score boxes — small empty boxes (or inputs in online mode).
      const scoresFor = (team) => {
        const cells = [];
        for (let s = 0; s < numSets; s++) {
          const key = `${m.id}_${team}_${s}`;
          const val = state.scores[key] ?? '';
          cells.push(isOnline
            ? `<input type="number" min="0" max="99" class="bm-score-inp"
                   data-key="${key}" value="${val}" title="${setLabels[s]}">`
            : `<span class="bm-score-box" title="${setLabels[s]}"></span>`);
        }
        return cells.join('');
      };

      // Medals only on Finále (F1) and "O 3. místo" (F3).
      let med1 = null, med2 = null;
      if (kind === 'f1') {
        if (w2) { med1 = '🥈'; med2 = '🥇'; } else { med1 = '🥇'; med2 = '🥈'; }
      } else if (kind === 'f3') {
        if (w2) { med1 = '🥔'; med2 = '🥉'; } else { med1 = '🥉'; med2 = '🥔'; }
      }

      const teamBlock = (name, placeholder, isWinner, isLoser, team, medal) => `
        <div class="bm-team ${isWinner ? 'bm-team-won' : isLoser ? 'bm-team-lost' : ''}">
          <div class="bm-team-main">
            <div class="bm-name-line">${escapeHtml(name)}</div>
            <div class="bm-placeholder">${escapeHtml(placeholder)}</div>
          </div>
          <div class="bm-scores">${scoresFor(team)}</div>
          ${medal ? `<div class="bm-medal">${medal}</div>` : ''}
        </div>`;

      html += `
        <div class="bracket-match" style="--set-cols: ${numSets};">
          <div class="bm-match-body">
            ${teamBlock(t1Name, t1Placeholder, w1, w2, 1, med1)}
            ${teamBlock(t2Name, t2Placeholder, w2, w1, 2, med2)}
          </div>
          <div class="bm-badge-box">
            <div class="bm-badge">${badge}</div>
            <div class="bm-meta">kurt: ${m.court}</div>
          </div>
        </div>
      `;
    }

    html += '</div></div>';   /* close .bracket-round-matches and .bracket-round */
  }

  html += '</div></div>';
  el.innerHTML = html;

  if (isOnline) {
    el.querySelectorAll('.bm-score-inp[data-key]').forEach(inp => {
      inp.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '' || /^\d{1,2}$/.test(v)) {
          state.scores[e.target.dataset.key] = v;
          saveState();
        }
        withFocusPreserve(() => { renderGroupStandings(); renderBracket(); });
      });
    });
  }
}

// ─── Legend ─────────────────────────────────────────────────────────────────
function renderLegend() {
  const opt  = state.selectedOption;
  const type = opt.type;

  let phaseRows = '';
  if (type === 'pool_knockout' || type === 'modified_pool') {
    phaseRows = `
      <div class="legend-item"><span class="legend-dot dot-pool"></span><span>Skupinová fáze (seeding pro pavouka)</span></div>
      <div class="legend-item"><span class="legend-dot dot-semifinal"></span><span>Předkolo / Osmifinále / Čtvrtfinále / Semifinále</span></div>
      <div class="legend-item"><span class="legend-dot dot-final"></span><span>Finále / O 3. místo</span></div>
      <div class="legend-item">↗ Všechny týmy postupují do pavouka (seeded podle pořadí ve skupině)</div>
    `;
  } else if (type === 'double_elimination') {
    phaseRows = `
      <div class="legend-item"><span class="legend-dot dot-pool"></span><span>Winners Bracket</span></div>
      <div class="legend-item"><span class="legend-dot dot-losers"></span><span>Losers Bracket</span></div>
      <div class="legend-item"><span class="legend-dot dot-final"></span><span>Grand Finále</span></div>
    `;
  } else if (type === 'round_robin') {
    phaseRows = `<div class="legend-item"><span class="legend-dot dot-pool"></span><span>Každý s každým</span></div>`;
  } else if (type === 'swiss') {
    phaseRows = `<div class="legend-item"><span class="legend-dot dot-pool"></span><span>Swiss kola</span></div>`;
  }

  $('#scheduleLegend').innerHTML = `
    ${phaseRows}
    <div class="legend-item">⏸ Rozcvičení: ${WARMUP_MIN} min před prvním zápasem</div>
    <div class="legend-item">⏱ Přestávka mezi zápasy: ${TRANSITION} min</div>
    ${opt.phaseBreaks > 0 ? `<div class="legend-item">🔄 Přestávka před play-off: ${PHASE_BREAK} min</div>` : ''}
  `;
}

// ─── Utilities ─────────────────────────────────────────────────────────────
function withFocusPreserve(fn) {
  const ae  = document.activeElement;
  const key = ae && ae.dataset ? ae.dataset.key : null;
  const ss  = ae && ae.tagName === 'INPUT' ? ae.selectionStart : null;
  const se  = ae && ae.tagName === 'INPUT' ? ae.selectionEnd   : null;
  fn();
  if (key) {
    const next = document.querySelector(`input[data-key="${key}"]`);
    if (next) {
      next.focus();
      if (ss != null) {
        try { next.setSelectionRange(ss, se != null ? se : ss); } catch (_) {}
      }
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

function printSchedule()     { window.print(); }

function copyScheduleText() {
  const lines = [];
  const opt = state.selectedOption;
  lines.push(`${SPORTS[state.sport].label} — ${opt.tournamentName}`);
  lines.push(`${state.teams.length} týmů · ${state.courts} kurtů · ${opt.matchFormat.shortName}`);
  lines.push('');

  if (opt.type === 'swiss' && state.swiss) {
    const sw = state.swiss;
    sw.rounds.forEach((round, ri) => {
      lines.push(`\n--- Kolo ${ri + 1} z ${sw.totalRounds} ---`);
      for (const m of round.matches) {
        const sc = matchScoreText(state.scores, m.id, sw.fmtId);
        lines.push(`Kurt ${m.court}:  ${m.t1} vs ${m.t2}${sc ? '  ' + sc : ''}`);
      }
      if (round.byeTeam) lines.push(`Bye:  ${round.byeTeam}`);
    });
    const standings = computeSwissStandings(sw, state.scores, sw.fmtId);
    lines.push('\n--- Pořadí ---');
    standings.forEach((s, i) => lines.push(`${i + 1}. ${s.name} — ${s.points} b. (V${s.wins}/P${s.losses}, Buch. ${s.buchholz})`));
  } else {
    let lastRound = null;
    for (const m of state.schedule) {
      if (m.roundName !== lastRound) {
        lines.push(`\n--- ${m.roundName} ---`);
        lastRound = m.roundName;
      }
      lines.push(`${formatTime(m.time)}  Kurt ${m.court}:  ${m.team1Label} vs ${m.team2Label}`);
    }
  }

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    showToast('Rozpis zkopírován do schránky ✓', 'success');
  });
}

// ─── Restore / reset ─────────────────────────────────────────────────────────
// Rebuild the app from a saved snapshot. Inputs are applied directly; steps 2 & 3
// are re-derived deterministically so the user lands where they left off — with
// their scores intact. Returns the step that was restored to.
function restoreState() {
  const snap = loadSnapshot();
  if (!snap) { renderStep1(); goToStep(1); return 1; }

  // Step-1 inputs
  if (snap.sport in SPORTS)                                 state.sport = snap.sport;
  if (Array.isArray(snap.teams) && snap.teams.length >= 2)  state.teams = snap.teams;
  if (Number.isFinite(snap.courts))                         state.courts = snap.courts;
  if (typeof snap.startTime === 'string')                   state.startTime = snap.startTime;
  if (typeof snap.endTime === 'string')                     state.endTime = snap.endTime;
  if (snap.mode === 'print' || snap.mode === 'online')      state.mode = snap.mode;
  if (snap.scores && typeof snap.scores === 'object')       state.scores = snap.scores;

  renderStep1();

  // Re-derive steps 2 & 3 only if the inputs are still valid.
  if ((snap.step === 2 || snap.step === 3) && validateStep1(true)) {
    state.options = computeOptions();
    if (state.options.length === 0) { goToStep(1); return 1; }
    renderOptions();

    const idx = snap.selectedOptionIndex;
    if (snap.step === 3 && idx != null && state.options[idx]) {
      state.selectedOption = state.options[idx];
      if (state.selectedOption.type === 'swiss') {
        // Swiss rounds are dynamic — restore them from the snapshot, don't rebuild.
        state.swiss = snap.swiss && Array.isArray(snap.swiss.rounds)
          ? snap.swiss
          : (initSwiss(state.selectedOption), state.swiss);
        renderSchedule();
      } else {
        restoreSelectedOption(idx);   // keeps restored scores
      }
      goToStep(3);
      return 3;
    }
    goToStep(2);
    return 2;
  }

  goToStep(1);
  return 1;
}

function resetAll() {
  clearSavedState();
  state.sport     = 'beach_volleyball';
  state.teams     = ['Tým A', 'Tým B', 'Tým C', 'Tým D'];
  state.courts    = 2;
  state.startTime = '09:00';
  state.endTime   = '13:00';
  state.mode      = 'print';
  state.options   = [];
  state.selectedOption = null;
  state.schedule  = [];
  state.scores    = {};
  state.swiss     = null;
  renderStep1();
  goToStep(1);
  showToast('Začínáme načisto — uložený turnaj byl vymazán.', 'success');
}

// ─── Event wiring ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('#addTeam').addEventListener('click', addTeam);

  $('#courts').addEventListener('input', e => {
    state.courts = +e.target.value;
    $('#courtsVal').textContent = e.target.value;
    saveState();
  });

  $('#startTime').addEventListener('change', e => { state.startTime = e.target.value; updateAvailableTime(); saveState(); });
  $('#endTime').addEventListener('change',   e => { state.endTime   = e.target.value; updateAvailableTime(); saveState(); });

  $$('input[name="mode"]').forEach(r => {
    r.addEventListener('change', e => { state.mode = e.target.value; saveState(); });
  });

  $('#btnToStep2').addEventListener('click',   generateAndShowOptions);
  $('#btnBackStep1').addEventListener('click',  () => goToStep(1));
  $('#btnBackStep2').addEventListener('click',  () => goToStep(2));
  $('#btnPrint').addEventListener('click',      printSchedule);
  $('#btnCopy').addEventListener('click',       copyScheduleText);
  $('#btnRegenerate').addEventListener('click', () => goToStep(2));
  $('#btnReset').addEventListener('click',      resetAll);

  // Restore previous session (falls back to a fresh step 1 when none).
  restoreState();
});
