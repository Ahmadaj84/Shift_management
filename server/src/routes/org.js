// Hospitals, departments and teams (structure management)
import { Router } from 'express';
import { db, nextId, save } from '../db.js';
import {
  canManageHospital, findDepartment, findHospital, findTeam, orgTree,
  SHIFT_TEMPLATES, templateSettings, visibleTeamIds,
} from '../org.js';
import { monthOf, today } from '../dates.js';

const r = Router();
const now = () => new Date().toISOString();
const cleanName = (v) => String(v ?? '').trim().slice(0, 100);

r.get('/', (req, res) => res.json(orgTree(db(), req.user)));

// Summary per visible team for the dashboard
r.get('/overview', (req, res) => {
  const d = db();
  const ym = monthOf(today());
  res.json(
    visibleTeamIds(d, req.user).map((tid) => {
      const s = d.schedules[tid]?.[ym];
      return {
        teamId: tid,
        members: d.users.filter((u) => u.teamId === tid && u.active !== false).length,
        pending: d.requests.filter((x) => x.teamId === tid && x.status === 'pending').length,
        month: ym,
        schedule: s ? (s.published ? 'published' : 'draft') : 'none',
      };
    })
  );
});

r.get('/templates', (req, res) => res.json(Object.keys(SHIFT_TEMPLATES)));

// ---- hospitals (super admin) ----
r.post('/hospitals', (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Not allowed' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const h = { id: nextId('hospital'), name, createdAt: now() };
  db().hospitals.push(h);
  save();
  res.status(201).json(h);
});

r.put('/hospitals/:id', (req, res) => {
  const d = db();
  const h = findHospital(d, req.params.id);
  if (!h) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Not allowed' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  h.name = name;
  save();
  res.json(h);
});

r.delete('/hospitals/:id', (req, res) => {
  const d = db();
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Not allowed' });
  if (d.departments.some((x) => x.hospitalId === req.params.id)) return res.status(400).json({ error: 'Remove its departments first' });
  d.hospitals = d.hospitals.filter((x) => x.id !== req.params.id);
  for (const u of d.users) if (u.role === 'hospital_admin' && u.hospitalId === req.params.id) u.active = false;
  save();
  res.json({ ok: true });
});

// ---- departments (super admin / that hospital's admin) ----
r.post('/departments', (req, res) => {
  const d = db();
  const { hospitalId } = req.body || {};
  if (!findHospital(d, hospitalId)) return res.status(400).json({ error: 'Unknown hospital' });
  if (!canManageHospital(d, req.user, hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const dep = { id: nextId('department'), hospitalId, name, createdAt: now() };
  d.departments.push(dep);
  save();
  res.status(201).json(dep);
});

r.put('/departments/:id', (req, res) => {
  const d = db();
  const dep = findDepartment(d, req.params.id);
  if (!dep) return res.status(404).json({ error: 'Not found' });
  if (!canManageHospital(d, req.user, dep.hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  dep.name = name;
  save();
  res.json(dep);
});

r.delete('/departments/:id', (req, res) => {
  const d = db();
  const dep = findDepartment(d, req.params.id);
  if (!dep) return res.status(404).json({ error: 'Not found' });
  if (!canManageHospital(d, req.user, dep.hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  if (d.teams.some((t) => t.departmentId === dep.id)) return res.status(400).json({ error: 'Remove its teams first' });
  d.departments = d.departments.filter((x) => x.id !== dep.id);
  save();
  res.json({ ok: true });
});

// ---- teams (super admin / that hospital's admin) ----
r.post('/teams', (req, res) => {
  const d = db();
  const dep = findDepartment(d, req.body?.departmentId);
  if (!dep) return res.status(400).json({ error: 'Unknown department' });
  if (!canManageHospital(d, req.user, dep.hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const team = { id: nextId('team'), departmentId: dep.id, name, settings: templateSettings(req.body?.template), createdAt: now() };
  d.teams.push(team);
  d.schedules[team.id] = {};
  save();
  res.status(201).json(team);
});

r.put('/teams/:id', (req, res) => {
  const d = db();
  const team = findTeam(d, req.params.id);
  if (!team) return res.status(404).json({ error: 'Not found' });
  const dep = findDepartment(d, team.departmentId);
  if (!canManageHospital(d, req.user, dep?.hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    team.name = name;
  }
  if (req.body?.departmentId && req.body.departmentId !== team.departmentId) {
    const to = findDepartment(d, req.body.departmentId);
    if (!to || !canManageHospital(d, req.user, to.hospitalId)) return res.status(400).json({ error: 'Unknown department' });
    team.departmentId = to.id;
  }
  save();
  res.json(team);
});

r.delete('/teams/:id', (req, res) => {
  const d = db();
  const team = findTeam(d, req.params.id);
  if (!team) return res.status(404).json({ error: 'Not found' });
  const dep = findDepartment(d, team.departmentId);
  if (!canManageHospital(d, req.user, dep?.hospitalId)) return res.status(403).json({ error: 'Not allowed' });
  if (d.users.some((u) => u.teamId === team.id && u.active !== false)) return res.status(400).json({ error: 'Move or remove its members first' });
  d.teams = d.teams.filter((t) => t.id !== team.id);
  delete d.schedules[team.id];
  save();
  res.json({ ok: true });
});

export default r;
