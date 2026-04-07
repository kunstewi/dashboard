const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'phases.json');

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

module.exports = {
  async add(ask) {
    console.log(`\n${c.cyan}Add a new phase${c.reset}`);

    const id = (await ask('  ID (e.g. p6): ')).trim();
    if (!id) { console.log(`${c.red}  ✗ ID is required${c.reset}`); return; }

    const phases = load();
    if (phases.some(p => p.id === id)) {
      console.log(`${c.red}  ✗ Phase "${id}" already exists${c.reset}`);
      return;
    }

    const name = (await ask('  Name: ')).trim();
    if (!name) { console.log(`${c.red}  ✗ Name is required${c.reset}`); return; }

    const months = (await ask('  Months: ')).trim();
    const color = (await ask(`  Color ${c.dim}[#888888]${c.reset}: `)).trim() || '#888888';

    phases.push({ id, name, months, color });
    save(phases);
    console.log(`${c.green}  ✓ Phase "${name}" added${c.reset}`);
  },

  async update(ask) {
    const phases = load();
    if (phases.length === 0) { console.log(`${c.yellow}  No phases to update${c.reset}`); return; }

    this.list();
    const search = (await ask('\n  Enter phase name or ID to update: ')).trim();
    const idx = phases.findIndex(
      p => p.id === search || p.name.toLowerCase() === search.toLowerCase()
    );

    if (idx === -1) { console.log(`${c.red}  ✗ Phase not found${c.reset}`); return; }

    const phase = phases[idx];
    console.log(`\n${c.dim}  Leave blank to keep current value${c.reset}`);

    const id = (await ask(`  ID ${c.dim}[${phase.id}]${c.reset}: `)).trim() || phase.id;
    const name = (await ask(`  Name ${c.dim}[${phase.name}]${c.reset}: `)).trim() || phase.name;
    const months = (await ask(`  Months ${c.dim}[${phase.months}]${c.reset}: `)).trim() || phase.months;
    const color = (await ask(`  Color ${c.dim}[${phase.color}]${c.reset}: `)).trim() || phase.color;

    phases[idx] = { id, name, months, color };
    save(phases);
    console.log(`${c.green}  ✓ Phase "${name}" updated${c.reset}`);
  },

  async remove(ask) {
    const phases = load();
    if (phases.length === 0) { console.log(`${c.yellow}  No phases to delete${c.reset}`); return; }

    this.list();
    const search = (await ask('\n  Enter phase name or ID to delete: ')).trim();
    const idx = phases.findIndex(
      p => p.id === search || p.name.toLowerCase() === search.toLowerCase()
    );

    if (idx === -1) { console.log(`${c.red}  ✗ Phase not found${c.reset}`); return; }

    const confirm = await ask(`  Delete "${phases[idx].name}" (${phases[idx].id})? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    phases.splice(idx, 1);
    save(phases);
    console.log(`${c.green}  ✓ Phase deleted${c.reset}`);
  },

  async removeAll(ask) {
    const confirm = await ask(`  ${c.red}Delete ALL phases${c.reset} and keep one blank example? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    save([{ id: '', name: '', months: '', color: '#888888' }]);
    console.log(`${c.green}  ✓ All phases removed. One blank example kept.${c.reset}`);
  },

  list() {
    const phases = load();
    console.log(`\n${c.cyan}  Phases (${phases.length})${c.reset}`);
    if (phases.length === 0) {
      console.log(`  ${c.dim}(no phases found)${c.reset}`);
      return;
    }

    const rows = phases.map(p => ({
      id: p.id || '(no id)',
      name: p.name || '(blank)',
      months: p.months || '—',
      color: p.color || '—',
    }));

    const headers = { id: 'ID', name: 'Name', months: 'Months', color: 'Color' };
    const idWidth = Math.max(headers.id.length, ...rows.map(r => r.id.length));
    const nameWidth = Math.max(headers.name.length, ...rows.map(r => r.name.length));
    const monthsWidth = Math.max(headers.months.length, ...rows.map(r => r.months.length));
    const colorWidth = Math.max(headers.color.length, ...rows.map(r => r.color.length));

    const tableWidth = idWidth + 2 + nameWidth + 2 + 1 + 2 + monthsWidth + 2 + colorWidth;
    console.log(`  ${c.dim}${'─'.repeat(tableWidth)}${c.reset}`);
    console.log(
      `  ${c.dim}${headers.id.padEnd(idWidth)}  ${headers.name.padEnd(nameWidth)}  │  ${headers.months.padEnd(monthsWidth)}  ${headers.color.padEnd(colorWidth)}${c.reset}`
    );
    console.log(`  ${c.dim}${'─'.repeat(tableWidth)}${c.reset}`);

    rows.forEach(r => {
      console.log(
        `  ${c.bold}${r.id.padEnd(idWidth)}${c.reset}  ${r.name.padEnd(nameWidth)}  ${c.dim}│${c.reset}  ${c.dim}${r.months.padEnd(monthsWidth)}  ${r.color.padEnd(colorWidth)}${c.reset}`
      );
    });
  },
};
