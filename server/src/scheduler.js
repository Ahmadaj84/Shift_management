// Scheduling engine: monthly roster generation, backup (standby) roster,
// days-off balancing and absence replacement.
import { daysOfMonth, weekday, addDays, monthOf } from './dates.js';

/** Staff that take part in the rotation. */
export const rotationStaff = (d) => d.users.filter((u) => u.active !== false && u.inRotation);

/** Approved leave / excuse covering a given user + date (or undefined). */
export function absenceFor(d, userId, date) {
  return d.requests.find(
    (r) =>
      r.userId === userId &&
      r.status === 'approved' &&
      (r.type === 'excuse' ? r.date === date : r.startDate <= date && date <= r.endDate)
  );
}

const isDayOff = (u, date) => (u.daysOff || []).includes(weekday(date));

const DAY_PAIRS = [0, 1, 2, 3, 4, 5, 6].map((d) => [d, (d + 1) % 7]);
// Spread consecutive assignments around the week: weekend pairs first, then interleave.
const PAIR_ORDER = [5, 2, 6, 3, 0, 4, 1];

/**
 * Pick two consecutive days off with the lowest load and add them to offCount
 * (people off per weekday, 0 = Sunday). `i` rotates the tie-break order.
 */
export function pickDaysOff(offCount, i = 0) {
  let best = null;
  let bestLoad = Infinity;
  for (let k = 0; k < 7; k++) {
    const p = DAY_PAIRS[PAIR_ORDER[(i + k) % 7]];
    const load = Math.max(offCount[p[0]], offCount[p[1]]) * 10 + offCount[p[0]] + offCount[p[1]];
    if (load < bestLoad) {
      bestLoad = load;
      best = p;
    }
  }
  offCount[best[0]]++;
  offCount[best[1]]++;
  return [...best].sort((a, b) => a - b);
}

/**
 * Give every staff member two consecutive days off so that the number of
 * people off on each weekday is as even as possible.
 */
export function balanceDaysOff(staff) {
  const offCount = Array(7).fill(0);
  staff.forEach((u, i) => {
    u.daysOff = pickDaysOff(offCount, i);
  });
  return offCount;
}

/** How many people are off / available on each weekday with current days off. */
export function weekdayCoverage(d) {
  const staff = rotationStaff(d);
  const needed = d.settings.shifts.length * d.settings.staffPerShift;
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const off = staff.filter((u) => (u.daysOff || []).includes(wd)).length;
    return { weekday: wd, off, available: staff.length - off, needed };
  });
}

function emptyDay(shifts) {
  return {
    shifts: Object.fromEntries(shifts.map((s) => [s.id, []])),
    backup: Object.fromEntries(shifts.map((s) => [s.id, null])),
    off: [],
    absent: [],
    standby: [],
    changes: [],
    warnings: [],
  };
}

/**
 * Build the roster for a whole month.
 * Fairness is kept with per-person counters (per shift type, total and
 * backup duties). A person who worked the night shift is never put on the
 * next morning shift.
 */
export function generateMonth(d, ym) {
  const { shifts, staffPerShift, assignExtraStaff } = d.settings;
  const shiftIds = shifts.map((s) => s.id);
  const nightId = shifts.find((s) => s.id === 'night')?.id ?? shiftIds[shiftIds.length - 1];
  const morningId = shifts.find((s) => s.id === 'morning')?.id ?? shiftIds[0];
  const staff = rotationStaff(d);

  const stats = new Map(
    staff.map((u) => [u.id, { counts: Object.fromEntries(shiftIds.map((s) => [s, 0])), total: 0, backup: 0, last: null }])
  );

  // Seed "last night" from the previous month's last day, if available.
  const days = daysOfMonth(ym);
  const prevDate = addDays(days[0], -1);
  let prevNight = new Set(d.schedules[monthOf(prevDate)]?.days?.[prevDate]?.shifts?.[nightId] || []);

  const out = {};
  for (const date of days) {
    const day = emptyDay(shifts);
    const available = [];
    const offToday = [];
    for (const u of staff) {
      if (absenceFor(d, u.id, date)) day.absent.push(u.id);
      else if (isDayOff(u, date)) offToday.push(u.id);
      else available.push(u.id);
    }
    day.off = [...offToday];

    const cost = (uid, sid) => {
      const st = stats.get(uid);
      let c = st.counts[sid] * 4 + st.total;
      if (st.last === sid) c -= 3; // mild preference to keep the same shift for continuity
      return c;
    };
    const canWork = (uid, sid) => !(sid === morningId && prevNight.has(uid));

    const pool = new Set(available);
    const pick = (sid) => {
      let best = null;
      let bestCost = Infinity;
      // Keep enough morning-eligible people in the pool for the remaining morning seats.
      let mustUseBlocked = false;
      if (sid !== morningId) {
        const morningLeft = staffPerShift - day.shifts[morningId].length;
        const eligible = [...pool].filter((u) => canWork(u, morningId)).length;
        mustUseBlocked = eligible <= morningLeft && [...pool].some((u) => !canWork(u, morningId));
      }
      for (const uid of pool) {
        if (!canWork(uid, sid)) continue;
        if (mustUseBlocked && canWork(uid, morningId)) continue;
        const c = cost(uid, sid);
        if (c < bestCost || (c === bestCost && uid < best)) {
          bestCost = c;
          best = uid;
        }
      }
      if (best) pool.delete(best);
      return best;
    };

    // Fill shifts round-robin (one seat per shift at a time) — fairer than
    // filling an entire shift first. Night first: it is the most constrained
    // for the next day, then morning (blocked for last night's staff).
    const fillOrder = [nightId, ...shiftIds.filter((s) => s !== nightId)];
    for (let seat = 0; seat < staffPerShift; seat++) {
      for (const sid of fillOrder) {
        const uid = pick(sid);
        if (uid) day.shifts[sid].push(uid);
      }
    }

    // Left-over available staff: add to the least-staffed shifts or keep as standby.
    if (assignExtraStaff) {
      for (const uid of [...pool].sort()) {
        // Extra people never go to the night shift: everyone on a night is blocked
        // from the next morning, so a bigger night crew can leave tomorrow short.
        const sid = shiftIds
          .filter((s) => canWork(uid, s) && (s !== nightId || shiftIds.length === 1))
          .sort((a, b) => day.shifts[a].length - day.shifts[b].length || cost(uid, a) - cost(uid, b))[0];
        if (!sid) continue;
        day.shifts[sid].push(uid);
        pool.delete(uid);
      }
    }
    day.standby = [...pool];

    for (const sid of shiftIds) {
      if (day.shifts[sid].length < staffPerShift) {
        day.warnings.push(`${shifts.find((s) => s.id === sid).name}: ${day.shifts[sid].length}/${staffPerShift} staff`);
      }
      for (const uid of day.shifts[sid]) {
        const st = stats.get(uid);
        st.counts[sid]++;
        st.total++;
        st.last = sid;
      }
    }

    // Backup roster: one person on day-off per shift, rotated fairly.
    const backupPool = [...day.standby, ...offToday];
    const usedBackup = new Set();
    for (const sid of shiftIds) {
      const candidates = backupPool
        .filter((uid) => !usedBackup.has(uid) && canWork(uid, sid))
        .sort((a, b) => stats.get(a).backup - stats.get(b).backup || (a < b ? -1 : 1));
      const uid = candidates[0] ?? null;
      day.backup[sid] = uid;
      if (uid) {
        usedBackup.add(uid);
        stats.get(uid).backup++;
      }
    }

    prevNight = new Set(day.shifts[nightId]);
    out[date] = day;
  }

  return { month: ym, generatedAt: new Date().toISOString(), days: out };
}

