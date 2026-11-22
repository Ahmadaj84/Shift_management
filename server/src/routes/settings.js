import { Router } from 'express';
import { db, save } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = Router();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

r.get('/', (req, res) => res.json(db().settings));

r.put('/', requireAdmin, (req, res) => {
  const s = db().settings;
  const body = req.body || {};
  if (body.departmentName !== undefined) s.departmentName = String(body.departmentName).trim() || s.departmentName;
  if (body.staffPerShift !== undefined) {
    const n = Number(body.staffPerShift);
    if (!Number.isInteger(n) || n < 1 || n > 20) return res.status(400).json({ error: 'Staff per shift must be 1-20' });
    s.staffPerShift = n;
  }
  if (body.assignExtraStaff !== undefined) s.assignExtraStaff = !!body.assignExtraStaff;
  if (Array.isArray(body.shifts)) {
    // Shift ids are fixed (morning/evening/night); names, times and colours are editable.
    for (const upd of body.shifts) {
      const sh = s.shifts.find((x) => x.id === upd.id);
      if (!sh) continue;
      if (upd.start && !TIME_RE.test(upd.start)) return res.status(400).json({ error: 'Times must be HH:MM' });
      if (upd.end && !TIME_RE.test(upd.end)) return res.status(400).json({ error: 'Times must be HH:MM' });
      if (upd.name) sh.name = String(upd.name).trim();
      if (upd.short) sh.short = String(upd.short).trim().slice(0, 2).toUpperCase();
      if (upd.start) sh.start = upd.start;
      if (upd.end) sh.end = upd.end;
      if (upd.color && /^#[0-9a-f]{6}$/i.test(upd.color)) sh.color = upd.color;
    }
  }
  save();
  res.json(s);
});

export default r;
