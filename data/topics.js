const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'topics.json');

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

function findKey(topics, search) {
  const s = search.toLowerCase();
  return Object.keys(topics).find(
    k => k === search || topics[k].label.toLowerCase().includes(s)
  );
}

module.exports = {
  async add(ask) {
    console.log(`\n${c.cyan}Add a new topic${c.reset}`);

    const key = (await ask('  Key (e.g. dsa_bfs): ')).trim();
    if (!key) { console.log(`${c.red}  ✗ Key is required${c.reset}`); return; }

    const topics = load();
    if (topics[key]) {
      console.log(`${c.red}  ✗ Key "${key}" already exists${c.reset}`);
      return;
    }

    const label = (await ask('  Label: ')).trim();
    if (!label) { console.log(`${c.red}  ✗ Label is required${c.reset}`); return; }

    const category = (await ask(`  Category ${c.dim}(DSA, JavaScript, TypeScript, Python, LLD, HLD, Machine Coding, Codebase, Fundamentals, Infra, Mock)${c.reset}: `)).trim();
    const phase = (await ask(`  Phase ${c.dim}(p1–p5)${c.reset}: `)).trim();

    topics[key] = { label, category, phase };
    save(topics);
    console.log(`${c.green}  ✓ Topic "${label}" added as ${c.bold}${key}${c.reset}`);
  },

  async update(ask) {
    const topics = load();
    const keys = Object.keys(topics);
    if (keys.length === 0) { console.log(`${c.yellow}  No topics to update${c.reset}`); return; }

    const search = (await ask('  Enter topic key or label to update: ')).trim();
    const foundKey = findKey(topics, search);

    if (!foundKey) { console.log(`${c.red}  ✗ Topic not found${c.reset}`); return; }

    const t = topics[foundKey];
    console.log(`\n${c.dim}  Editing: ${foundKey} → ${t.label}  [${t.category}]  ${t.phase}${c.reset}`);
    console.log(`${c.dim}  Leave blank to keep current value${c.reset}`);

    const label = (await ask(`  Label ${c.dim}[${t.label}]${c.reset}: `)).trim() || t.label;
    const category = (await ask(`  Category ${c.dim}[${t.category}]${c.reset}: `)).trim() || t.category;
    const phase = (await ask(`  Phase ${c.dim}[${t.phase}]${c.reset}: `)).trim() || t.phase;

    topics[foundKey] = { label, category, phase };
    save(topics);
    console.log(`${c.green}  ✓ Topic "${label}" updated${c.reset}`);
  },

  async remove(ask) {
    const topics = load();
    const keys = Object.keys(topics);
    if (keys.length === 0) { console.log(`${c.yellow}  No topics to delete${c.reset}`); return; }

    const search = (await ask('  Enter topic key or label to delete: ')).trim();
    const foundKey = findKey(topics, search);

    if (!foundKey) { console.log(`${c.red}  ✗ Topic not found${c.reset}`); return; }

    const t = topics[foundKey];
    const confirm = await ask(`  Delete "${t.label}" (${foundKey})? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    delete topics[foundKey];
    save(topics);
    console.log(`${c.green}  ✓ Topic deleted${c.reset}`);
  },

  async removeAll(ask) {
    const confirm = await ask(`  ${c.red}Delete ALL topics${c.reset} and keep one blank example? ${c.dim}(y/N)${c.reset}: `);
    if (confirm.trim().toLowerCase() !== 'y') { console.log(`${c.dim}  Cancelled${c.reset}`); return; }

    save({ example_topic: { label: '', category: '', phase: '' } });
    console.log(`${c.green}  ✓ All topics removed. One blank example kept.${c.reset}`);
  },

  list() {
    const topics = load();
    const keys = Object.keys(topics);

    // Group by category
    const grouped = {};
    keys.forEach(k => {
      const cat = topics[k].category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ key: k, ...topics[k] });
    });

    console.log(`\n${c.cyan}  Topics (${keys.length})${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(60)}${c.reset}`);

    Object.keys(grouped).sort().forEach(cat => {
      console.log(`\n  ${c.bold}${cat}${c.reset} ${c.dim}(${grouped[cat].length})${c.reset}`);
      grouped[cat].forEach(t => {
        console.log(`    ${c.dim}${t.key}${c.reset}  ${t.label}  ${c.dim}${t.phase}${c.reset}`);
      });
    });
  },
};