/** Which shift (if any) a user works on a schedule day. */
export function shiftOf(day, userId) {
  return Object.keys(day.shifts).find((sid) => day.shifts[sid].includes(userId)) ?? null;
}

/** People who could replace someone on a given day/shift, best first. */
export function replacementCandidates(d, date, shiftId, excludeId) {
  const day = d.schedules[monthOf(date)]?.days?.[date];
  if (!day) return [];
  const working = new Set(Object.values(day.shifts).flat());
  const staff = rotationStaff(d).filter(
    (u) => u.id !== excludeId && !working.has(u.id) && !absenceFor(d, u.id, date)
  );
  const rank = (u) => {
    if (day.backup[shiftId] === u.id) return 0; // designated backup for that shift
    if (day.standby?.includes(u.id)) return 1; // available, unassigned
    if (Object.values(day.backup).includes(u.id)) return 3; // backup for another shift
    return 2; // regular day off
  };
  return staff
    .map((u) => ({ id: u.id, name: u.name, rank: rank(u) }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

/**
 * Mark a user absent for a date in an existing schedule and pull in a
 * replacement (preferred one, else the designated backup, else best candidate).
 * Returns a description of what happened.
 */
export function applyAbsence(d, userId, date, { preferredId = null, requestId = null } = {}) {
  const day = d.schedules[monthOf(date)]?.days?.[date];
  if (!day) return { date, status: 'no-schedule' };

  const sid = shiftOf(day, userId);
  // Remove from any role on that day
  for (const k of Object.keys(day.shifts)) day.shifts[k] = day.shifts[k].filter((x) => x !== userId);
  day.off = day.off.filter((x) => x !== userId);
  day.standby = (day.standby || []).filter((x) => x !== userId);
  if (!day.absent.includes(userId)) day.absent.push(userId);

  const result = { date, shift: sid, status: sid ? 'uncovered' : 'not-scheduled', replacement: null };

  if (sid) {
    const candidates = replacementCandidates(d, date, sid, userId);
    const chosen =
      (preferredId && candidates.find((c) => c.id === preferredId)) || candidates[0] || null;
    if (chosen) {
      day.shifts[sid].push(chosen.id);
      day.off = day.off.filter((x) => x !== chosen.id);
      day.standby = day.standby.filter((x) => x !== chosen.id);
      for (const k of Object.keys(day.backup)) if (day.backup[k] === chosen.id) day.backup[k] = null;
      result.replacement = chosen.id;
      result.status = 'covered';
    }
    day.changes.push({
      type: 'replacement',
      shift: sid,
      absent: userId,
      replacement: result.replacement,
      requestId,
      at: new Date().toISOString(),
    });
  }

  // If the absent person (or the replacement) was a designated backup, re-assign backups.
  for (const k of Object.keys(day.backup)) {
    if (day.backup[k] === userId || day.backup[k] === null) {
      const working = new Set(Object.values(day.shifts).flat());
      const used = new Set(Object.values(day.backup).filter(Boolean));
      const next = [...(day.standby || []), ...day.off].find(
        (x) => !working.has(x) && !used.has(x) && x !== userId
      );
      day.backup[k] = next ?? null;
    }
  }

  day.warnings = Object.entries(day.shifts)
    .filter(([, ids]) => ids.length < d.settings.staffPerShift)
    .map(([k, ids]) => `${d.settings.shifts.find((s) => s.id === k)?.name ?? k}: ${ids.length}/${d.settings.staffPerShift} staff`);

  return result;
}
