# نظام إدارة مناوبات تخطيط القلب · ECG Shift Management

واجهة النظام باللغة **العربية** افتراضياً (من اليمين إلى اليسار)، مع زر للتبديل إلى الإنجليزية.
The interface is **Arabic by default** (right-to-left), with a one-click switch to English.

Shift scheduling web app for an ECG technician team.
**Frontend:** Vue 3 + Vite · **Backend:** Node.js + Express · **Database:** a JSON file (`server/data/db.json`).

## Features

**Admin**
- Dashboard: who is on duty today/tomorrow, backups, absences, pending requests
- Team: add/edit/remove technicians, set each person's **two weekly days off**, weekly coverage check, one-click **auto-balance days off**
- Team Schedule: **generate** a monthly roster (3 shifts × 3 technicians by default), or start from an **empty schedule**; publish/unpublish; print
- **Export to Excel** (تصدير إلى Excel): a colour-coded `.xlsx` with two sheets: the monthly grid with totals and a legend, and a day-by-day list of names, backups and absences. It is right-to-left in Arabic. Technicians can export published months.
- **Drag & drop editor** (سحب وإفلات): a week board of shifts × days. Drag names between shifts, days and backup slots, from the team list, or onto "Not assigned" to remove them. Hold Ctrl to copy. On touch screens, click a name and then a slot. Every change is saved at once and can be undone.
- **Conflict checks** shown right after each drop: double booking, working on leave or on a day off, night shift followed by a morning shift, a backup who is also working, understaffed shifts, and more than 5 working days in a week. Publishing a schedule that still has conflicts asks for confirmation.
- Requests: approve or reject **leave** (date range) and **day excuses**. On approval, the system pulls a **backup** (someone on their day off) into the shift. The admin can choose who.
- Settings: shift names, times, colours, technicians per shift

**Technician**
- My Schedule: monthly calendar of their own shifts, days off and backup duties
- Team Schedule: the published team roster (read-only)
- Leave & Excuses: request leave or a one-day excuse, track its status, cancel pending requests
- Change password

## Language

- Arabic is the default; the العربية / English switch is on the login page and in the sidebar (the choice is remembered per browser).
- All text is in `client/src/locales/ar.js` and `client/src/locales/en.js`. API error messages are translated in the browser (see the `errors` map in `ar.js`).
- Dates use the Gregorian calendar with Western digits in both languages.
- Built-in shift names (صباحي / مسائي / ليلي) follow the selected language. Custom names set in Settings are shown as typed.

## How the schedule is built

- Every day has Morning / Evening / Night shifts (07–15, 15–23, 23–07, editable).
- Each person works their 5 non-day-off days. Shifts are spread out so everyone gets a similar number of morning, evening and night shifts.
- Nobody works a morning shift right after a night shift.
- People on approved leave or excuse are left out of the roster.
- If more people are available than needed, they are added to shifts (or kept as standby; see Settings).
- **Backup roster:** for each shift on each day, one person who has that day off is the designated backup. Backup duty is rotated fairly. When an absence is approved, the backup is suggested first, then standby staff, then others on their day off.
- With 13 technicians and balanced days off, each weekday has 9–10 people available for the 9 seats. You can add more team members at any time.

## Getting started

Requires Node.js 18+.

```bash
npm install          # installs server + client (npm workspaces)
npm run dev          # API on :3000, Vue dev server on http://localhost:5173
```

Production:

```bash
npm run build        # builds the Vue app into client/dist
npm start            # serves API + app on http://localhost:3000
```

On first start, `server/data/db.json` is created with sample data:

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Technicians | `tech1` … `tech13` | `tech123` |

**Change these passwords before real use.** To reset to sample data, run `npm run seed`.

Environment variables (optional): `PORT` (default 3000), `DATA_DIR` (where `db.json` lives), `JWT_SECRET` (token signing key; auto-generated in `server/data/.secret` if unset).

## Deploying from GitHub (Render)

GitHub Pages can only host static files, so it can't run the Node.js server. Use a host that runs Node and keeps a disk. This repo includes a [Render](https://render.com) Blueprint (`render.yaml`):

1. Sign in to render.com with GitHub and allow it to access this repository.
2. **New → Blueprint**, pick this repository and branch, and click **Apply**.
3. When asked, enter **`ADMIN_PASSWORD`**. This is the first password for the `admin` user.
4. Wait for the build (~2 min). The site will be at `https://ecg-shift-management.onrender.com` (or a similar name).
5. Sign in as `admin`, add your team under **الفريق / Team**, then generate the month's schedule.

Every push to the branch redeploys automatically. The database lives on a 1 GB persistent disk at `/var/data` and survives redeploys.

**Cost:** a persistent disk needs a paid instance (Starter, about $7/month plus about $0.25/month for the disk). The free plan erases the disk on every restart, which would delete all data.

**Production settings** (already in `render.yaml`):

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | first admin password (only used when the database is first created) |
| `SEED_DEMO_DATA=false` | don't create the demo technicians `tech1…tech13` |
| `JWT_SECRET` | login token signing key (generated by Render) |
| `DATA_DIR=/var/data` | where `db.json` is stored (the persistent disk) |

**Backups:** download `/var/data/db.json` from the Render **Shell** tab now and then. That one file is the whole database.

**Other hosts:** the `Dockerfile` runs on any Docker host (Railway, Fly.io, a hospital server). Mount a volume at `/data` and set the same variables.

## Tests

```bash
npm test
```

These check the scheduler: full staffing, no double-booking, no work on days off, no night→morning, fair load, and backup replacement. Team sizes from 13 to 17 are covered.

## Project layout

```
server/
  src/
    index.js, app.js       Express server (also serves client/dist)
    db.js                  JSON file database (atomic writes)
    auth.js                password hashing (scrypt) + signed tokens
    scheduler.js           roster generation, backups, days-off balancing
    routes/                auth, users, schedule, requests, settings
  test/
client/
  src/
    views/                 Dashboard, MySchedule, TeamSchedule, Requests, Team, Settings, Profile, Login
    components/            ECG logo/trace, modal, day editor, …
```
