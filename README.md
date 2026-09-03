# The M2 Top 25

A weekly college football ballot poll, plus preseason predictions, for the M2 group.

## What this is

- `server.js` — a small Express server with a generic document store backed by
  SQLite (`data/poll.db`). It mimics the doc/collection shape the frontend was
  originally written against, so the frontend logic barely had to change.
- `public/index.html` — the entire frontend (single file: HTML, CSS, and JS).
- Nobody needs an account. Identity is just a name someone types once
  ("Create user"), stored in their browser's localStorage.

## Running locally

```bash
npm install
ADMIN_PASSWORD=pickapassword npm start
```

Then open http://localhost:3000

If you don't set `ADMIN_PASSWORD`, the site works fine for everyone *except*
the admin delete buttons, which stay disabled.

## Deploying to Render.com

1. Push this folder to a GitHub repo.
2. In Render: **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment variable:** `ADMIN_PASSWORD` = whatever password you want
     for the hidden admin panel.
4. **Important — add a persistent disk.** Render's default filesystem resets
   on every deploy and every restart. Since the poll data lives in a SQLite
   file on disk, you must attach a disk or you will lose all ballots the next
   time you push a change or the service restarts:
   - In the service's **Disks** tab, add a disk (1 GB is plenty).
   - **Mount path:** `/data`
   - Add an environment variable `DATA_DIR` = `/data` so the server writes
     the database there instead of inside the app folder.
5. Deploy. Render gives you a public URL like `https://your-app.onrender.com`
   — that's the link to share with the group. No Claude account needed by
   anyone.

### Will it "update weekly" on its own?

Yes, automatically, with no action from you:
- The current week auto-selects itself based on today's date (calculated
  from the season's Week 1 Saturday), so voters always land on the right
  week without you doing anything.
- Results unlock at Tuesday 8:00 AM automatically once the first ballot for
  that week comes in — that's computed client-side from a timestamp set
  the first time someone submits.
- Preseason Predictions lock automatically at **September 5, 2026, 12:00 PM
  ET** (hardcoded in `public/index.html` as `PREDICTIONS_LOCK_AT`) — after
  that, submissions freeze and everyone's picks become visible.

The only things that ever need you:
- Redeploying if you want to change anything about the site itself.
- Using the admin panel (see below) if someone needs a bad entry cleared.
- Nothing else — there's no season rollover logic yet, so if you want a
  fresh poll next season, that'd be a follow-up change.

## Admin panel (for you)

Go to `https://your-app.onrender.com/#admin` and click the **Admin** tab that
appears. It'll ask for the `ADMIN_PASSWORD` you set above (once per browser
session). From there you can delete a bad ballot, a bad prediction, or a
duplicate/mistyped user profile — deleting just clears the entry so that
person can resubmit; it does not let you edit someone else's picks for them.

## Data

Everything lives in `data/poll.db` (SQLite). It is not committed to git.
Back it up periodically if you care about historical results (copy the file
off the Render disk, or download it via Render's shell).
