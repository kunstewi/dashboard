let curriculum = null;
let viewDate = null;
let completions = {};
let persistedSchedule = {};
let scheduleEditState = null;
let currentTheme = 'light';
let currentSession = null;
let currentUser = null;
let supabaseClient = null;
let browserStorage = undefined;
let loadedYears = new Set();
let syncStatus = { label: 'Setup required', tone: 'muted' };
let lastHandledSessionKey = null;

const THEME_KEY = 'sde_theme';
const SUPABASE_AUTH_STORAGE_KEY = 'sde_dashboard_supabase_auth';
const AUTH_SESSION_BACKUP_KEY = 'sde_dashboard_auth_backup';
const SUPABASE_PROFILE_TABLE = 'profiles';
const SUPABASE_SCHEDULE_TABLE = 'schedule_days';

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
  d.setHours(0, 0, 0, 0);
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

function buildDefaultYearSchedule(year) {
  const schedule = {};
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    const dateStr = fmt(d);
    schedule[dateStr] = emptyScheduleEntry(dateStr);
    d.setDate(d.getDate() + 1);
  }
  return schedule;
}

function normalizeCompletionMap(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  Object.keys(source).forEach(key => {
    if (source[key]) out[key] = true;
  });
  return out;
}

function isDefaultScheduleEntry(entry, dateStr) {
  const normalized = normalizeScheduleEntry(entry, dateStr);
  return countTaskItems(normalized.learn) === 0
    && countTaskItems(normalized.revise) === 0
    && countTaskItems(normalized.problem) === 0
    && countTaskItems(normalized.build) === 0
    && !normalized.tip
    && normalized.phase === phaseFromDate(dateStr);
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

function ensureCurriculum() {
  if (!curriculum) curriculum = { phases: PHASES, schedule: {} };
}

function applyPersistedScheduleForYear(year) {
  Object.keys(persistedSchedule).forEach(dateStr => {
    const d = parseDate(dateStr);
    if (Number.isFinite(d.getTime()) && d.getFullYear() === year) {
      curriculum.schedule[dateStr] = normalizeScheduleEntry(persistedSchedule[dateStr], dateStr);
    }
  });
}

function ensureScheduleYear(year) {
  ensureCurriculum();
  if (loadedYears.has(year)) return false;
  Object.assign(curriculum.schedule, buildDefaultYearSchedule(year));
  loadedYears.add(year);
  applyPersistedScheduleForYear(year);
  return true;
}

function rebuildCurriculum() {
  const focusYear = viewDate ? viewDate.getFullYear() : new Date().getFullYear();
  curriculum = { phases: PHASES, schedule: {} };
  loadedYears = new Set();
  ensureScheduleYear(focusYear);

  Object.keys(persistedSchedule).forEach(dateStr => {
    const d = parseDate(dateStr);
    if (Number.isFinite(d.getTime())) ensureScheduleYear(d.getFullYear());
  });

  Object.keys(persistedSchedule).forEach(dateStr => {
    curriculum.schedule[dateStr] = normalizeScheduleEntry(persistedSchedule[dateStr], dateStr);
  });
}

function ensureScheduleEntry(dateStr) {
  const year = parseDate(dateStr).getFullYear();
  ensureScheduleYear(year);
  curriculum.schedule[dateStr] = normalizeScheduleEntry(curriculum.schedule[dateStr], dateStr);
  return curriculum.schedule[dateStr];
}

// ── Supabase / auth helpers ──

function getSupabaseConfig() {
  const raw = window.SDE_SUPABASE_CONFIG || {};
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const anonKey = typeof raw.anonKey === 'string' ? raw.anonKey.trim() : '';

  if (!url || !anonKey) return null;
  if (url.includes('YOUR_') || anonKey.includes('YOUR_')) return null;
  return { url, anonKey };
}

function hasSupabaseConfig() {
  return Boolean(getSupabaseConfig());
}

function getBrowserStorage() {
  if (browserStorage !== undefined) return browserStorage;

  try {
    const storage = window.localStorage;
    const probeKey = '__sde_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    browserStorage = storage;
  } catch (error) {
    console.warn('Persistent browser storage is unavailable.', error);
    browserStorage = null;
  }

  return browserStorage;
}

function readStoredValue(key) {
  const storage = getBrowserStorage();
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn(`Could not read ${key} from local storage.`, error);
    return null;
  }
}

