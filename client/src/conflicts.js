// Schedule conflict detection. Pure functions (no Vue / i18n) so the server
// tests can import it too. Each conflict:
//   { type, severity: 'error' | 'warning', date, userId?, shift?, params? }

const wdOf = (ds) => new Date(ds + 'T00:00:00Z').getUTCDay();
const addDays = (ds, n) => {
  const d = new Date(ds + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const SEVERITY = {
  double: 'error',
  onLeave: 'error',
  nightMorning: 'error',
  backupWorking: 'error',
  inactive: 'error',
  dayOff: 'warning',
  backupDouble: 'warning',
  understaffed: 'warning',
  tooManyDays: 'warning',
};

/**
 * @param {object} schedule  { days: { date: day } }
 * @param {object[]} users
 * @param {object} settings  { shifts, staffPerShift }
 * @param {object} [opts]    { prevDay } last day of the previous month (night→morning check)
 */
export function findConflicts(schedule, users, settings, opts = {}) {
  const out = [];
  if (!schedule?.days) return out;
  const byId = new Map(users.map((u) => [u.id, u]));
  const shiftIds = settings.shifts.map((s) => s.id);
  const nightId = shiftIds.includes('night') ? 'night' : shiftIds[shiftIds.length - 1];
  const morningId = shiftIds.includes('morning') ? 'morning' : shiftIds[0];
  const dates = Object.keys(schedule.days).sort();
  const add = (type, date, extra = {}) => out.push({ type, severity: SEVERITY[type], date, ...extra });

  for (const date of dates) {
    const day = schedule.days[date];
    const wd = wdOf(date);
    const absent = new Set(day.absent || []);
    const shiftOfUser = new Map();

    for (const sid of shiftIds) {
      const ids = day.shifts[sid] || [];
      if (ids.length < settings.staffPerShift) {
        add('understaffed', date, { shift: sid, params: { have: ids.length, need: settings.staffPerShift } });
      }
      for (const uid of ids) {
        const u = byId.get(uid);
        if (!u || u.active === false) add('inactive', date, { userId: uid, shift: sid });
        if (shiftOfUser.has(uid)) {
          add('double', date, { userId: uid, shift: sid, params: { other: shiftOfUser.get(uid) } });
        } else shiftOfUser.set(uid, sid);
        if (absent.has(uid)) add('onLeave', date, { userId: uid, shift: sid });
        else if (u?.daysOff?.includes(wd)) add('dayOff', date, { userId: uid, shift: sid });
      }
    }

    const backupSeen = new Map();
    for (const sid of shiftIds) {
      const uid = day.backup?.[sid];
      if (!uid) continue;
      if (shiftOfUser.has(uid)) add('backupWorking', date, { userId: uid, shift: sid, params: { other: shiftOfUser.get(uid) } });
      if (absent.has(uid)) add('onLeave', date, { userId: uid, shift: sid, params: { backup: true } });
      if (backupSeen.has(uid)) add('backupDouble', date, { userId: uid, shift: sid, params: { other: backupSeen.get(uid) } });
      else backupSeen.set(uid, sid);
    }

    // Night shift then morning shift the next day (no rest)
    const prev = schedule.days[addDays(date, -1)] ?? (date === dates[0] ? opts.prevDay : null);
    if (prev) {
      for (const uid of day.shifts[morningId] || []) {
        if ((prev.shifts?.[nightId] || []).includes(uid)) add('nightMorning', date, { userId: uid, shift: morningId });
      }
    }
  }

  // Two days off per week: more than 5 working days in a full Sun–Sat week
  for (const date of dates) {
    if (wdOf(date) !== 0) continue;
    const week = Array.from({ length: 7 }, (_, i) => addDays(date, i));
    if (!week.every((d) => schedule.days[d])) continue;
    const count = new Map();
    for (const d of week) {
      for (const uid of new Set(Object.values(schedule.days[d].shifts).flat())) count.set(uid, (count.get(uid) || 0) + 1);
    }
    for (const [uid, n] of count) if (n > 5) add('tooManyDays', date, { userId: uid, params: { n, end: week[6] } });
  }
  return out;
}

/** Index conflicts for fast lookup while rendering. */
export function indexConflicts(list) {
  const byUserDate = new Map(); // `${date}|${userId}` → conflicts
  const byShiftDate = new Map(); // `${date}|${shift}` → conflicts
  const add = (m, k, c) => (m.get(k) || m.set(k, []).get(k)).push(c);
  for (const c of list) {
    if (c.userId) {
      if (c.type === 'tooManyDays') {
        for (let i = 0; i < 7; i++) add(byUserDate, `${addDays(c.date, i)}|${c.userId}`, c);
      } else add(byUserDate, `${c.date}|${c.userId}`, c);
    }
    if (c.shift) add(byShiftDate, `${c.date}|${c.shift}`, c);
  }
  return { byUserDate, byShiftDate };
}

/** Stable key, used to tell which conflicts a change introduced. */
export const conflictKey = (c) => [c.type, c.date, c.userId || '', c.shift || ''].join('|');
