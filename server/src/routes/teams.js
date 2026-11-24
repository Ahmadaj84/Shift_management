// Team-scoped routes: /api/teams/:teamId/...
import { Router } from 'express';
import { db, save } from '../db.js';
import { canManageTeam, canViewTeam, findTeam, teamCtx, teamLabels } from '../org.js';
import { balanceDaysOff, rotationStaff, weekdayCoverage } from '../scheduler.js';
import scheduleRoutes from './schedule.js';

const r = Router();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Load the team and check the user may see it
r.param('teamId', (req, res, next, id) => {
  const d = db();
  const team = findTeam(d, id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (!canViewTeam(d, req.user, id)) return res.status(403).json({ error: 'Not allowed' });
  req.team = team;
  req.ctx = teamCtx(d, team);
  req.canManage = canManageTeam(d, req.user, id);
  next();
});

export const requireTeamManager = (req, res, next) =>
  req.canManage ? next() : res.status(403).json({ error: 'Team leader or admin access required' });

r.get('/:teamId', (req, res) => {
  const d = db();
  res.json({ ...req.team, ...teamLabels(d, req.team.id), name: req.team.name, canManage: req.canManage });
});

r.put('/:teamId/settings', requireTeamManager, (req, res) => {
  const s = req.team.settings;
  const body = req.body || {};
  if (body.staffPerShift !== undefined) {
    const n = Number(body.staffPerShift);
    if (!Number.isInteger(n) || n < 1 || n > 30) return res.status(400).json({ error: 'Staff per shift must be 1-30' });
    s.staffPerShift = n;
  }
  if (body.assignExtraStaff !== undefined) s.assignExtraStaff = !!body.assignExtraStaff;
  if (Array.isArray(body.shifts)) {
    if (body.shifts.length < 1 || body.shifts.length > 4) return res.status(400).json({ error: 'A team needs 1 to 4 shifts' });
    const used = new Set();
    const next = [];
    for (const upd of body.shifts) {
      if (!TIME_RE.test(upd.start || '') || !TIME_RE.test(upd.end || '')) return res.status(400).json({ error: 'Times must be HH:MM' });
      const name = String(upd.name || '').trim().slice(0, 40);
      if (!name) return res.status(400).json({ error: 'Name is required' });
      let id = /^[a-z0-9_-]{1,20}$/i.test(upd.id || '') ? upd.id : null;
      if (!id || used.has(id)) id = 's' + Math.random().toString(36).slice(2, 8);
      used.add(id);
      next.push({
        id,
        name,
        short: String(upd.short || name).trim().slice(0, 2).toUpperCase(),
        start: upd.start,
        end: upd.end,
        color: /^#[0-9a-f]{6}$/i.test(upd.color || '') ? upd.color : '#64748b',
      });
    }
    s.shifts = next;
  }
  save();
  res.json(s);
});

r.get('/:teamId/coverage', (req, res) => res.json(weekdayCoverage(req.ctx)));

r.post('/:teamId/balance-days-off', requireTeamManager, (req, res) => {
  const offCount = balanceDaysOff(rotationStaff(req.ctx));
  save();
  res.json({ offCount, coverage: weekdayCoverage(req.ctx) });
});

r.use('/:teamId/schedule', scheduleRoutes);

export default r;