function writeStoredValue(key, value) {
  const storage = getBrowserStorage();
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Could not write ${key} to local storage.`, error);
    return false;
  }
}

function removeStoredValue(key) {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(`Could not remove ${key} from local storage.`, error);
  }
}

function backupSession(session) {
  if (!session || !session.access_token || !session.refresh_token) {
    removeStoredValue(AUTH_SESSION_BACKUP_KEY);
    return;
  }

  writeStoredValue(AUTH_SESSION_BACKUP_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  }));
}

function readSessionBackup() {
  const raw = readStoredValue(AUTH_SESSION_BACKUP_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string') {
      removeStoredValue(AUTH_SESSION_BACKUP_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Stored auth backup could not be parsed.', error);
    removeStoredValue(AUTH_SESSION_BACKUP_KEY);
    return null;
  }
}

function hasPendingAuthCallback() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.has('code')
    || search.has('error')
    || hash.has('access_token')
    || hash.has('refresh_token')
    || hash.has('error_description');
}

function setSyncStatus(label, tone) {
  syncStatus = { label, tone };
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = label;
  el.setAttribute('data-tone', tone);
}

function getCurrentUserName() {
  if (!currentUser) return '';
  const meta = currentUser.user_metadata || {};
  return meta.user_name || meta.preferred_username || meta.full_name || currentUser.email || 'Signed in';
}

function getCurrentUserAvatar() {
  if (!currentUser) return '';
  const meta = currentUser.user_metadata || {};
  return typeof meta.avatar_url === 'string' ? meta.avatar_url : '';
}

function updateAuthControls() {
  const slot = document.getElementById('auth-controls');
  if (!slot) return;

  if (!hasSupabaseConfig()) {
    slot.innerHTML = '<button class="theme-toggle" type="button" onclick="openSupabaseSetup()">Setup Supabase</button>';
    setSyncStatus('Setup required', 'muted');
    return;
  }

  if (!currentUser) {
    slot.innerHTML = '<button class="theme-toggle" type="button" onclick="signInWithGitHub()">GitHub sign in</button>';
    setSyncStatus('Sign in to sync', 'muted');
    return;
  }

  const avatar = getCurrentUserAvatar();
  const avatarHtml = avatar
    ? `<img class="auth-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(getCurrentUserName())}">`
    : '<div class="auth-avatar auth-avatar-fallback">GH</div>';

  slot.innerHTML = `<div class="auth-meta">${avatarHtml}<span class="auth-name">${escapeHtml(getCurrentUserName())}</span></div>
    <button class="theme-toggle" type="button" onclick="signOut()">Sign out</button>`;
}

function initializeSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const config = getSupabaseConfig();
  if (!config || !window.supabase || typeof window.supabase.createClient !== 'function') return null;

  const storage = getBrowserStorage();
  const authOptions = {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: SUPABASE_AUTH_STORAGE_KEY
  };
  if (storage) authOptions.storage = storage;

  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: authOptions
  });

  return supabaseClient;
}

async function restoreSessionFromBackup(client) {
  if (!client) return null;

  const backup = readSessionBackup();
  if (!backup) return null;

  const { data, error } = await client.auth.setSession({
    access_token: backup.access_token,
    refresh_token: backup.refresh_token
  });

  if (error) {
    console.warn('Could not restore auth session from local backup.', error);
    removeStoredValue(AUTH_SESSION_BACKUP_KEY);
    return null;
  }

  return data && data.session ? data.session : null;
}

async function signInWithGitHub() {
  const client = initializeSupabaseClient();
  if (!client) {
    renderSetupState();
    return;
  }

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo }
  });

  if (error) {
    console.error(error);
    renderErrorState('Could not start GitHub login', error.message || 'Please check your Supabase OAuth configuration.');
    setSyncStatus('Login failed', 'error');
  }
}

async function signOut() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error(error);
    setSyncStatus('Sign out failed', 'error');
  }
}

async function upsertProfile() {
  if (!supabaseClient || !currentUser) return;
  const meta = currentUser.user_metadata || {};
  const payload = {
    id: currentUser.id,
    github_login: meta.user_name || meta.preferred_username || '',
    github_avatar_url: meta.avatar_url || ''
  };

  const { error } = await supabaseClient
    .from(SUPABASE_PROFILE_TABLE)
    .upsert(payload, { onConflict: 'id' });

  if (error) console.warn('Profile upsert skipped:', error.message || error);
}

async function loadCloudSchedule() {
  if (!supabaseClient || !currentUser) return;

  setSyncStatus('Loading cloud plan…', 'loading');
  const { data, error } = await supabaseClient
    .from(SUPABASE_SCHEDULE_TABLE)
    .select('day, learn, revise, build, problem, tip, phase, completions')
    .eq('user_id', currentUser.id)
    .order('day', { ascending: true });

  if (error) throw error;

  persistedSchedule = {};
  completions = {};

  for (const row of data || []) {
    const dateStr = row.day;
    persistedSchedule[dateStr] = normalizeScheduleEntry(row, dateStr);
    completions[dateStr] = normalizeCompletionMap(row.completions);
  }

  rebuildCurriculum();
  buildSidebar();
  renderDay(viewDate);
  updateHeader();
  updateProgress();
  setSyncStatus('Synced', 'success');
}

async function persistDay(dateStr) {
  if (!supabaseClient || !currentUser) return;

  const normalized = normalizeScheduleEntry(curriculum.schedule[dateStr], dateStr);
  const dayCompletions = normalizeCompletionMap(completions[dateStr]);
  const shouldPersist = !isDefaultScheduleEntry(normalized, dateStr) || Object.keys(dayCompletions).length > 0;

  setSyncStatus('Saving…', 'loading');

  if (!shouldPersist) {
    const { error } = await supabaseClient
      .from(SUPABASE_SCHEDULE_TABLE)
      .delete()
      .eq('user_id', currentUser.id)
      .eq('day', dateStr);

    if (error) throw error;

    delete persistedSchedule[dateStr];
    delete completions[dateStr];
    curriculum.schedule[dateStr] = emptyScheduleEntry(dateStr);
    setSyncStatus('Synced', 'success');
    return;
  }

  const payload = {
    user_id: currentUser.id,
    day: dateStr,
    learn: normalized.learn,
    revise: normalized.revise,
    build: normalized.build,
    problem: normalized.problem,
    tip: normalized.tip,
    phase: normalized.phase,
    completions: dayCompletions,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from(SUPABASE_SCHEDULE_TABLE)
    .upsert(payload, { onConflict: 'user_id,day' });

  if (error) throw error;

  persistedSchedule[dateStr] = normalized;
  completions[dateStr] = dayCompletions;
  setSyncStatus('Synced', 'success');
}

function handleSyncError(error, title) {
  console.error(error);
  setSyncStatus('Sync failed', 'error');
  if (title) renderErrorState(title, error && error.message ? error.message : 'Something went wrong while syncing with Supabase.');
}

function openSupabaseSetup() {
  renderSetupState();
}

function getSessionKey(session) {
  if (!session || !session.user) return 'signed-out';
  const tokenHint = typeof session.access_token === 'string'
    ? session.access_token.slice(-12)
    : 'no-token';
  return `${session.user.id}:${tokenHint}`;
}

async function handleSessionChange(session) {
  const sessionKey = getSessionKey(session);
  if (sessionKey === lastHandledSessionKey) return;
  lastHandledSessionKey = sessionKey;

  currentSession = session || null;
  currentUser = currentSession ? currentSession.user : null;
  backupSession(currentSession);
  updateAuthControls();

  if (!currentUser) {
    persistedSchedule = {};
    completions = {};
    rebuildCurriculum();
    buildSidebar();
    updateHeader();
    updateProgress();
    renderSignedOutState();
    return;
  }

  renderLoadingState('Loading your cloud plan...');

  try {
    await upsertProfile();
    await loadCloudSchedule();
  } catch (error) {
    handleSyncError(error, 'Could not load your dashboard');
  }
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

// ── Persistence / local theme ──

function upsertScheduleEntry(dateStr, entry) {
  const normalized = normalizeScheduleEntry(entry, dateStr);
  curriculum.schedule[dateStr] = normalized;
  return persistDay(dateStr);
}

function openTaskEditor(dateStr, section) {
  if (!currentUser || !isCurrentOrFutureDateStr(dateStr)) return;
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

async function saveTaskEditor(dateStr, section) {
  if (!currentUser || !isCurrentOrFutureDateStr(dateStr)) return;

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

  try {
    await upsertScheduleEntry(dateStr, nextEntry);
    scheduleEditState = null;
    buildSidebar();
    renderDay(viewDate);
    updateHeader();
  } catch (error) {
    handleSyncError(error);
  }
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

async function toggleCompletion(dateStr, taskId) {
  if (!currentUser || !isTodayDateStr(dateStr)) return;
  if (!completions[dateStr]) completions[dateStr] = {};

  if (completions[dateStr][taskId]) {
    delete completions[dateStr][taskId];
  } else {
    completions[dateStr][taskId] = true;
  }

  renderDay(viewDate);
  updateProgress();

  try {
    await persistDay(dateStr);
  } catch (error) {
    handleSyncError(error);
  }
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

  const monthGroups = {};
  for (const dateStr of dates) {
    const key = dateStr.slice(0, 7);
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
  viewDate.setHours(0, 0, 0, 0);
  scheduleEditState = null;
  const addedYear = ensureScheduleYear(viewDate.getFullYear());
  if (addedYear) buildSidebar();

  if (currentUser) {
    renderDay(viewDate);
  } else if (hasSupabaseConfig()) {
    renderSignedOutState();
  } else {
    renderSetupState();
  }

  updateHeader();
}

function jumpToDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  navigateTo(parseDate(dateStr));
}

function updateHeader() {
  const dateStr = fmt(viewDate);
  const dayData = curriculum.schedule[dateStr] || emptyScheduleEntry(dateStr);
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

// ── State gates ──

function renderLoadingState(message) {
  const main = document.getElementById('main-content');
  if (main && main.dataset.screen === 'loading') return;

  const graphColumns = Array.from({ length: 12 }, () => `
    <div class="skeleton-graph-col">
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
      <div class="skeleton-block skeleton-graph-cell"></div>
    </div>
  `).join('');

  main.innerHTML = `<div class="skeleton-dashboard fadein" aria-label="${escapeHtml(message || 'Loading your plan...')}">
    <div class="skeleton-day-header">
      <div class="skeleton-block skeleton-line" style="width:128px"></div>
      <div class="skeleton-block skeleton-line-xl" style="width:min(480px,72%)"></div>
      <div class="skeleton-block skeleton-line" style="width:116px"></div>
    </div>

    <div class="grid-2">
      <div class="card skeleton-card">
        <div class="skeleton-card-head">
          <div class="skeleton-block skeleton-line" style="width:124px"></div>
          <div class="skeleton-block" style="width:24px;height:24px;border-radius:6px"></div>
        </div>
        <div class="skeleton-card-items">
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
        </div>
      </div>
      <div class="card skeleton-card">
        <div class="skeleton-card-head">
          <div class="skeleton-block skeleton-line" style="width:128px"></div>
          <div class="skeleton-block" style="width:24px;height:24px;border-radius:6px"></div>
        </div>
        <div class="skeleton-card-items">
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card skeleton-card">
        <div class="skeleton-card-head">
          <div class="skeleton-block skeleton-line" style="width:148px"></div>
          <div class="skeleton-block" style="width:24px;height:24px;border-radius:6px"></div>
        </div>
        <div class="skeleton-card-items">
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
        </div>
      </div>
      <div class="card skeleton-card">
        <div class="skeleton-card-head">
          <div class="skeleton-block skeleton-line" style="width:112px"></div>
          <div class="skeleton-block" style="width:24px;height:24px;border-radius:6px"></div>
        </div>
        <div class="skeleton-card-items">
          <div class="skeleton-block skeleton-task"></div>
          <div class="skeleton-block skeleton-task"></div>
        </div>
      </div>
    </div>

    <div class="card skeleton-card col-span-full">
      <div class="skeleton-card-head">
        <div class="skeleton-block skeleton-line" style="width:120px"></div>
        <div class="skeleton-block" style="width:24px;height:24px;border-radius:6px"></div>
      </div>
      <div class="skeleton-block" style="height:84px;border-radius:12px"></div>
    </div>

    <div class="card activity-graph-card skeleton-graph">
      <div class="skeleton-card-head">
        <div class="skeleton-block skeleton-line" style="width:108px"></div>
        <div class="skeleton-block skeleton-line" style="width:148px"></div>
      </div>
      <div class="skeleton-graph-grid">
        <div class="skeleton-graph-labels">
          <div class="skeleton-block skeleton-line" style="width:24px"></div>
          <div class="skeleton-block skeleton-line" style="width:24px"></div>
          <div class="skeleton-block skeleton-line" style="width:24px"></div>
        </div>
        ${graphColumns}
      </div>
    </div>
  </div>`;
  main.dataset.screen = 'loading';
}

function renderSetupState() {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="gate-shell"><div class="gate-card fadein">
    <div class="gate-badge gate-badge-supabase" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M13.8 3.8c.7-1.2 2.5-.7 2.5.7v14.1c0 1.7-2.1 2.5-3.2 1.2l-1.2-1.5c-.4-.5-.4-1.2 0-1.8l2.9-4.1c.2-.2 0-.6-.3-.6H11c-1.3 0-2.1-1.4-1.4-2.5l4.2-5.5Z" fill="currentColor"/>
        <path d="M10.2 7.3c.7-1.1 2.4-.6 2.4.8v11.3c0 1.7-2.1 2.5-3.2 1.2L7.2 18c-.5-.6-.5-1.4 0-2l3.1-4.1c.2-.2 0-.5-.2-.5H6.8c-1.3 0-2.1-1.4-1.4-2.5l4.8-6.6Z" fill="currentColor" opacity="0.78"/>
      </svg>
    </div>
    <h2>Supabase config needed</h2>
    <p>Paste your project URL and anon key into <code>supabase-config.js</code>, then refresh the page.</p>
    <div class="gate-code">window.SDE_SUPABASE_CONFIG = { url: 'https://YOUR_PROJECT.supabase.co', anonKey: 'YOUR_SUPABASE_ANON_KEY' };</div>
    <div class="gate-actions">
      <button class="gate-btn gate-btn-supabase" type="button" onclick="window.location.reload()">Reload after setup</button>
    </div>
  </div></div>`;
  main.dataset.screen = 'setup';
}

