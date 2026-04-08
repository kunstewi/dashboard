const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FILE = path.join(__dirname, 'data', 'schedule.json');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
};

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function load() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
}

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) {
    return value.some(item => {
      if (typeof item === 'string') return item.trim().length > 0;
      if (item && typeof item === 'object') {
        return Object.values(item).some(v => typeof v === 'string' ? v.trim().length > 0 : Boolean(v));
      }
      return Boolean(item);
    });
  }

  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
}

function entryHasUserContent(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return hasMeaningfulValue(entry.learn)
    || hasMeaningfulValue(entry.revise)
    || hasMeaningfulValue(entry.build)
    || hasMeaningfulValue(entry.problem)
    || hasMeaningfulValue(entry.tip);
}

function phaseFromDate(dateStr) {
  const month = parseInt(dateStr.split('-')[1], 10);
  return `p${month}`;
}

function emptyScheduleEntry(dateStr) {
  return {
    learn: [],
    revise: [],
    build: [],
    problem: [],
    tip: '',
    phase: phaseFromDate(dateStr),
  };
}

function getItemLabel(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return item.label || '';
  return String(item);
}

function getItemLink(item) {
  if (item && typeof item === 'object') return item.link || '';
  return '';
}

function formatItemDisplay(item) {
  const label = getItemLabel(item);
  const link = getItemLink(item);
  return link ? `${label} ${c.dim}-> ${link}${c.reset}` : label;
}

function normArr(val) {
  return Array.isArray(val) ? val : (val ? [val] : []);
}

function formatItemList(items) {
  const arr = normArr(items);
  if (arr.length === 0) return '';
  return arr.map(i => formatItemDisplay(i)).join(', ');
}

async function promptMultiple(fieldName) {
  const items = [];
  while (true) {
    const val = (await ask(`  ${fieldName} ${items.length + 1}: `)).trim();
    if (!val) break;
    const link = (await ask('  link: ')).trim();
    items.push(link ? { label: val, link } : val);
  }
  return items;
}

async function promptMultipleWithCurrent(fieldName, current) {
  if (current.length > 0) {
    console.log(`  ${fieldName}:`);
    current.forEach((item, i) => {
      console.log(`    ${c.dim}${i + 1}.${c.reset} ${formatItemDisplay(item)}`);
    });
    const action = (await ask(`  ${fieldName} [k/r/a]: `)).trim().toLowerCase();
    if (action === 'r' || action === 'replace') return await promptMultiple(fieldName);
    if (action === 'a' || action === 'add') {
      const extra = await promptMultiple(fieldName);
      return [...current, ...extra];
    }
    return current;
  }
  return await promptMultiple(fieldName);
}

async function addEntry() {
  const today = getTodayDate();
  const rawDate = (await ask(`\n  Date [YYYY-MM-DD, Enter=${today}]: `)).trim();
  const date = rawDate || today;
  if (!isValidDate(date)) {
    console.log(`${c.red}  X Invalid date format. Use YYYY-MM-DD${c.reset}`);
    return;
  }

  const schedule = load();
  if (entryHasUserContent(schedule[date])) {
    const overwrite = await ask(`  ${c.yellow}${date} has values.${c.reset} Overwrite? ${c.dim}(y/N)${c.reset}: `);
    if (overwrite.trim().toLowerCase() !== 'y') {
      console.log(`${c.dim}  Cancelled${c.reset}`);
      return;
    }
  }

  const learn = await promptMultiple('learn');
  const revise = await promptMultiple('revise');
  const build = await promptMultiple('build');
  const problem = await promptMultiple('problem');
  const tip = (await ask('  Tip: ')).trim();
  const phase = phaseFromDate(date);

  schedule[date] = { learn, revise, build, problem, tip, phase };

  const sorted = {};
  Object.keys(schedule).sort().forEach(k => { sorted[k] = schedule[k]; });
  save(sorted);

  console.log(`${c.green}  OK Entry for ${date} added ${c.dim}(${phase})${c.reset}`);
}

async function updateEntry() {
  const schedule = load();
  const dates = Object.keys(schedule);
  if (dates.length === 0) {
    console.log(`${c.yellow}  No schedule entries to update${c.reset}`);
    return;
  }

  const today = getTodayDate();
  const rawDate = (await ask(`\n  Date [YYYY-MM-DD, Enter=${today}]: `)).trim();
  const date = rawDate || today;
  if (!schedule[date]) {
    console.log(`${c.red}  X No entry found for ${date}${c.reset}`);
    return;
  }

  const entry = schedule[date];
  console.log(`\n${c.dim}  Current entry for ${date}:${c.reset}`);
  console.log(`    learn:   [${formatItemList(entry.learn)}]`);
  console.log(`    revise:  [${formatItemList(entry.revise)}]`);
  console.log(`    build:   [${formatItemList(entry.build)}]`);
  console.log(`    problem: [${formatItemList(entry.problem)}]`);
  console.log(`    tip:     ${entry.tip}`);

  const learn = await promptMultipleWithCurrent('learn', entry.learn);
  const revise = await promptMultipleWithCurrent('revise', entry.revise);
  const build = await promptMultipleWithCurrent('build', normArr(entry.build));
  const problem = await promptMultipleWithCurrent('problem', normArr(entry.problem));
  const tip = (await ask('  Tip [Enter=keep]: ')).trim() || entry.tip;
  const phase = phaseFromDate(date);

  schedule[date] = { learn, revise, build, problem, tip, phase };
  save(schedule);
  console.log(`${c.green}  OK Entry for ${date} updated ${c.dim}(${phase})${c.reset}`);
}

