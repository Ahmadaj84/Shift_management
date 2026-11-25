# نظام إدارة المناوبات · Hospital Shift Management

واجهة النظام باللغة **العربية** افتراضياً (من اليمين إلى اليسار)، مع زر للتبديل إلى الإنجليزية.
The interface is **Arabic by default** (right-to-left), with a one-click switch to English.

Shift scheduling web app for an ECG technician team.
**Frontend:** Vue 3 + Vite · **Backend:** Node.js + Express · **Database:** a JSON file (`server/data/db.json`).

## Organisation and roles

Hospitals → departments → teams (for example ECG team, internal-medicine nursing, ER nursing). Each team has its own members, leader, shift setup, schedules and requests. A person belongs to one team.

| Role | Can do |
|---|---|
| **System admin** (`super_admin`) | Everything: create hospitals, departments, teams and hospital admins; manage any team |
| **Hospital admin** (`hospital_admin`) | Within one hospital: departments, teams, leaders and staff; manage every team's schedule and requests |
| **Team leader** (`leader`) | Their own team: generate and edit the schedule, add staff, set days off, approve leave and excuses, change the team's shift settings |
| **Staff** (`staff`) | View their own monthly schedule and the team's published schedule; request leave or a one-day excuse |

Admins who see several teams get a **team switcher** in the sidebar. The dashboard shows an overview of all their teams.

## Features

**For leaders and admins (per team)**
- Dashboard: who is on duty today/tomorrow, backups, absences, pending requests (plus an all-teams overview for admins)
- Team: add/edit members, set each person's **two weekly days off**, weekly coverage check, one-click **auto-balance days off**
- **Import members from Excel** (استيراد من Excel): the import works in three steps.
  1. Download the template.
  2. Upload a filled `.xlsx` or `.csv` and see a preview: new / update / error per row, with reasons. Nothing is saved yet.
  3. Click Import.

  Your own sheets work too: columns are matched by Arabic or English names in any order, and the header may sit under a title row. Days off can be written as "الجمعة، السبت" or "Fri, Sat"; blank days off are balanced automatically. A blank username uses the employee ID. A username or employee ID that already exists in the team updates that person. Generated passwords can be downloaded as CSV once.
- Team Schedule: **generate** a monthly roster, or start from an **empty schedule**; publish/unpublish; print
- **Export to Excel** (تصدير إلى Excel): a colour-coded `.xlsx` with two sheets. One is the monthly grid with totals and a legend; the other lists names, backups and absences day by day. The title shows hospital, department and team. It is right-to-left in Arabic, and staff can export published months.
- **Drag & drop editor** (سحب وإفلات): a week board of shifts × days. Drag names between shifts, days and backup slots, or onto "Not assigned" to remove them; hold Ctrl to copy. On touch screens, click a name then a slot. Changes save instantly and can be undone.
- **Conflict checks** right after each drop: double booking, working on leave or a day off, night shift followed by the first shift of the next day, a backup who is also working, understaffed shifts, and more than 5 working days in a week.
- Requests: approve or reject **leave** and **day excuses**. On approval a **backup** (someone on their day off) is pulled into the shift.
- Settings (per team): 1–4 shifts with names, times and colours (presets: 3×8 h or 2×12 h); staff per shift

**For system / hospital admins**
- Hospitals & teams page: create and rename hospitals, departments and teams (with a shift preset); appoint hospital admins (system admin only); move people between teams

**For staff**
- My Schedule: monthly calendar of their own shifts, days off and backup duties
- Team Schedule: the published team roster (read-only)
- Leave & Excuses: request leave or a one-day excuse, track status, cancel pending requests
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

On first start, `server/data/db.json` is created with sample data (2 hospitals, 3 teams):

| Role | Username | Password |
|---|---|---|
| System admin | `admin` | `admin123` |
| Hospital admin (King Fahad Hospital) | `hadmin` | `hadmin123` |
| ECG team: leader `tech1`, staff `tech2`…`tech13` | `tech1` … | `tech123` |
| Internal-medicine nursing (2×12 h): leader `nurse1`, staff `nurse2`…`nurse10` | `nurse1` … | `nurse123` |
| ER nursing, North Hospital (2×12 h): leader `er1`, staff `er2`…`er9` | `er1` … | `er123` |

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

## Upgrading from the single-team version

On first start, an existing `db.json` from the earlier ECG-only version is upgraded automatically:
- **Backup:** a copy of the original is saved next to it as `db.json.v1-backup-<timestamp>`.
- **Structure:** everything is placed in `المستشفى الرئيسي › قسم تخطيط القلب › فريق تخطيط القلب`. Rename these on the Hospitals & teams page.
- **Accounts:** the old admin becomes a system admin and technicians become staff.
- **History:** schedules, requests and change logs are kept.

## Tests

```bash
npm test
```

These cover the scheduler (full staffing, no double booking, no work on days off, no night → next-morning, fair load, backup replacement, 3×8 h and 2×12 h teams), the upgrade from the single-team format, and permissions for every role over the real API.

## Project layout

```
server/
  src/
    index.js, app.js       Express server (also serves client/dist)
    db.js                  JSON file database (atomic writes)
    auth.js                password hashing (scrypt) + signed tokens
    scheduler.js           roster generation, backups, days-off balancing
    org.js                 hospitals/departments/teams, roles and permissions, data upgrade
    routes/                auth, users, org, teams, schedule, requests
  test/
client/
  src/
    views/                 Dashboard, MySchedule, TeamSchedule, Requests, Team, Settings, Organization, Profile, Login
    components/            ECG logo/trace, modal, day editor, …
```
