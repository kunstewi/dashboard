let curriculum = null;
let viewDate = null;
let completions = {};
let scheduleOverrides = {};
let scheduleEditState = null;
let currentTheme = 'light';
const THEME_KEY = 'sde_theme';
const COMPLETIONS_KEY = 'sde_completions';
const SCHEDULE_OVERRIDES_KEY = 'sde_schedule_overrides';

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

const SPACED_REVIEW_STEPS = [
  { days: 1, label: 'D1' },
  { days: 3, label: 'D3' },
  { days: 7, label: 'D7' },
  { days: 14, label: 'D14' },
  { days: 30, label: 'D30' }
];

const AUTO_REVIEW_TARGETS = [
  { field: 'learn', label: 'learnings' },
  { field: 'problem', label: 'problems' },
  { field: 'build', label: 'build/code' }
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

function addDaysToDateStr(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return fmt(d);
}

function getWeekOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return fmt(d);
}

function isTodayDateStr(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dateStr === fmt(today);
}

function isCurrentOrFutureDateStr(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dateStr >= fmt(today);
}

function phaseFromDate(dateStr) {
  const month = parseInt(dateStr.slice(5, 7), 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return 'p1';
  return `p${month}`;
}

function countTaskItems(value) {
  if (Array.isArray(value)) return value.length;
  if (value) return 1;
  return 0;
}

function shortDateLabel(dateStr) {
  const d = parseDate(dateStr);
  if (!Number.isFinite(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAutoReviewTasks(targetDateStr) {
  if (!curriculum || !curriculum.schedule) return [];

  const tasks = [];
  for (const step of SPACED_REVIEW_STEPS) {
    const sourceDate = addDaysToDateStr(targetDateStr, -step.days);
    const sourceData = curriculum.schedule[sourceDate];
    if (!sourceData) continue;

    for (const target of AUTO_REVIEW_TARGETS) {
      if (countTaskItems(sourceData[target.field]) === 0) continue;
      tasks.push({
        label: `Revise ${shortDateLabel(sourceDate)} ${target.label}`,
        link: '',
        key: `auto_revise_${step.label}_${sourceDate}_${target.field}`,
        sourceDate,
        reviewStep: step.label
      });
    }
  }

  return tasks;
}

function emptyScheduleEntry(dateStr) {
  return {
    learn: [],
    revise: [],
    build: [],
    problem: [],
    tip: '',
    phase: phaseFromDate(dateStr)
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeExternalLink(link) {
  if (!link || typeof link !== 'string') return '';
  const trimmed = link.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (e) { }
  return '';
}

function normalizeEditableArray(value) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const label = item.trim();
      if (label) out.push(label);
      continue;
    }
    if (item && typeof item === 'object') {
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      const link = safeExternalLink(item.link);
      if (!label) continue;
      out.push(link ? { label, link } : label);
      continue;
    }
    const label = String(item).trim();
    if (label) out.push(label);
  }
  return out;
}

function normalizeScheduleEntry(entry, dateStr) {
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    learn: normalizeEditableArray(source.learn),
    revise: normalizeEditableArray(source.revise),
    problem: normalizeEditableArray(source.problem),
    build: normalizeEditableArray(source.build),
    tip: typeof source.tip === 'string' ? source.tip.trim() : '',
    phase: typeof source.phase === 'string' && source.phase ? source.phase : phaseFromDate(dateStr)
  };
}

function parseEditorTaskLines(rawText) {
  return rawText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sepIndex = line.lastIndexOf('|');
      if (sepIndex === -1) return line;
      const label = line.slice(0, sepIndex).trim();
      const link = safeExternalLink(line.slice(sepIndex + 1));
      if (!label || !link) return line;
      return { label, link };
    });
}

function taskLineForEditor(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const label = typeof item.label === 'string' ? item.label : '';
    const link = typeof item.link === 'string' ? item.link : '';
    return link ? `${label} | ${link}` : label;
  }
  return String(item);
}

function ensureScheduleEntry(dateStr) {
  if (!curriculum.schedule[dateStr]) {
    curriculum.schedule[dateStr] = emptyScheduleEntry(dateStr);
  }
  curriculum.schedule[dateStr] = normalizeScheduleEntry(curriculum.schedule[dateStr], dateStr);
  return curriculum.schedule[dateStr];
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
    const saved = localStorage.getItem(COMPLETIONS_KEY);
    if (saved) completions = JSON.parse(saved);
  } catch (e) { }
}

function saveCompletions() {
  try {
    localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
  } catch (e) { }
}