async function resetEntry() {
  const schedule = load();
  const dates = Object.keys(schedule);
  if (dates.length === 0) {
    console.log(`${c.yellow}  No schedule entries to reset${c.reset}`);
    return;
  }

  const date = (await ask('\n  Date to reset (YYYY-MM-DD): ')).trim();
  if (!schedule[date]) {
    console.log(`${c.red}  X No entry found for ${date}${c.reset}`);
    return;
  }

  const confirm = await ask(`  Reset ${date}? ${c.dim}(y/N)${c.reset}: `);
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(`${c.dim}  Cancelled${c.reset}`);
    return;
  }

  schedule[date] = emptyScheduleEntry(date);
  save(schedule);
  console.log(`${c.green}  OK Entry for ${date} reset to defaults${c.reset}`);
}

async function resetAllEntries() {
  const confirm = await ask(`\n  ${c.red}Reset all entries?${c.reset} ${c.dim}(y/N)${c.reset}: `);
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(`${c.dim}  Cancelled${c.reset}`);
    return;
  }

  const schedule = load();
  const dates = Object.keys(schedule);
  if (dates.length === 0) {
    save({ '2026-01-01': emptyScheduleEntry('2026-01-01') });
    console.log(`${c.green}  OK Schedule was empty. One default entry kept (2026-01-01).${c.reset}`);
    return;
  }

  const resetSchedule = {};
  dates.sort().forEach(date => {
    resetSchedule[date] = emptyScheduleEntry(date);
  });
  save(resetSchedule);
  console.log(`${c.green}  OK All schedule entries reset to defaults${c.reset}`);
}

function listEntries() {
  const schedule = load();
  const dates = Object.keys(schedule).sort();
  const grouped = {};

  dates.forEach(d => {
    const phase = schedule[d].phase || 'none';
    if (!grouped[phase]) grouped[phase] = [];
    grouped[phase].push(d);
  });

  console.log(`\n${c.cyan}  Schedule (${dates.length} entries)${c.reset}`);
  console.log(`  ${c.dim}${'-'.repeat(60)}${c.reset}`);

  Object.keys(grouped).sort().forEach(phase => {
    const phaseDates = grouped[phase];
    const first = phaseDates[0];
    const last = phaseDates[phaseDates.length - 1];
    console.log(`\n  ${c.bold}${phase}${c.reset} ${c.dim}- ${phaseDates.length} days (${first} -> ${last})${c.reset}`);

    phaseDates.forEach(d => {
      const e = schedule[d];
      const learnCount = normArr(e.learn).length;
      const reviseCount = normArr(e.revise).length;
      const probCount = normArr(e.problem).length;
      const buildCount = normArr(e.build).length;
      console.log(`    ${d}  ${c.dim}L:${learnCount} R:${reviseCount} P:${probCount} B:${buildCount}${c.reset}`);
    });
  });
}

async function showScheduleMenu() {
  console.log(`\n${c.bold}${c.cyan}Schedule Editor${c.reset}`);
  const options = [
    'Add',
    'Update',
    'Reset',
    'Reset All',
    'List',
    'Exit',
  ];
  options.forEach((opt, i) => {
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${opt}`);
  });

  const input = (await ask(`\n  ${c.bold}>${c.reset} `)).trim().toLowerCase();
  const normalized = input.replace(/\s+/g, '');
  const aliases = {
    '1': 'add',
    a: 'add',
    add: 'add',
    '2': 'update',
    u: 'update',
    update: 'update',
    '3': 'reset',
    r: 'reset',
    reset: 'reset',
    '4': 'resetAll',
    rall: 'resetAll',
    resetall: 'resetAll',
    '5': 'list',
    l: 'list',
    list: 'list',
    '6': 'exit',
    e: 'exit',
    exit: 'exit',
  };

  return aliases[normalized] || null;
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}  ┌────────────────────────────────┐${c.reset}`);
  console.log(`${c.bold}${c.magenta}  │   SDE Schedule Editor          │${c.reset}`);
  console.log(`${c.bold}${c.magenta}  └────────────────────────────────┘${c.reset}`);

  while (true) {
    const choice = await showScheduleMenu();

    switch (choice) {
      case 'add': await addEntry(); break;
      case 'update': await updateEntry(); break;
      case 'reset': await resetEntry(); break;
      case 'resetAll': await resetAllEntries(); break;
      case 'list': listEntries(); break;
      case 'exit':
        console.log(`\n${c.dim}  Bye!${c.reset}\n`);
        rl.close();
        return;
      default:
        console.log(`${c.yellow}  Invalid choice${c.reset}`);
    }
  }
}

main();
