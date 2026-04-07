let curriculum = null;
let viewDate = null;
let completions = {};
let currentTheme = 'light';
const THEME_KEY = 'sde_theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_COLORS = [
  '#5b9cf6', '#f5a623', '#c084fc', '#3ecf8e', '#f06b6b', '#e67e22',
  '#5b9cf6', '#f5a623', '#c084fc', '#3ecf8e', '#f06b6b', '#e67e22'
];

// ── Date helpers ──

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getWeekOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return fmt(d);
}

// ── Schedule helpers ──

function getScheduleDates() {
  return Object.keys(curriculum.schedule)
    .filter(k => curriculum.schedule[k].phase)
    .sort();
}

function getPhaseMap() {
  const map = {};
  if (!curriculum.phases) return map;
  for (const p of curriculum.phases) {
    if (p.id) map[p.id] = p;
  }
  return map;
}

// ── Persistence ──

function loadCompletions() {
  try {
    const saved = localStorage.getItem('sde_completions');
    if (saved) completions = JSON.parse(saved);
  } catch (e) { }
}

function saveCompletions() {
  try {
    localStorage.setItem('sde_completions', JSON.stringify(completions));
  } catch (e) { }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) { }
  return 'light';
}

function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
}

function applyTheme(theme) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = currentTheme === 'dark' ? 'Light view' : 'Dark view';
}

function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);
}

function toggleCompletion(dateStr, topicId) {
  if (!completions[dateStr]) completions[dateStr] = {};
  completions[dateStr][topicId] = !completions[dateStr][topicId];
  saveCompletions();
  renderDay(viewDate);
  updateProgress();
}

// ── Progress ──

function updateProgress() {
  const dates = getScheduleDates();
  if (dates.length === 0) {
    document.getElementById('global-prog-fill').style.width = '0%';
    document.getElementById('global-prog-text').textContent = '0 days';
    return;
  }
  const todayStr = fmt(new Date());
  const past = dates.filter(d => d <= todayStr).length;
  const pct = Math.round((past / dates.length) * 100);
  document.getElementById('global-prog-fill').style.width = pct + '%';
  document.getElementById('global-prog-text').style.opacity = 1;
  document.getElementById('global-prog-text').textContent = `${past}/${dates.length}`;
}

// ── Sidebar ──

