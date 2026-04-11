# SDE Study Dashboard

GitHub Pages-hosted study dashboard with GitHub login and Supabase-backed task storage.

## What changed
- The dashboard is still a static `HTML/CSS/JS` site.
- `schedule.json` is no longer used.
- The default empty day structure now lives in `main.js`.
- Tasks, completions, and graph state are stored in Supabase.
- GitHub authentication is handled through Supabase Auth.

## Files
- `index.html` — UI shell and Supabase script includes
- `main.js` — dashboard logic, auth flow, Supabase reads/writes
- `supabase-config.js` — paste your Supabase URL + anon key here
- `supabase/schema.sql` — run this in Supabase SQL Editor

## Supabase setup

### 1. Create a Supabase project
Copy these two values from the project settings:
- Project URL
- anon public key

### 2. Run the schema
Open the Supabase SQL Editor and run:
- `supabase/schema.sql`

This creates:
- `profiles`
- `schedule_days`
- row-level-security policies so each signed-in user can only read/write their own data

### 3. Enable GitHub login in Supabase
In Supabase:
- Go to `Authentication` -> `Providers` -> `GitHub`
- Enable GitHub provider
- Supabase will show you a callback URL to use in GitHub OAuth

### 4. Create a GitHub OAuth app
In GitHub:
- Create an OAuth App
- Paste the Supabase callback URL into the OAuth app callback field
- Copy the GitHub client ID and client secret back into Supabase GitHub provider settings

### 5. Add redirect URLs in Supabase
In Supabase Auth URL settings, add your app URLs, for example:
- `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`
- `http://127.0.0.1:5500/`
- `http://localhost:5500/`

## Final place to paste the Supabase config
Open:
- `supabase-config.js`

Replace the placeholders with your real values:

```js
window.SDE_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

This file is the only place you need to paste the Supabase frontend config.

## Deployment
Deploy the repo to GitHub Pages the same way you normally do.

Important:
- `supabase-config.js` must be committed so GitHub Pages can load it
- the anon key is expected to be public in browser apps
- your data is protected by Supabase Auth + RLS, not by hiding the anon key

## Local development
You can still open the site with a simple static server, for example:

```bash
python3 -m http.server 8080
```

Then open:
- `http://localhost:8080`

Make sure that URL is also added to Supabase redirect URLs if you want GitHub login to work locally.

## App behavior
- If a date has no saved row in Supabase, the dashboard shows the default empty state
- Editing tasks creates or updates that day's row in Supabase
- Clearing a day back to the default empty state removes the stored row
- The activity graph is computed from Supabase-backed schedule data and completion state
- Theme preference still stays browser-local

## Notes
- The old CLI and `schedule.json` flow are no longer part of the app runtime
- If you had old local-only data in a browser, it will not automatically sync unless we add a one-time importer