function loadScheduleOverrides() {
  try {
    const saved = localStorage.getItem(SCHEDULE_OVERRIDES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') scheduleOverrides = parsed;
    }
  } catch (e) { }
}

function saveScheduleOverrides() {
  try {
    localStorage.setItem(SCHEDULE_OVERRIDES_KEY, JSON.stringify(scheduleOverrides));
  } catch (e) { }
}

function applyScheduleOverrides() {
  const dates = Object.keys(scheduleOverrides);
  for (const dateStr of dates) {
    curriculum.schedule[dateStr] = normalizeScheduleEntry(scheduleOverrides[dateStr], dateStr);
  }
}

function upsertScheduleEntry(dateStr, entry) {
  const normalized = normalizeScheduleEntry(entry, dateStr);
  curriculum.schedule[dateStr] = normalized;
  scheduleOverrides[dateStr] = normalized;
  saveScheduleOverrides();
}

function openTaskEditor(dateStr, section) {
  if (!isCurrentOrFutureDateStr(dateStr)) return;
  scheduleEditState = { dateStr, section };
  renderDay(viewDate);
  focusTaskEditorInput();
}

function closeTaskEditor() {
  scheduleEditState = null;
  renderDay(viewDate);
}

function focusTaskEditorInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('task-editor-input');
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });
}

function handleTaskEditorKeydown(event, dateStr, section) {
  if (!event || event.isComposing) return;
  if (event.key === 'Enter' && event.shiftKey) {
    event.preventDefault();
    saveTaskEditor(dateStr, section);
  }
}