function buildSidebar() {
  const container = document.getElementById('sidebar-phases');
  container.innerHTML = '';

  const dates = getScheduleDates();
  if (dates.length === 0) return;

  // Group dates by "YYYY-MM"
  const monthGroups = {};
  for (const dateStr of dates) {
    const key = dateStr.slice(0, 7); // "YYYY-MM"
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(dateStr);
  }

  Object.keys(monthGroups).sort().forEach(monthKey => {
    const [year, monthIdx] = monthKey.split('-').map(Number);
    const monthName = MONTH_NAMES[monthIdx - 1];
    const color = MONTH_COLORS[monthIdx - 1];
    const monthDates = monthGroups[monthKey];

    const group = document.createElement('div');
    group.className = 'phase-group';

    const ph = document.createElement('div');
    ph.className = 'phase-header';
    ph.innerHTML = `<div class="phase-dot" style="background:${color}"></div>
      <span class="phase-name">${monthName} ${year}</span>
      <span class="phase-count">${monthDates.length}d</span>`;

    const wl = document.createElement('div');
    wl.className = 'week-list';

    // Group by week
    const weekMap = {};
    for (const ds of monthDates) {
      const d = parseDate(ds);
      const wk = getWeekOf(d);
      if (!weekMap[wk]) weekMap[wk] = d;
    }

    Object.entries(weekMap).sort().forEach(([, d]) => {
      const wi = document.createElement('div');
      wi.className = 'week-item';
      wi.innerHTML = `<div class="week-dot"></div>Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      wi.onclick = () => navigateTo(d);
      wl.appendChild(wi);
    });

    // Auto-open the current month
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() === monthIdx - 1) {
      wl.classList.add('open');
    }

    ph.onclick = () => wl.classList.toggle('open');

    group.appendChild(ph);
    group.appendChild(wl);
    container.appendChild(group);
  });
}

// ── Navigation ──

function navigateTo(date) {
  viewDate = new Date(date);
  renderDay(viewDate);
  updateHeader();
}

function updateHeader() {
  const dateStr = fmt(viewDate);
  const dayData = curriculum.schedule[dateStr];
  const phaseMap = getPhaseMap();

  document.getElementById('date-display').textContent =
    viewDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const pill = document.getElementById('phase-pill');
  if (dayData && dayData.phase && phaseMap[dayData.phase]) {
    const phase = phaseMap[dayData.phase];
    const color = phase.color || '#888';
    pill.textContent = dayData.phase;
    pill.style.background = color + '22';
    pill.style.color = color;
    pill.style.border = `1px solid ${color}55`;
  } else if (dayData && dayData.phase) {
    pill.textContent = dayData.phase;
    pill.style.background = 'var(--accent-dim)';
    pill.style.color = 'var(--accent)';
    pill.style.border = '1px solid var(--accent)';
  } else {
    pill.textContent = '—';
    pill.style.background = 'transparent';
    pill.style.color = 'var(--faint)';
    pill.style.border = '1px solid var(--border)';
  }

  updateProgress();
}

// ── Render ──

function renderDay(date) {
  const dateStr = fmt(date);
  const dayData = curriculum.schedule[dateStr];
  const main = document.getElementById('main-content');
  const phaseMap = getPhaseMap();

  if (!dayData) {
    main.innerHTML = `<div class="off-plan-msg fadein">
      <h3>No plan for this day</h3>
      <p>Nothing scheduled. Add an entry in schedule.json or enjoy the day off.</p>
    </div>`;
    return;
  }

  const phase = dayData.phase;
  const phaseInfo = phaseMap[phase];
  const phaseColor = (phaseInfo && phaseInfo.color) || 'var(--accent)';
  const phaseName = (phaseInfo && phaseInfo.name) || phase || '—';
  const dc = completions[dateStr] || {};

  function normalizeTaskItem(item, index, type) {
    if (typeof item === 'string') {
      return { label: item, key: `${type}_${index}` };
    }
    if (item && typeof item === 'object') {
      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label
        : `Task ${index + 1}`;
      return { label, key: `${type}_${index}` };
    }
    return { label: String(item), key: `${type}_${index}` };
  }

  const learnTopics = (dayData.learn || []).map((item, index) => normalizeTaskItem(item, index, 'learn'));
  const reviseTopics = (dayData.revise || []).map((item, index) => normalizeTaskItem(item, index, 'revise'));

  const learnDone = learnTopics.filter(t => dc[t.key]).length;
  const reviseDone = reviseTopics.filter(t => dc[t.key]).length;
  const probDone = dc['problem'] || false;
  const buildDone = dc['build'] || false;

  const totalTasks = learnTopics.length + reviseTopics.length + (dayData.problem ? 1 : 0) + (dayData.build ? 1 : 0);
  const doneTasks = learnDone + reviseDone + (probDone ? 1 : 0) + (buildDone ? 1 : 0);
  const dayPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  function topicItemHTML(t) {
    const checked = dc[t.key] ? ' checked' : '';
    return `<div class="topic-item">
      <span class="topic-text">${t.label}</span>
      <div class="topic-check${checked}" onclick="toggleCompletion('${dateStr}','${t.key}')"></div>
    </div>`;
  }

  const learnHTML = learnTopics.length
    ? learnTopics.map(t => topicItemHTML(t)).join('')
    : '<div class="empty-revise">No new topics today</div>';

  const reviseHTML = reviseTopics.length
    ? reviseTopics.map(t => {
      return `<div class="revise-item">
          <span class="revise-icon">rev</span>
          <span class="revise-text">${t.label}</span>
          <div class="topic-check${dc[t.key] ? ' checked' : ''}" onclick="toggleCompletion('${dateStr}','${t.key}')"></div>
        </div>`;
    }).join('')
    : '<div class="empty-revise">Nothing to revise today</div>';

  const probHTML = dayData.problem
    ? `<div class="problem-display">
        <div class="problem-name">${dayData.problem}</div>
        <div class="problem-meta">
          <div class="topic-check${probDone ? ' checked' : ''}" onclick="toggleCompletion('${dateStr}','problem')"></div>
        </div>
      </div>`
    : '<div class="empty-revise">No problem assigned</div>';

  const buildHTML = dayData.build
    ? `<div class="build-task">${dayData.build}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
        <div class="topic-check${buildDone ? ' checked' : ''}" onclick="toggleCompletion('${dateStr}','build')"></div>
        <span style="font-size:12px;color:var(--faint)">mark complete</span>
      </div>`
    : '<div class="empty-revise">No build task assigned</div>';

  main.innerHTML = `<div class="fadein">
    <div class="day-header">
      <div class="day-header-left">
        <div class="day-number">${dayPct}% done today</div>
        <div class="day-title">${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        ${phase ? `<div class="day-phase-tag" style="color:${phaseColor};border-color:${phaseColor}44;background:${phaseColor}12">
          <span style="width:5px;height:5px;border-radius:50%;background:${phaseColor};display:inline-block"></span>
          ${phaseName}
        </div>` : ''}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:${phaseColor}"></div>Learn today</div>
        <div class="topic-list">${learnHTML}</div>
      </div>
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:var(--amber)"></div>Revise today</div>
        <div class="topic-list">${reviseHTML}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:var(--coral)"></div>Problem of the day</div>
        ${probHTML}
      </div>
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:var(--green)"></div>Build / code</div>
        ${buildHTML}
      </div>
    </div>

    ${dayData.tip ? `<div class="card col-span-full">
      <div class="card-label"><div class="card-label-dot" style="background:var(--accent)"></div>Today's insight</div>
      <div class="tip-text">${dayData.tip}</div>
    </div>` : ''}
  </div>`;
}

// ── Init ──

function init() {
  loadCompletions();
  applyTheme(loadTheme());

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.onclick = toggleTheme;

  Promise.all([
    fetch('data/phases.json').then(r => r.json()),
    fetch('data/schedule.json').then(r => r.json())
  ])
    .then(([phases, schedule]) => {
      curriculum = { phases, schedule };
      buildSidebar();

      viewDate = new Date();
      viewDate.setHours(0, 0, 0, 0);

      renderDay(viewDate);
      updateHeader();
      updateProgress();

      document.getElementById('prev-day').onclick = () => {
        viewDate.setDate(viewDate.getDate() - 1);
        renderDay(viewDate);
        updateHeader();
      };

      document.getElementById('next-day').onclick = () => {
        viewDate.setDate(viewDate.getDate() + 1);
        renderDay(viewDate);
        updateHeader();
      };

      document.getElementById('go-today').onclick = () => {
        viewDate = new Date();
        viewDate.setHours(0, 0, 0, 0);
        renderDay(viewDate);
        updateHeader();
      };

      document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') document.getElementById('prev-day').click();
        if (e.key === 'ArrowRight') document.getElementById('next-day').click();
      });
    })
    .catch(() => {
      document.getElementById('main-content').innerHTML = `<div class="off-plan-msg"><h3>Could not load curriculum data</h3><p>Make sure the data/ folder is served via a local server (e.g. <code>npx serve .</code>)</p></div>`;
    });
}

init();
