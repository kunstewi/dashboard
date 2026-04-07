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
  console.log(`  ${c.dim}Add ${fieldName} entries - press Enter on empty line to finish${c.reset}`);
  console.log(`  ${c.dim}After each label you'll be asked for an optional link${c.reset}`);
  const items = [];
  while (true) {
    const val = (await ask(`    ${fieldName} ${items.length + 1}: `)).trim();
    if (!val) break;
    const link = (await ask(`    ${c.dim}link (optional):${c.reset} `)).trim();
    items.push(link ? { label: val, link } : val);
  }
  return items;
}

async function promptMultipleWithCurrent(fieldName, current) {
  if (current.length > 0) {
    console.log(`  ${c.dim}Current ${fieldName}:${c.reset}`);
    current.forEach((item, i) => {
      console.log(`    ${c.dim}${i + 1}.${c.reset} ${formatItemDisplay(item)}`);
    });
    const action = (await ask(`  ${fieldName}: ${c.dim}(k)eep / (r)eplace / (a)dd more [k]${c.reset}: `)).trim().toLowerCase();
    if (action === 'r') return await promptMultiple(fieldName);
    if (action === 'a') {
      const extra = await promptMultiple(fieldName);
      return [...current, ...extra];
    }
    return current;
  }
  return await promptMultiple(fieldName);
}

async function addEntry() {
  console.log(`\n${c.cyan}Add a new schedule entry${c.reset}`);

  const date = (await ask('  Date (YYYY-MM-DD): ')).trim();
  if (!date || !isValidDate(date)) {
    console.log(`${c.red}  X Invalid date format. Use YYYY-MM-DD${c.reset}`);
    return;
  }

  const schedule = load();
  if (schedule[date]) {
    const overwrite = await ask(`  ${c.yellow}Entry for ${date} already exists.${c.reset} Overwrite? ${c.dim}(y/N)${c.reset}: `);
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

  const date = (await ask('  Enter date to update (YYYY-MM-DD): ')).trim();
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
  console.log(`\n${c.dim}  Leave text fields blank to keep current value${c.reset}`);

  const learn = await promptMultipleWithCurrent('learn', entry.learn);
  const revise = await promptMultipleWithCurrent('revise', entry.revise);
  const build = await promptMultipleWithCurrent('build', normArr(entry.build));
  const problem = await promptMultipleWithCurrent('problem', normArr(entry.problem));
  const tip = (await ask(`  Tip ${c.dim}[keep current]${c.reset}: `)).trim() || entry.tip;
  const phase = phaseFromDate(date);

  schedule[date] = { learn, revise, build, problem, tip, phase };
  save(schedule);
  console.log(`${c.green}  OK Entry for ${date} updated ${c.dim}(${phase})${c.reset}`);
}

async function resetEntry() {
  const schedule = load();
  const dates = Object.keys(schedule);
  if (dates.length === 0) {
    console.log(`${c.yellow}  No schedule entries to delete${c.reset}`);
    return;
  }

  const date = (await ask('  Enter date to delete (YYYY-MM-DD): ')).trim();
  if (!schedule[date]) {
    console.log(`${c.red}  X No entry found for ${date}${c.reset}`);
    return;
  }

  const entry = schedule[date];
  console.log(`${c.dim}    problem: [${formatItemList(entry.problem)}]  phase: ${entry.phase}${c.reset}`);
  const confirm = await ask(`  Reset entry for ${date} to empty defaults? ${c.dim}(y/N)${c.reset}: `);
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(`${c.dim}  Cancelled${c.reset}`);
    return;
  }

  schedule[date] = emptyScheduleEntry(date);
  save(schedule);
  console.log(`${c.green}  OK Entry for ${date} reset to defaults${c.reset}`);
}

async function resetAllEntries() {
  const confirm = await ask(`  ${c.red}Reset ALL schedule entries${c.reset} to empty defaults? ${c.dim}(y/N)${c.reset}: `);
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
  const options = ['Add', 'Update', 'Reset', 'Reset All', 'List', 'Exit'];
  options.forEach((opt, i) => {
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${opt}`);
  });
  const choice = (await ask(`\n  ${c.bold}>${c.reset} `)).trim();
  return parseInt(choice, 10);
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}  ┌────────────────────────────────┐${c.reset}`);
  console.log(`${c.bold}${c.magenta}  │   SDE Schedule Editor          │${c.reset}`);
  console.log(`${c.bold}${c.magenta}  └────────────────────────────────┘${c.reset}`);

  while (true) {
    const choice = await showScheduleMenu();

    switch (choice) {
      case 1: await addEntry(); break;
      case 2: await updateEntry(); break;
      case 3: await resetEntry(); break;
      case 4: await resetAllEntries(); break;
      case 5: listEntries(); break;
      case 6:
        console.log(`\n${c.dim}  Bye!${c.reset}\n`);
        rl.close();
        return;
      default:
        console.log(`${c.yellow}  Invalid choice${c.reset}`);
    }
  }
}

main();