function saveTaskEditor(dateStr, section) {
  if (!isCurrentOrFutureDateStr(dateStr)) return;

  const input = document.getElementById('task-editor-input');
  if (!input) return;

  const value = input.value || '';
  const nextEntry = { ...ensureScheduleEntry(dateStr) };

  if (section === 'tip') {
    nextEntry.tip = value.trim();
  } else if (['learn', 'revise', 'problem', 'build'].includes(section)) {
    nextEntry[section] = parseEditorTaskLines(value);
  } else {
    return;
  }

  nextEntry.phase = nextEntry.phase || phaseFromDate(dateStr);
  upsertScheduleEntry(dateStr, nextEntry);
  scheduleEditState = null;
  buildSidebar();
  renderDay(viewDate);
  updateHeader();
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
  if (!isTodayDateStr(dateStr)) return;
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

    const currentWeekKey = getWeekOf(new Date());

    Object.entries(weekMap).sort().forEach(([wk, d]) => {
      const wi = document.createElement('div');
      wi.className = 'week-item';
      if (wk === currentWeekKey) {
        wi.classList.add('current-week');
        wi.style.setProperty('--week-highlight', color);
      }
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
  scheduleEditState = null;
  renderDay(viewDate);
  updateHeader();
}

function jumpToDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  navigateTo(parseDate(dateStr));
}

function updateHeader() {
  const dateStr = fmt(viewDate);
  const dayData = curriculum.schedule[dateStr] || (isCurrentOrFutureDateStr(dateStr) ? emptyScheduleEntry(dateStr) : null);
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
  let dayData = curriculum.schedule[dateStr];
  const main = document.getElementById('main-content');
  const phaseMap = getPhaseMap();
  const canEditSchedule = isCurrentOrFutureDateStr(dateStr);

  if (!dayData && canEditSchedule) {
    dayData = emptyScheduleEntry(dateStr);
  }

  if (!dayData) {
    main.innerHTML = `<div class="off-plan-msg fadein">
      <h3>No plan for this day</h3>
      <p>No saved tasks for this past date.</p>
    </div>`;
    return;
  }

  const phase = dayData.phase || phaseFromDate(dateStr);
  const phaseInfo = phaseMap[phase];
  const phaseColor = (phaseInfo && phaseInfo.color) || 'var(--accent)';
  const phaseName = (phaseInfo && phaseInfo.name) || phase || '—';
  const canEditChecklist = isTodayDateStr(dateStr);
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
    const safeLabel = escapeHtml(label);
    const safeLink = safeExternalLink(link);
    if (safeLink) {
      return `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer" class="task-link">${safeLabel}</a>`;
    }
    return safeLabel;
  }

  function renderTaskLabel(task) {
    if (task.sourceDate) {
      const safeDate = escapeHtml(task.sourceDate);
      return `<button type="button" class="task-link-btn" onclick="jumpToDate('${safeDate}')">${escapeHtml(task.label)}</button>`;
    }
    return renderLabelOrLink(task.label, task.link);
  }

  function cardHeaderHTML(label, dotColor, section) {
    const editButton = canEditSchedule
      ? `<button class="card-edit-btn" style="--editor-accent:${dotColor}" type="button" title="Edit" onclick="openTaskEditor('${dateStr}','${section}')">&#9998;</button>`
      : '';
    return `<div class="card-head">
      <div class="card-label"><div class="card-label-dot" style="background:${dotColor}"></div>${label}</div>
      ${editButton}
    </div>`;
  }

  function renderCardEditorHTML(section, valueLines, accentColor, options = {}) {
    if (!scheduleEditState) return '';
    if (scheduleEditState.dateStr !== dateStr || scheduleEditState.section !== section) return '';
    const isTipEditor = section === 'tip';
    const value = valueLines.join('\n');
    const helper = isTipEditor
      ? 'Write a quick daily note. Enter = new line, Shift+Enter = save.'
      : 'One task per line. Optional link format: Task | https://... Enter = new line, Shift+Enter = save.';
    const placeholder = options.placeholder || '';
    const rows = options.rows || (isTipEditor ? 3 : 6);
    return `<div class="card-editor" style="--editor-accent:${accentColor}">
      <div class="card-editor-help">${helper}</div>
      <textarea id="task-editor-input" class="card-editor-input" rows="${rows}" placeholder="${escapeHtml(placeholder)}" onkeydown="handleTaskEditorKeydown(event,'${dateStr}','${section}')">${escapeHtml(value)}</textarea>
      <div class="card-editor-actions">
        <button class="editor-btn editor-btn-primary" type="button" onclick="saveTaskEditor('${dateStr}','${section}')">Save</button>
        <button class="editor-btn" type="button" onclick="closeTaskEditor()">Cancel</button>
      </div>
    </div>`;
  }

  const learnTasks = (dayData.learn || []).map((item, index) => normalizeTaskItem(item, index, 'learn'));
  const manualReviseTasks = (dayData.revise || []).map((item, index) => normalizeTaskItem(item, index, 'revise'));
  const autoReviseTasks = getAutoReviewTasks(dateStr);
  const reviseTasks = [...manualReviseTasks, ...autoReviseTasks];
  const problemTasks = normalizeTaskArray(dayData.problem, 'problem', 'problem');
  const buildTasks = normalizeTaskArray(dayData.build, 'build', 'build');

  const learnDone = learnTasks.filter(isTaskDone).length;
  const reviseDone = reviseTasks.filter(isTaskDone).length;
  const problemDone = problemTasks.filter(isTaskDone).length;
  const buildDone = buildTasks.filter(isTaskDone).length;

  const totalTasks = learnTasks.length + reviseTasks.length + problemTasks.length + buildTasks.length;
  const doneTasks = learnDone + reviseDone + problemDone + buildDone;
  const dayPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  function taskCheckHTML(task) {
    const checked = isTaskDone(task) ? ' checked' : '';
    const disabled = canEditChecklist ? '' : ' disabled';
    const onclick = canEditChecklist ? ` onclick="toggleCompletion('${dateStr}','${task.key}')"` : '';
    return `<div class="task-check${checked}${disabled}"${onclick}></div>`;
  }

  function taskItemHTML(task) {
    return `<div class="task-item">
      ${taskCheckHTML(task)}
      <span class="task-text">${renderTaskLabel(task)}</span>
    </div>`;
  }

  const learnHTML = learnTasks.length
    ? learnTasks.map(t => taskItemHTML(t)).join('')
    : '<div class="empty-revise">No learning tasks today</div>';

  const reviseHTML = reviseTasks.length
    ? reviseTasks.map(t => {
      return `<div class="revise-item">
          ${taskCheckHTML(t)}
          <span class="revise-icon">${escapeHtml(t.reviewStep || 'rev')}</span>
          <span class="revise-text">${renderTaskLabel(t)}</span>
        </div>`;
    }).join('')
    : '<div class="empty-revise">Nothing to revise today</div>';

  const probHTML = problemTasks.length
    ? problemTasks.map(t => taskItemHTML(t)).join('')
    : '<div class="empty-revise">No problem assigned</div>';

  const buildHTML = buildTasks.length
    ? buildTasks.map(t => {
      return `<div class="build-task">
        ${taskCheckHTML(t)}
        <span>${renderLabelOrLink(t.label, t.link)}</span>
      </div>`;
    }).join('')
    : '<div class="empty-revise">No build task assigned</div>';

  const tipText = typeof dayData.tip === 'string' ? dayData.tip.trim() : '';
  const tipHTML = tipText
    ? `<div class="tip-text">${escapeHtml(tipText).replace(/\n/g, '<br>')}</div>`
    : '<div class="empty-revise">No insight added yet</div>';

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
        ${cardHeaderHTML('Learn today', phaseColor, 'learn')}
        ${renderCardEditorHTML('learn', normalizeEditableArray(dayData.learn).map(taskLineForEditor), phaseColor, {
          placeholder: 'Example: Binary search patterns'
        })}
        <div class="task-list">${learnHTML}</div>
      </div>
      <div class="card">
        ${cardHeaderHTML('Revise today', 'var(--amber)', 'revise')}
        ${renderCardEditorHTML('revise', normalizeEditableArray(dayData.revise).map(taskLineForEditor), 'var(--amber)', {
          placeholder: 'Example: JS closures, async/await'
        })}
        <div class="task-list">${reviseHTML}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        ${cardHeaderHTML('Problem of the day', 'var(--coral)', 'problem')}
        ${renderCardEditorHTML('problem', normalizeEditableArray(dayData.problem).map(taskLineForEditor), 'var(--coral)', {
          placeholder: 'Example: 2 Sum | https://leetcode.com/...'
        })}
        <div class="task-list">${probHTML}</div>
      </div>
      <div class="card">
        ${cardHeaderHTML('Build / code', 'var(--green)', 'build')}
        ${renderCardEditorHTML('build', normalizeEditableArray(dayData.build).map(taskLineForEditor), 'var(--green)', {
          placeholder: 'Example: Implement LRU cache'
        })}
        ${buildHTML}
      </div>
    </div>

    <div class="card col-span-full">
      ${cardHeaderHTML("Today's insight", 'var(--accent)', 'tip')}
      ${renderCardEditorHTML('tip', tipText ? [tipText] : [], 'var(--accent)', {
        placeholder: 'Add a quick insight, reminder, or note',
        rows: 4
      })}
      ${tipHTML}
    </div>

    ${renderActivityGraph()}
  </div>`;
}

// ── Activity Graph ──

function getActivityLevel(dateStr) {
  const dayData = curriculum.schedule[dateStr];
  if (!dayData) return { level: 0, done: 0, total: 0 };

  const learnCount = countTaskItems(dayData.learn);
  const manualReviseCount = countTaskItems(dayData.revise);
  const autoReviseTasks = getAutoReviewTasks(dateStr);
  const problemCount = countTaskItems(dayData.problem);
  const buildCount = countTaskItems(dayData.build);

  const total =
    learnCount +
    manualReviseCount +
    autoReviseTasks.length +
    problemCount +
    buildCount;

  if (total === 0) return { level: 0, done: 0, total: 0 };

  const dc = completions[dateStr] || {};
  let done = 0;

  for (let i = 0; i < learnCount; i++) {
    if (dc[`learn_${i}`]) done++;
  }

  for (let i = 0; i < manualReviseCount; i++) {
    if (dc[`revise_${i}`]) done++;
  }

  for (const task of autoReviseTasks) {
    if (dc[task.key]) done++;
  }

  for (let i = 0; i < problemCount; i++) {
    if (dc[`problem_${i}`] || (i === 0 && dc.problem)) done++;
  }

  for (let i = 0; i < buildCount; i++) {
    if (dc[`build_${i}`] || (i === 0 && dc.build)) done++;
  }

  const pct = Math.min(done / total, 1);

  let level = 0;
  if (pct > 0 && pct < 0.25) level = 1;
  else if (pct >= 0.25 && pct < 0.5) level = 2;
  else if (pct >= 0.5 && pct < 1) level = 3;
  else if (pct >= 1) level = 4;

  return { level, done, total };
}

function renderActivityGraph() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = fmt(today);
  const year = today.getFullYear();

  // Start from the first Sunday of the year (or Jan 1 if Sunday)
  const jan1 = new Date(year, 0, 1);
  const startDate = new Date(jan1);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  // Build 53 weeks
  const weeks = [];
  const d = new Date(startDate);
  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDayOfWeek = weeks[w][0];
    const m = firstDayOfWeek.getMonth();
    if (m !== lastMonth && firstDayOfWeek.getFullYear() === year) {
      monthLabels.push({ index: w, name: MONTH_NAMES[m].slice(0, 3) });
      lastMonth = m;
    }
  }

  // Compute month label positions as inline widths
  let monthLabelHTML = '';
  for (let i = 0; i < monthLabels.length; i++) {
    const startW = monthLabels[i].index;
    const endW = i < monthLabels.length - 1 ? monthLabels[i + 1].index : weeks.length;
    const span = endW - startW;
    const width = span * 14; // 11px cell + 3px gap
    monthLabelHTML += `<span class="activity-month-label" style="width:${width}px">${monthLabels[i].name}</span>`;
  }

  // Day labels (Mon, Wed, Fri)
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const dayLabelHTML = dayLabels
    .map(l => `<div class="activity-day-label">${l}</div>`)
    .join('');

  // Build columns
  let totalDone = 0;
  let totalActive = 0;
  let currentStreak = 0;

  // Compute streaks by walking backwards from today
  const streakDate = new Date(today);
  while (true) {
    const sStr = fmt(streakDate);
    const info = curriculum.schedule[sStr] ? getActivityLevel(sStr) : null;
    if (info && info.total > 0 && info.done > 0) {
      currentStreak++;
      streakDate.setDate(streakDate.getDate() - 1);
    } else {
      break;
    }
  }

  let colsHTML = '';
  for (let w = 0; w < weeks.length; w++) {
    let cells = '';
    for (let dow = 0; dow < 7; dow++) {
      const cellDate = weeks[w][dow];
      const ds = fmt(cellDate);
      const isFuture = cellDate > today;
      const isToday = ds === todayStr;
      const { level, done, total } = getActivityLevel(ds);

      if (!isFuture && total > 0) {
        totalActive++;
        if (done > 0) totalDone++;
      }

      const classes = ['activity-cell'];
      if (isToday) classes.push('is-today');
      if (isFuture) classes.push('is-future');

      const dateLabel = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const tip = isFuture
        ? `${dateLabel} — upcoming`
        : total === 0
          ? `${dateLabel} — no tasks`
          : `${dateLabel} — ${done}/${total} done`;

      const lvl = isFuture ? 0 : level;
      cells += `<div class="${classes.join(' ')}" data-level="${lvl}" data-tip="${tip}"></div>`;
    }
    colsHTML += `<div class="activity-col">${cells}</div>`;
  }

  return `<div class="card activity-graph-card">
    <div class="activity-graph-header">
      <div class="card-label" style="margin-bottom:0"><div class="card-label-dot" style="background:var(--green)"></div>Activity — ${year}</div>
      <div class="activity-graph-stats">
        <span class="activity-stat"><strong>${totalDone}</strong> active days</span>
        <span class="activity-stat"><strong>${currentStreak}</strong> day streak</span>
      </div>
    </div>
    <div class="activity-graph-wrapper">
      <div class="activity-month-labels">${monthLabelHTML}</div>
      <div class="activity-graph-inner">
        <div class="activity-day-labels">${dayLabelHTML}</div>
        ${colsHTML}
      </div>
    </div>
    <div class="activity-legend">
      <span class="activity-legend-label">Less</span>
      <div class="activity-legend-cell activity-cell" data-level="0"></div>
      <div class="activity-legend-cell activity-cell" data-level="1"></div>
      <div class="activity-legend-cell activity-cell" data-level="2"></div>
      <div class="activity-legend-cell activity-cell" data-level="3"></div>
      <div class="activity-legend-cell activity-cell" data-level="4"></div>
      <span class="activity-legend-label">More</span>
    </div>
  </div>`;
}

// ── Init ──

async function loadBaseSchedule() {
  try {
    const response = await fetch('data/schedule.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('schedule fetch failed');
    const schedule = await response.json();
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
      throw new Error('invalid schedule payload');
    }
    const normalized = {};
    Object.keys(schedule).sort().forEach(dateStr => {
      normalized[dateStr] = normalizeScheduleEntry(schedule[dateStr], dateStr);
    });
    return normalized;
  } catch (e) {
    return {};
  }
}

async function init() {
  loadCompletions();
  loadScheduleOverrides();
  applyTheme(loadTheme());

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.onclick = toggleTheme;

  const schedule = await loadBaseSchedule();
  curriculum = { phases: PHASES, schedule };
  applyScheduleOverrides();
  buildSidebar();

  viewDate = new Date();
  viewDate.setHours(0, 0, 0, 0);

  renderDay(viewDate);
  updateHeader();
  updateProgress();

  document.getElementById('prev-day').onclick = () => {
    scheduleEditState = null;
    viewDate.setDate(viewDate.getDate() - 1);
    renderDay(viewDate);
    updateHeader();
  };

  document.getElementById('next-day').onclick = () => {
    scheduleEditState = null;
    viewDate.setDate(viewDate.getDate() + 1);
    renderDay(viewDate);
    updateHeader();
  };

  document.getElementById('go-today').onclick = () => {
    scheduleEditState = null;
    viewDate = new Date();
    viewDate.setHours(0, 0, 0, 0);
    renderDay(viewDate);
    updateHeader();
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') document.getElementById('prev-day').click();
    if (e.key === 'ArrowRight') document.getElementById('next-day').click();
  });
}

init();
