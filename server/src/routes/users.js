import { Router } from 'express';
import { db, nextId, save } from '../db.js';
import { hashPassword, publicUser } from '../auth.js';
import {
  assignableRoles, canManageHospital, canManageTeam, canManageUser, canViewTeam,
  findHospital, findTeam, userHospitalId,
} from '../org.js';

const r = Router();

const validDaysOff = (v) =>
  Array.isArray(v) && v.length === 2 && new Set(v).size === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);

/** Apply request body to a draft user. Throws Error(message) on invalid input. */
function applyFields(d, actor, user, body, { creating = false } = {}) {
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
  if (body.role !== undefined && body.role !== user.role) {
    if (!assignableRoles(actor).includes(body.role)) throw new Error('Invalid role');
    user.role = body.role;
  }
  if (body.teamId !== undefined) user.teamId = body.teamId || null;
  if (body.hospitalId !== undefined) user.hospitalId = body.hospitalId || null;
  if (body.daysOff !== undefined) {
    if (!validDaysOff(body.daysOff)) throw new Error('Exactly two different days off are required');
    user.daysOff = [...body.daysOff].sort((a, b) => a - b);
  }
  for (const k of ['phone', 'email', 'employeeId', 'jobTitle']) if (body[k] !== undefined) user[k] = String(body[k]).trim();
  if (body.inRotation !== undefined) user.inRotation = !!body.inRotation;
  if (body.active !== undefined) user.active = !!body.active;
  if (body.password) {
    if (String(body.password).length < 6) throw new Error('Password must be at least 6 characters');
    const { salt, hash } = hashPassword(body.password);
    user.salt = salt;
    user.passwordHash = hash;
  } else if (creating) {
    throw new Error('Password is required');
  }
  if (creating && !user.username) throw new Error('Username is required');

  // Role-dependent placement
  if (user.role === 'hospital_admin') {
    if (!findHospital(d, user.hospitalId)) throw new Error('A hospital admin needs a hospital');
    user.teamId = null;
    user.inRotation = false;
  } else {
    user.hospitalId = null;
    if (['leader', 'staff'].includes(user.role) && !findTeam(d, user.teamId)) throw new Error('Choose a team');
    if (user.teamId && !findTeam(d, user.teamId)) throw new Error('Choose a team');
  }
  if (user.inRotation && !user.teamId) throw new Error('Choose a team');
  if (user.inRotation && !validDaysOff(user.daysOff)) throw new Error('Staff in rotation need two days off');

  // The actor must be allowed to put the user where they now are
  if (actor.role !== 'super_admin') {
    if (user.role === 'hospital_admin' || user.role === 'super_admin') throw new Error('Invalid role');
    if (!canManageTeam(d, actor, user.teamId)) throw new Error('Not allowed');
  }
}

const listFields = (u) => ({ id: u.id, name: u.name, role: u.role, teamId: u.teamId, inRotation: u.inRotation, active: u.active, daysOff: u.daysOff, jobTitle: u.jobTitle });

// GET /api/users?teamId=…  → members of a team
// GET /api/users            → everyone the user may manage
r.get('/', (req, res) => {
  const d = db();
  const { teamId } = req.query;
  if (teamId) {
    if (!canViewTeam(d, req.user, teamId)) return res.status(403).json({ error: 'Not allowed' });
    const members = d.users.filter((u) => u.teamId === teamId);
    return res.json(canManageTeam(d, req.user, teamId) ? members.map(publicUser) : members.map(listFields));
  }
  res.json(d.users.filter((u) => u.id === req.user.id || canManageUser(d, req.user, u)).map(publicUser));
});

// Name directory (for showing who approved / edited something)
r.get('/names', (req, res) => {
  const d = db();
  const hid = userHospitalId(d, req.user);
  const visible = d.users.filter(
    (u) => req.user.role === 'super_admin' || u.role === 'super_admin' || userHospitalId(d, u) === hid
  );
  res.json(Object.fromEntries(visible.map((u) => [u.id, u.name])));
});

r.post('/', (req, res) => {
  const d = db();
  if (req.user.role === 'staff') return res.status(403).json({ error: 'Not allowed' });
  const body = req.body || {};
  const user = {
    id: null, role: 'staff', inRotation: true, active: true, daysOff: [], teamId: null, hospitalId: null,
    phone: '', email: '', createdAt: new Date().toISOString(),
  };
  // Leaders add people to their own team
  if (req.user.role === 'leader') body.teamId = req.user.teamId;
  if (body.role === 'hospital_admin' && !canManageHospital(d, req.user, body.hospitalId)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  try {
    applyFields(d, req.user, user, body, { creating: true });
  } catch (e) {
    return res.status(e.message === 'Not allowed' ? 403 : 400).json({ error: e.message });
  }
  user.id = nextId('user');
  d.users.push(user);
  save();
  res.status(201).json(publicUser(user));
});

r.put('/:id', (req, res) => {
  const d = db();
  const user = d.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!canManageUser(d, req.user, user)) return res.status(403).json({ error: 'Not allowed' });
  const draft = structuredClone(user);
  try {
    applyFields(d, req.user, draft, req.body || {});
    if (user.id === req.user.id && (draft.role !== user.role || draft.active === false)) {
      throw new Error('You cannot remove your own admin access');
    }
  } catch (e) {
    return res.status(e.message === 'Not allowed' ? 403 : 400).json({ error: e.message });
  }
  // Moving to another team: their pending requests follow them
  if (draft.teamId !== user.teamId) {
    for (const q of d.requests) if (q.userId === user.id && q.status === 'pending') q.teamId = draft.teamId;
  }
  Object.assign(user, draft);
  save();
  res.json(publicUser(user));
});

r.delete('/:id', (req, res) => {
  const d = db();
  const user = d.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  if (!canManageUser(d, req.user, user)) return res.status(403).json({ error: 'Not allowed' });
  // Soft delete keeps names readable in historic schedules
  user.active = false;
  user.inRotation = false;
  save();
  res.json({ ok: true });
});

export default r;