function renderSignedOutState() {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="gate-shell"><div class="gate-card fadein">
    <div class="gate-badge gate-badge-github" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .7a11.3 11.3 0 0 0-3.58 22.03c.57.1.77-.24.77-.54v-1.9c-3.12.68-3.78-1.33-3.78-1.33-.5-1.3-1.24-1.65-1.24-1.65-1.01-.7.08-.68.08-.68 1.11.08 1.7 1.13 1.7 1.13 1 .34 1.95.24 2.43.18.1-.7.39-1.18.7-1.45-2.49-.28-5.12-1.25-5.12-5.56 0-1.23.44-2.23 1.15-3.01-.12-.28-.5-1.41.1-2.94 0 0 .95-.3 3.11 1.15a10.8 10.8 0 0 1 5.66 0c2.16-1.45 3.1-1.15 3.1-1.15.62 1.53.23 2.66.12 2.94.71.78 1.15 1.78 1.15 3.01 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.02.76 2.07v3.07c0 .3.2.65.78.54A11.3 11.3 0 0 0 12 .7Z"/>
      </svg>
    </div>
    <h2>Sign in with GitHub</h2>
    <p>Your dashboard data lives in Supabase now, so signing in is what keeps tasks, completions, and graph history synced across browsers and mobile.</p>
    <div class="gate-actions">
      <button class="gate-btn gate-btn-github" type="button" onclick="signInWithGitHub()">Continue with GitHub</button>
    </div>
  </div></div>`;
  main.dataset.screen = 'signed-out';
}

function renderErrorState(title, message) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="gate-shell"><div class="gate-card fadein">
    <h2>${escapeHtml(title || 'Something went wrong')}</h2>
    <p>${escapeHtml(message || 'Please check your Supabase setup and try again.')}</p>
  </div></div>`;
  main.dataset.screen = 'error';
}

