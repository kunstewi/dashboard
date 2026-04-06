# SDE Study Dashboard

Your personal daily study tracker for the April–August SDE 1/2 preparation plan.

## Files
- `index.html` — the dashboard UI
- `curriculum.json` — the full study plan (every day mapped out)

## How to run

You MUST serve this over HTTP (not by opening the HTML file directly) because it loads `curriculum.json` via fetch.

### Option 1 — Node.js (recommended)
```bash
npx serve .
```
Then open http://localhost:3000

### Option 2 — Python
```bash
python3 -m http.server 8080
```
Then open http://localhost:8080

### Option 3 — VS Code
Install the "Live Server" extension, right-click index.html → "Open with Live Server"

## Features
- Shows today's topics to learn, topics to revise, problem of the day, and build task
- Navigate day by day with ← → buttons or arrow keys
- Check off each task as you complete it (saves to localStorage)
- Phase progress bar in the header
- Sidebar with full timeline navigation

## Customising
All study content is in `curriculum.json`. You can edit:
- `topics` — add new topics or change labels
- `schedule` — change what's scheduled on any day
- Each day has: `learn`, `revise`, `build`, `problem`, `tip`, `phase`

## Dates covered
April 6 – August 31, 2026 (147 days)
