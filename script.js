const readline = require('readline');
const schedule = require('./data/schedule');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
};

async function showMenu(title, options) {
  console.log(`\n${c.bold}${c.cyan}${title}${c.reset}`);
  options.forEach((opt, i) => {
    console.log(`  ${c.dim}${i + 1}.${c.reset} ${opt}`);
  });
  const choice = (await ask(`\n  ${c.bold}>${c.reset} `)).trim();
  return parseInt(choice);
}

async function manageModule(name, mod) {
  while (true) {
    const choice = await showMenu(`${name}`, [
      'Add',
      'Update',
      'Reset',
      'Reset All',
      'List',
      'Back',
    ]);

    switch (choice) {
      case 1: await mod.add(ask); break;
      case 2: await mod.update(ask); break;
      case 3: await mod.remove(ask); break;
      case 4: await mod.removeAll(ask); break;
      case 5: mod.list(); break;
      case 6: return;
      default: console.log(`${c.yellow}  Invalid choice${c.reset}`);
    }
  }
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}  ┌────────────────────────────────┐${c.reset}`);
  console.log(`${c.bold}${c.magenta}  │   SDE Curriculum Manager       │${c.reset}`);
  console.log(`${c.bold}${c.magenta}  └────────────────────────────────┘${c.reset}`);

  while (true) {
    const choice = await showMenu('What would you like to manage?', ['Schedule', 'Exit']);

    switch (choice) {
      case 1: await manageModule('Schedule', schedule); break;
      case 2:
        console.log(`\n${c.dim}  Bye!${c.reset}\n`);
        rl.close();
        return;
      default: console.log(`${c.yellow}  Invalid choice${c.reset}`);
    }
  }
}

main();