// ── Render ──

function renderDay(date) {
  const dateStr = fmt(date);
  let dayData = curriculum.schedule[dateStr];
  const main = document.getElementById('main-content');
  const phaseMap = getPhaseMap();
  const canEditSchedule = Boolean(currentUser) && isCurrentOrFutureDateStr(dateStr);

  if (!dayData) {
    ensureScheduleYear(date.getFullYear());
    dayData = curriculum.schedule[dateStr] || emptyScheduleEntry(dateStr);
  }

  const phase = dayData.phase || phaseFromDate(dateStr);
  const phaseInfo = phaseMap[phase];
  const phaseColor = (phaseInfo && phaseInfo.color) || 'var(--accent)';
  const phaseName = (phaseInfo && phaseInfo.name) || phase || '—';
  const canEditChecklist = Boolean(currentUser) && isTodayDateStr(dateStr);
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

  function renderCardEditorHTML(section, valueLines, accentColor, options) {
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
  main.dataset.screen = `day:${dateStr}`;
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

  const jan1 = new Date(year, 0, 1);
  const startDate = new Date(jan1);
  startDate.setDate(startDate.getDate() - startDate.getDay());

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

  let monthLabelHTML = '';
  for (let i = 0; i < monthLabels.length; i++) {
    const startW = monthLabels[i].index;
    const endW = i < monthLabels.length - 1 ? monthLabels[i + 1].index : weeks.length;
    const span = endW - startW;
    const width = span * 14;
    monthLabelHTML += `<span class="activity-month-label" style="width:${width}px">${monthLabels[i].name}</span>`;
  }

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const dayLabelHTML = dayLabels
    .map(l => `<div class="activity-day-label">${l}</div>`)
    .join('');

  let totalDone = 0;
  let currentStreak = 0;

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
  let mobileRowsHTML = '';
  for (let w = 0; w < weeks.length; w++) {
    let cells = '';
    let mobileCells = '';
    let weekActive = 0;
    let weekDone = 0;
    const weekDays = weeks[w];
    for (let dow = 0; dow < 7; dow++) {
      const cellDate = weekDays[dow];
      const ds = fmt(cellDate);
      const isFuture = cellDate > today;
      const isToday = ds === todayStr;
      const { level, done, total } = getActivityLevel(ds);

      if (!isFuture && total > 0 && done > 0) {
        totalDone++;
      }

      if (!isFuture && total > 0) {
        weekActive++;
        if (done > 0) weekDone++;
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
      mobileCells += `<div class="${classes.join(' ')}" data-level="${lvl}" data-tip="${tip}"></div>`;
    }
    colsHTML += `<div class="activity-col">${cells}</div>`;

    const weekHasCurrentYearDay = weekDays.some(day => day.getFullYear() === year);
    if (weekHasCurrentYearDay) {
      const weekLabel = weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const weekSummary = weekActive > 0 ? `${weekDone}/${weekActive}` : '0/0';
      mobileRowsHTML += `<div class="activity-mobile-row">
        <div class="activity-mobile-week-label">${weekLabel}</div>
        <div class="activity-mobile-grid">${mobileCells}</div>
        <div class="activity-mobile-summary">${weekSummary}</div>
      </div>`;
    }
  }

  return `<div class="card activity-graph-card">
    <div class="activity-graph-header">
      <div class="card-label" style="margin-bottom:0"><div class="card-label-dot" style="background:var(--green)"></div>Activity — ${year}</div>
      <div class="activity-graph-stats">
        <span class="activity-stat"><strong>${totalDone}</strong> active days</span>
        <span class="activity-stat"><strong>${currentStreak}</strong> day streak</span>
      </div>
    </div>
    <div class="activity-graph-wrapper activity-graph-wrapper-desktop">
      <div class="activity-month-labels">${monthLabelHTML}</div>
      <div class="activity-graph-inner">
        <div class="activity-day-labels">${dayLabelHTML}</div>
        ${colsHTML}
      </div>
    </div>
    <div class="activity-graph-mobile">
      <div class="activity-mobile-daynames">
        <div class="activity-mobile-week-label">Week</div>
        <div class="activity-mobile-day-grid">
          <div class="activity-mobile-day-label">S</div>
          <div class="activity-mobile-day-label">M</div>
          <div class="activity-mobile-day-label">T</div>
          <div class="activity-mobile-day-label">W</div>
          <div class="activity-mobile-day-label">T</div>
          <div class="activity-mobile-day-label">F</div>
          <div class="activity-mobile-day-label">S</div>
        </div>
        <div class="activity-mobile-summary">Done</div>
      </div>
      <div class="activity-mobile-weeklist">${mobileRowsHTML}</div>
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

async function init() {
  viewDate = new Date();
  viewDate.setHours(0, 0, 0, 0);
  rebuildCurriculum();
  applyTheme(loadTheme());
  buildSidebar();
  updateHeader();
  updateAuthControls();

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.onclick = toggleTheme;

  document.getElementById('prev-day').onclick = () => {
    scheduleEditState = null;
    viewDate.setDate(viewDate.getDate() - 1);
    navigateTo(viewDate);
  };

  document.getElementById('next-day').onclick = () => {
    scheduleEditState = null;
    viewDate.setDate(viewDate.getDate() + 1);
    navigateTo(viewDate);
  };

  document.getElementById('go-today').onclick = () => {
    scheduleEditState = null;
    viewDate = new Date();
    viewDate.setHours(0, 0, 0, 0);
    navigateTo(viewDate);
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') document.getElementById('prev-day').click();
    if (e.key === 'ArrowRight') document.getElementById('next-day').click();
  });

  const client = initializeSupabaseClient();
  if (!client) {
    renderSetupState();
    return;
  }

  renderLoadingState('Loading your plan...');

  client.auth.onAuthStateChange((_event, session) => {
    handleSessionChange(session);
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    handleSyncError(error, 'Could not initialize authentication');
    return;
  }

  await handleSessionChange(data.session);
  if (!data.session && !hasPendingAuthCallback()) {
    const restoredSession = await restoreSessionFromBackup(client);
    if (restoredSession) await handleSessionChange(restoredSession);
  }
}

init();
