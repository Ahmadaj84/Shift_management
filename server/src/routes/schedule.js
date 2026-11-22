import { Router } from 'express';
import { db, save } from '../db.js';
import { requireAdmin } from '../auth.js';
import { isMonth, isDate, monthOf } from '../dates.js';
import { generateMonth, replacementCandidates } from '../scheduler.js';

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

// Admin manual edit of one day's assignments and backups.
r.put('/:ym/days/:date', requireAdmin, (req, res) => {
  const { ym, date } = req.params;
  const d = db();
  if (!isDate(date) || monthOf(date) !== ym) return res.status(400).json({ error: 'Invalid date' });
  const day = d.schedules[ym]?.days?.[date];
  if (!day) return res.status(404).json({ error: 'No schedule for this day' });

  const { shifts, backup } = req.body || {};
  const shiftIds = d.settings.shifts.map((s) => s.id);
  const validIds = new Set(d.users.filter((u) => u.active !== false).map((u) => u.id));
  const seen = new Set();
  const nextShifts = {};
  for (const sid of shiftIds) {
    const ids = Array.isArray(shifts?.[sid]) ? shifts[sid] : [];
    for (const id of ids) {
      if (!validIds.has(id)) return res.status(400).json({ error: `Unknown staff id ${id}` });
      if (seen.has(id)) return res.status(400).json({ error: 'A person can only be in one shift per day' });
      seen.add(id);
    }
    nextShifts[sid] = ids;
  }
  const nextBackup = {};
  for (const sid of shiftIds) {
    const id = backup?.[sid] || null;
    if (id && (!validIds.has(id) || seen.has(id))) {
      return res.status(400).json({ error: 'A backup must be someone who is not already working that day' });
    }
    nextBackup[sid] = id;
  }

  const before = JSON.stringify(day.shifts);
  day.shifts = nextShifts;
  day.backup = nextBackup;
  // Recompute who is off / standby from the rotation staff
  const rotation = d.users.filter((u) => u.active !== false && u.inRotation).map((u) => u.id);
  const absent = new Set(day.absent);
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  day.off = rotation.filter((id) => !seen.has(id) && !absent.has(id) && d.users.find((u) => u.id === id).daysOff?.includes(wd));
  day.standby = rotation.filter((id) => !seen.has(id) && !absent.has(id) && !day.off.includes(id));
  day.warnings = shiftIds
    .filter((sid) => nextShifts[sid].length < d.settings.staffPerShift)
    .map((sid) => `${d.settings.shifts.find((s) => s.id === sid).name}: ${nextShifts[sid].length}/${d.settings.staffPerShift} staff`);
  if (before !== JSON.stringify(nextShifts)) {
    day.changes.push({ type: 'manual-edit', by: req.user.id, at: new Date().toISOString() });
  }
  save();
  res.json(day);
});

export default r;
