import { Router } from 'express';
import { db, save } from '../db.js';
import { requireAdmin } from '../auth.js';
import { isMonth, isDate, monthOf, daysOfMonth } from '../dates.js';
import { absenceFor, generateMonth, replacementCandidates } from '../scheduler.js';

const r = Router();

r.get('/:ym', (req, res) => {
  const { ym } = req.params;
  if (!isMonth(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
  const schedule = db().schedules[ym] || null;
  if (schedule && !schedule.published && req.user.role !== 'admin') return res.json(null);
  res.json(schedule);
});

r.post('/:ym/generate', requireAdmin, (req, res) => {
  const { ym } = req.params;
  if (!isMonth(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
  const d = db();
  if (d.schedules[ym] && !req.body?.overwrite) {
    return res.status(409).json({ error: 'A schedule already exists for this month. Confirm overwrite to regenerate.' });
  }
  const schedule = generateMonth(d, ym);
  schedule.published = !!req.body?.publish;
  d.schedules[ym] = schedule;
  save();
  res.json(schedule);
});

r.post('/:ym/publish', requireAdmin, (req, res) => {
  const s = db().schedules[req.params.ym];
  if (!s) return res.status(404).json({ error: 'No schedule for this month' });
  s.published = req.body?.published !== false;
  save();
  res.json(s);
});

r.delete('/:ym', requireAdmin, (req, res) => {
  delete db().schedules[req.params.ym];
  save();
  res.json({ ok: true });
});

r.get('/:ym/days/:date/candidates', requireAdmin, (req, res) => {
  const { date } = req.params;
  const { shift, exclude } = req.query;
  res.json(replacementCandidates(db(), date, shift, exclude));
});

/**
 * Apply an admin edit to one day. Conflicts (double booking, working on a day
 * off or on leave, backup also working...) are allowed here and reported by
 * the client, so the admin can build a roster freely and fix issues after.
 * Returns an error string, or null on success.
 */
function applyDayEdit(d, ym, date, body, userId) {
  if (!isDate(date) || monthOf(date) !== ym) return 'Invalid date';
  const day = d.schedules[ym]?.days?.[date];
  if (!day) return 'No schedule for this day';

  const { shifts, backup } = body || {};
  const shiftIds = d.settings.shifts.map((s) => s.id);
  const validIds = new Set(d.users.filter((u) => u.active !== false).map((u) => u.id));
  const nextShifts = {};
  for (const sid of shiftIds) {
    const ids = Array.isArray(shifts?.[sid]) ? [...new Set(shifts[sid])] : [];
    for (const id of ids) if (!validIds.has(id)) return `Unknown staff id ${id}`;
    nextShifts[sid] = ids;
  }
  const nextBackup = {};
  for (const sid of shiftIds) {
    const id = backup?.[sid] || null;
    if (id && !validIds.has(id)) return `Unknown staff id ${id}`;
    nextBackup[sid] = id;
  }

  const before = JSON.stringify([day.shifts, day.backup]);
  day.shifts = nextShifts;
  day.backup = nextBackup;
  refreshDayLists(d, date, day);
  if (before !== JSON.stringify([nextShifts, nextBackup])) {
    day.changes.push({ type: 'manual-edit', by: userId, at: new Date().toISOString() });
  }
  return null;
}

/** Recompute who is off / standby, and the understaffing warnings. */
function refreshDayLists(d, date, day) {
  const working = new Set(Object.values(day.shifts).flat());
  const rotation = d.users.filter((u) => u.active !== false && u.inRotation);
  const absent = new Set(day.absent);
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  const free = rotation.filter((u) => !working.has(u.id) && !absent.has(u.id));
  day.off = free.filter((u) => u.daysOff?.includes(wd)).map((u) => u.id);
  day.standby = free.filter((u) => !u.daysOff?.includes(wd)).map((u) => u.id);
  day.warnings = d.settings.shifts
    .filter((s) => (day.shifts[s.id]?.length || 0) < d.settings.staffPerShift)
    .map((s) => `${s.name}: ${day.shifts[s.id]?.length || 0}/${d.settings.staffPerShift}`);
}

// Create an empty month to fill in by hand (drag & drop).
r.post('/:ym/create-empty', requireAdmin, (req, res) => {
  const { ym } = req.params;
  if (!isMonth(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });
  const d = db();
  if (d.schedules[ym] && !req.body?.overwrite) {
    return res.status(409).json({ error: 'A schedule already exists for this month. Confirm overwrite to regenerate.' });
  }
  const shiftIds = d.settings.shifts.map((s) => s.id);
  const days = {};
  for (const date of daysOfMonth(ym)) {
    const day = {
      shifts: Object.fromEntries(shiftIds.map((s) => [s, []])),
      backup: Object.fromEntries(shiftIds.map((s) => [s, null])),
      off: [], absent: [], standby: [], changes: [], warnings: [],
    };
    day.absent = d.users.filter((u) => u.inRotation && u.active !== false && absenceFor(d, u.id, date)).map((u) => u.id);
    refreshDayLists(d, date, day);
    days[date] = day;
  }
  d.schedules[ym] = { month: ym, generatedAt: new Date().toISOString(), manual: true, published: false, days };
  save();
  res.json(d.schedules[ym]);
});

// Admin manual edit of one day.
r.put('/:ym/days/:date', requireAdmin, (req, res) => {
  const d = db();
  const err = applyDayEdit(d, req.params.ym, req.params.date, req.body, req.user.id);
  if (err) return res.status(err.startsWith('No schedule') ? 404 : 400).json({ error: err });
  save();
  res.json(d.schedules[req.params.ym].days[req.params.date]);
});

// Admin edit of several days at once (a drag & drop move touches two days).
// Body: { days: { 'YYYY-MM-DD': { shifts, backup } } } — all or nothing.
r.patch('/:ym/days', requireAdmin, (req, res) => {
  const d = db();
  const { ym } = req.params;
  const edits = req.body?.days;
  if (!edits || typeof edits !== 'object' || !Object.keys(edits).length) return res.status(400).json({ error: 'Invalid date' });
  const snapshot = structuredClone(d.schedules[ym]?.days || {});
  for (const [date, body] of Object.entries(edits)) {
    const err = applyDayEdit(d, ym, date, body, req.user.id);
    if (err) {
      if (d.schedules[ym]) d.schedules[ym].days = snapshot;
      return res.status(err.startsWith('No schedule') ? 404 : 400).json({ error: err });
    }
  }
  save();
  res.json(Object.fromEntries(Object.keys(edits).map((date) => [date, d.schedules[ym].days[date]])));
});

export default r;
