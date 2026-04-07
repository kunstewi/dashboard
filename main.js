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

const PHASES = [
  { id: 'p1', name: 'January Baseline Plan', months: 'January', color: '#5b9cf6' },
  { id: 'p2', name: 'February Baseline Plan', months: 'February', color: '#f5a623' },
  { id: 'p3', name: 'March Baseline Plan', months: 'March', color: '#c084fc' },
  { id: 'p4', name: 'April Baseline Plan', months: 'April', color: '#3ecf8e' },
  { id: 'p5', name: 'May Baseline Plan', months: 'May', color: '#f06b6b' },
  { id: 'p6', name: 'June Baseline Plan', months: 'June', color: '#e67e22' },
  { id: 'p7', name: 'July Baseline Plan', months: 'July', color: '#5b9cf6' },
  { id: 'p8', name: 'August Baseline Plan', months: 'August', color: '#f5a623' },
  { id: 'p9', name: 'September Baseline Plan', months: 'September', color: '#c084fc' },
  { id: 'p10', name: 'October Baseline Plan', months: 'October', color: '#3ecf8e' },
  { id: 'p11', name: 'November Baseline Plan', months: 'November', color: '#f06b6b' },
  { id: 'p12', name: 'December Baseline Plan', months: 'December', color: '#e67e22' }
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

function toggleCompletion(dateStr, taskId) {
  if (!completions[dateStr]) completions[dateStr] = {};
  completions[dateStr][taskId] = !completions[dateStr][taskId];
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
      return { label: item, link: '', key: `${type}_${index}` };
    }
    if (item && typeof item === 'object') {
      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label
        : `Task ${index + 1}`;
      const link = typeof item.link === 'string' && item.link.trim() ? item.link.trim() : '';
      return { label, link, key: `${type}_${index}` };
    }
    return { label: String(item), link: '', key: `${type}_${index}` };
  }

  function normalizeTaskArray(value, type, legacyKey) {
    const rawItems = Array.isArray(value) ? value : (value ? [value] : []);
    return rawItems.map((item, index) => {
      const normalized = normalizeTaskItem(item, index, type);
      if (legacyKey && index === 0) normalized.legacyKey = legacyKey;
      return normalized;
    });
  }

  function isTaskDone(task) {
    if (dc[task.key]) return true;
    if (task.legacyKey && dc[task.legacyKey]) return true;
    return false;
  }

  function renderLabelOrLink(label, link) {
    if (link) {
      return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="task-link">${label}</a>`;
    }
    return label;
  }

  const learnTasks = (dayData.learn || []).map((item, index) => normalizeTaskItem(item, index, 'learn'));
  const reviseTasks = (dayData.revise || []).map((item, index) => normalizeTaskItem(item, index, 'revise'));
  const problemTasks = normalizeTaskArray(dayData.problem, 'problem', 'problem');
  const buildTasks = normalizeTaskArray(dayData.build, 'build', 'build');

  const learnDone = learnTasks.filter(isTaskDone).length;
  const reviseDone = reviseTasks.filter(isTaskDone).length;
  const problemDone = problemTasks.filter(isTaskDone).length;
  const buildDone = buildTasks.filter(isTaskDone).length;

  const totalTasks = learnTasks.length + reviseTasks.length + problemTasks.length + buildTasks.length;
  const doneTasks = learnDone + reviseDone + problemDone + buildDone;
  const dayPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  function taskItemHTML(task) {
    const checked = isTaskDone(task) ? ' checked' : '';
    return `<div class="task-item">
      <div class="task-check${checked}" onclick="toggleCompletion('${dateStr}','${task.key}')"></div>
      <span class="task-text">${renderLabelOrLink(task.label, task.link)}</span>
    </div>`;
  }

  const learnHTML = learnTasks.length
    ? learnTasks.map(t => taskItemHTML(t)).join('')
    : '<div class="empty-revise">No learning tasks today</div>';

  const reviseHTML = reviseTasks.length
    ? reviseTasks.map(t => {
      return `<div class="revise-item">
          <div class="task-check${isTaskDone(t) ? ' checked' : ''}" onclick="toggleCompletion('${dateStr}','${t.key}')"></div>
          <span class="revise-icon">rev</span>
          <span class="revise-text">${renderLabelOrLink(t.label, t.link)}</span>
        </div>`;
    }).join('')
    : '<div class="empty-revise">Nothing to revise today</div>';

  const probHTML = problemTasks.length
    ? problemTasks.map(t => taskItemHTML(t)).join('')
    : '<div class="empty-revise">No problem assigned</div>';

  const buildHTML = buildTasks.length
    ? buildTasks.map(t => {
      return `<div class="build-task">
        <div class="task-check${isTaskDone(t) ? ' checked' : ''}" onclick="toggleCompletion('${dateStr}','${t.key}')"></div>
        <span>${renderLabelOrLink(t.label, t.link)}</span>
      </div>`;
    }).join('')
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
        <div class="task-list">${learnHTML}</div>
      </div>
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:var(--amber)"></div>Revise today</div>
        <div class="task-list">${reviseHTML}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-label"><div class="card-label-dot" style="background:var(--coral)"></div>Problem of the day</div>
        <div class="task-list">${probHTML}</div>
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

  fetch('data/schedule.json')
    .then(r => r.json())
    .then(schedule => {
      curriculum = { phases: PHASES, schedule };
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
