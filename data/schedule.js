const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'schedule.json');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
};

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

// ── Item format helpers ──

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
  return link ? `${label} ${c.dim}→ ${link}${c.reset}` : label;
}

function formatItemShort(item) {
  const label = getItemLabel(item);
  const link = getItemLink(item);
  return link ? `${label} ${c.dim}[↗]${c.reset}` : label;
}

function normArr(val) {
  return Array.isArray(val) ? val : (val ? [val] : []);
}

function formatItemList(items) {
  const arr = normArr(items);
  if (arr.length === 0) return '';
  return arr.map(i => formatItemDisplay(i)).join(', ');
}

// ── Prompt helpers ──

async function promptMultiple(ask, fieldName) {
  console.log(`  ${c.dim}Add ${fieldName} entries — press Enter on empty line to finish${c.reset}`);
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

// (removed — build/problem now use promptMultiple like learn/revise)

async function promptMultipleWithCurrent(ask, fieldName, current) {
  if (current.length > 0) {
    console.log(`  ${c.dim}Current ${fieldName}:${c.reset}`);
    current.forEach((item, i) => {
      console.log(`    ${c.dim}${i + 1}.${c.reset} ${formatItemDisplay(item)}`);
    });
    const action = (await ask(`  ${fieldName}: ${c.dim}(k)eep / (r)eplace / (a)dd more [k]${c.reset}: `)).trim().toLowerCase();
    if (action === 'r') {
      return await promptMultiple(ask, fieldName);
    } else if (action === 'a') {
      const extra = await promptMultiple(ask, fieldName);
      return [...current, ...extra];
    }
    return current;
  }
  return await promptMultiple(ask, fieldName);
}

module.exports = {
  async add(ask) {
    console.log(`\n${c.cyan}Add a new schedule entry${c.reset}`);

    const date = (await ask('  Date (YYYY-MM-DD): ')).trim();
    if (!date || !isValidDate(date)) {
      console.log(`${c.red}  ✗ Invalid date format. Use YYYY-MM-DD${c.reset}`);
      return;
    }

    const schedule = load();
    if (schedule[date]) {
      const overwrite = await ask(`  ${c.yellow}Entry for ${date} already exists.${c.reset} Overwrite? ${c.dim}(y/N)${c.reset}: `);
      if (overwrite.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }
    }

    const learn = await promptMultiple(ask, 'learn');
    const revise = await promptMultiple(ask, 'revise');
    const build = await promptMultiple(ask, 'build');
    const problem = await promptMultiple(ask, 'problem');
    const tip = (await ask('  Tip: ')).trim();
    const phase = phaseFromDate(date);

    schedule[date] = { learn, revise, build, problem, tip, phase };

    // Sort schedule keys chronologically
    const sorted = {};
    Object.keys(schedule).sort().forEach(k => { sorted[k] = schedule[k]; });
    save(sorted);

    console.log(`${c.green}  ✓ Entry for ${date} added ${c.dim}(${phase})${c.reset}`);
  },

  async update(ask) {
    const schedule = load();
    const dates = Object.keys(schedule);
    if (dates.length === 0) { console.log(`${c.yellow}  No schedule entries to update${c.reset}`); return; }

    const date = (await ask('  Enter date to update (YYYY-MM-DD): ')).trim();
    if (!schedule[date]) {
      console.log(`${c.red}  ✗ No entry found for ${date}${c.reset}`);
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

    const learn = await promptMultipleWithCurrent(ask, 'learn', entry.learn);
    const revise = await promptMultipleWithCurrent(ask, 'revise', entry.revise);
    const build = await promptMultipleWithCurrent(ask, 'build', normArr(entry.build));
    const problem = await promptMultipleWithCurrent(ask, 'problem', normArr(entry.problem));
    const tip = (await ask(`  Tip ${c.dim}[keep current]${c.reset}: `)).trim() || entry.tip;
    const phase = phaseFromDate(date);

    schedule[date] = { learn, revise, build, problem, tip, phase };
    save(schedule);
    console.log(`${c.green}  ✓ Entry for ${date} updated ${c.dim}(${phase})${c.reset}`);
  },

  async remove(ask) {
    const schedule = load();
    const dates = Object.keys(schedule);
    if (dates.length === 0) { console.log(`${c.yellow}  No schedule entries to delete${c.reset}`); return; }

    const date = (await ask('  Enter date to delete (YYYY-MM-DD): ')).trim();
    if (!schedule[date]) {
      console.log(`${c.red}  ✗ No entry found for ${date}${c.reset}`);
      return;
    }

    const entry = schedule[date];
    console.log(`${c.dim}    problem: [${formatItemList(entry.problem)}]  phase: ${entry.phase}${c.reset}`);
    const confirm = await ask(`  Reset entry for ${date} to empty defaults? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    schedule[date] = emptyScheduleEntry(date);
    save(schedule);
    console.log(`${c.green}  ✓ Entry for ${date} reset to defaults${c.reset}`);
  },

  async removeAll(ask) {
    const confirm = await ask(`  ${c.red}Reset ALL schedule entries${c.reset} to empty defaults? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    const schedule = load();
    const dates = Object.keys(schedule);
    if (dates.length === 0) {
      save({ '2026-01-01': emptyScheduleEntry('2026-01-01') });
      console.log(`${c.green}  ✓ Schedule was empty. One default entry kept (2026-01-01).${c.reset}`);
      return;
    }

    const resetSchedule = {};
    dates.sort().forEach(date => {
      resetSchedule[date] = emptyScheduleEntry(date);
    });
    save(resetSchedule);
    console.log(`${c.green}  ✓ All schedule entries reset to defaults${c.reset}`);
  },

  list() {
    const schedule = load();
    const dates = Object.keys(schedule).sort();

    // Group by phase
    const grouped = {};
    dates.forEach(d => {
      const phase = schedule[d].phase || 'none';
      if (!grouped[phase]) grouped[phase] = [];
      grouped[phase].push(d);
    });

    console.log(`\n${c.cyan}  Schedule (${dates.length} entries)${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);

    Object.keys(grouped).sort().forEach(phase => {
      const phaseDates = grouped[phase];
      const first = phaseDates[0];
      const last = phaseDates[phaseDates.length - 1];
      console.log(`\n  ${c.bold}${phase}${c.reset} ${c.dim}— ${phaseDates.length} days (${first} → ${last})${c.reset}`);

      phaseDates.forEach(d => {
        const e = schedule[d];
        const learnCount = e.learn.length;
        const reviseCount = e.revise.length;
        const probArr = Array.isArray(e.problem) ? e.problem : (e.problem ? [e.problem] : []);
        const buildArr = Array.isArray(e.build) ? e.build : (e.build ? [e.build] : []);
        console.log(`    ${d}  ${c.dim}L:${learnCount} R:${reviseCount} P:${probArr.length} B:${buildArr.length}${c.reset}`);
      });
    });
  },
};
