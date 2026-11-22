import { Router } from 'express';
import { db, nextId, save } from '../db.js';
import { hashPassword, publicUser, requireAdmin } from '../auth.js';
import { balanceDaysOff, rotationStaff, weekdayCoverage } from '../scheduler.js';

const r = Router();

const validDaysOff = (v) =>
  Array.isArray(v) && v.length === 2 && new Set(v).size === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);

function applyFields(user, body, { creating = false } = {}) {
  const d = db();
  if (body.name !== undefined) {
    if (!String(body.name).trim()) throw new Error('Name is required');
    user.name = String(body.name).trim();
  }
  if (body.username !== undefined) {
    const username = String(body.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error('Username must be 3-32 chars (letters, digits, . _ -)');
    if (d.users.some((u) => u.username === username && u.id !== user.id)) throw new Error('Username already taken');
    user.username = username;
  }
  if (body.role !== undefined) {
    if (!['admin', 'technician'].includes(body.role)) throw new Error('Invalid role');
    user.role = body.role;
  }
  if (body.daysOff !== undefined) {
    if (!validDaysOff(body.daysOff)) throw new Error('Exactly two different days off are required');
    user.daysOff = [...body.daysOff].sort((a, b) => a - b);
  }
  for (const k of ['phone', 'email', 'employeeId']) if (body[k] !== undefined) user[k] = String(body[k]).trim();
  if (body.inRotation !== undefined) user.inRotation = !!body.inRotation;
  if (body.active !== undefined) user.active = !!body.active;
  if (body.password) {
    if (String(body.password).length < 6) throw new Error('Password must be at least 6 characters');
    Object.assign(user, (({ salt, hash }) => ({ salt, passwordHash: hash }))(hashPassword(body.password)));
  } else if (creating) {
    throw new Error('Password is required');
  }
  if (creating && !user.username) throw new Error('Username is required');
  if (user.inRotation && !validDaysOff(user.daysOff)) throw new Error('Staff in rotation need two days off');
}

// Everyone can see the team list (needed to read the schedule); only admins see contact details.
r.get('/', (req, res) => {
  const users = db().users.map(publicUser);
  if (req.user.role === 'admin') return res.json(users);
  res.json(users.map(({ id, name, role, inRotation, active, daysOff }) => ({ id, name, role, inRotation, active, daysOff })));
});

r.get('/coverage', (req, res) => res.json(weekdayCoverage(db())));

r.post('/', requireAdmin, (req, res) => {
  const user = { id: null, role: 'technician', inRotation: true, active: true, daysOff: [], createdAt: new Date().toISOString() };
  try {
    applyFields(user, req.body || {}, { creating: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  user.id = nextId('user');
  db().users.push(user);
  save();
  res.status(201).json(publicUser(user));
});

r.put('/:id', requireAdmin, (req, res) => {
  const user = db().users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const draft = structuredClone(user);
  try {
    applyFields(draft, req.body || {});
    if (user.id === req.user.id && (draft.role !== 'admin' || draft.active === false)) {
      throw new Error('You cannot remove your own admin access');
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  Object.assign(user, draft);
  save();
  res.json(publicUser(user));
});

r.delete('/:id', requireAdmin, (req, res) => {
  const d = db();
  const idx = d.users.findIndex((u) => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });
  if (d.users[idx].id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  // Soft delete keeps names readable in historic schedules
  d.users[idx].active = false;
  d.users[idx].inRotation = false;
  save();
  res.json({ ok: true });
});

r.post('/balance-days-off', requireAdmin, (req, res) => {
  const d = db();
  const offCount = balanceDaysOff(rotationStaff(d));
  save();
  res.json({ offCount, coverage: weekdayCoverage(d) });
});

export default r;
