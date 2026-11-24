import { Router } from 'express';
import { db, nextId, save } from '../db.js';
import { canManageTeam, findTeam, teamCtx } from '../org.js';
import { dateRange, isDate, monthOf } from '../dates.js';
import { applyAbsence, replacementCandidates, shiftOf } from '../scheduler.js';

const r = Router();

const LEAVE_TYPES = ['annual', 'sick', 'emergency', 'other'];
const MAX_LEAVE_DAYS = 60;

const datesOf = (req) => (req.type === 'excuse' ? [req.date] : dateRange(req.startDate, req.endDate));

/** Load the request and check the user manages its team; sets req.item and req.ctx. */
function managedRequest(req, res, next) {
  const d = db();
  const item = d.requests.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
  if (!canManageTeam(d, req.user, item.teamId)) return res.status(403).json({ error: 'Not allowed' });
  req.item = item;
  req.ctx = teamCtx(d, findTeam(d, item.teamId));
  next();
}

r.get('/', (req, res) => {
  const d = db();
  // Own requests + requests of the teams the user manages
  let list = d.requests.filter((x) => x.userId === req.user.id || canManageTeam(d, req.user, x.teamId));
  if (req.query.mine) list = list.filter((x) => x.userId === req.user.id);
  if (req.query.teamId) list = list.filter((x) => x.teamId === req.query.teamId);
  if (req.query.status) list = list.filter((x) => x.status === req.query.status);
  res.json([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

r.post('/', (req, res) => {
  const d = db();
  const body = req.body || {};
  // Leaders/admins may file a request on behalf of a member of a team they manage.
  const userId = body.userId || req.user.id;
  const target = d.users.find((u) => u.id === userId && u.active !== false);
  if (!target || !target.teamId) return res.status(400).json({ error: 'Unknown staff member' });
  if (userId !== req.user.id && !canManageTeam(d, req.user, target.teamId)) return res.status(403).json({ error: 'Not allowed' });

  const item = {
    id: null,
    userId,
    teamId: target.teamId,
    type: body.type,
    reason: String(body.reason || '').trim().slice(0, 500),
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: req.user.id,
  };
  if (body.type === 'excuse') {
    if (!isDate(body.date)) return res.status(400).json({ error: 'A valid date is required' });
    item.date = body.date;
  } else if (body.type === 'leave') {
    if (!isDate(body.startDate) || !isDate(body.endDate)) return res.status(400).json({ error: 'Valid start and end dates are required' });
    if (body.endDate < body.startDate) return res.status(400).json({ error: 'End date is before start date' });
    if (dateRange(body.startDate, body.endDate).length > MAX_LEAVE_DAYS) return res.status(400).json({ error: `Leave cannot exceed ${MAX_LEAVE_DAYS} days` });
    item.startDate = body.startDate;
    item.endDate = body.endDate;
    item.leaveType = LEAVE_TYPES.includes(body.leaveType) ? body.leaveType : 'annual';
  } else {
    return res.status(400).json({ error: 'Type must be "leave" or "excuse"' });
  }
  if (!item.reason) return res.status(400).json({ error: 'Please give a reason' });

  const newDates = new Set(datesOf(item));
  const clash = d.requests.find(
    (x) => x.userId === userId && ['pending', 'approved'].includes(x.status) && datesOf(x).some((dt) => newDates.has(dt))
  );
  if (clash) return res.status(409).json({ error: 'You already have a pending or approved request covering these dates' });

  item.id = nextId('request');
  d.requests.push(item);
  save();
  res.status(201).json(item);
});

// Cancel own pending request
r.delete('/:id', (req, res) => {
  const d = db();
  const item = d.requests.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
  if (item.userId !== req.user.id && !canManageTeam(d, req.user, item.teamId)) return res.status(403).json({ error: 'Not allowed' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
  item.status = 'cancelled';
  item.reviewedAt = new Date().toISOString();
  save();
  res.json(item);
});

// For the approval dialog: per affected date, the shift and the suggested backup.
r.get('/:id/coverage', managedRequest, (req, res) => {
  const { item, ctx: d } = req;
  const rows = datesOf(item).map((date) => {
    const day = d.schedules[monthOf(date)]?.days?.[date];
    if (!day) return { date, scheduled: false };
    const shift = shiftOf(day, item.userId);
    const isBackupFor = Object.keys(day.backup).find((k) => day.backup[k] === item.userId) || null;
    return {
      date,
      scheduled: true,
      shift,
      isBackupFor,
      candidates: shift ? replacementCandidates(d, date, shift, item.userId) : [],
    };
  });
  res.json(rows);
});

r.post('/:id/approve', managedRequest, (req, res) => {
  const { item, ctx: d } = req;
  if (item.status !== 'pending') return res.status(400).json({ error: `Request is already ${item.status}` });
  const replacements = req.body?.replacements || {}; // { date: userId }

  item.status = 'approved';
  item.reviewedBy = req.user.id;
  item.reviewedAt = new Date().toISOString();
  item.adminNote = String(req.body?.note || '').slice(0, 500);
  item.coverage = datesOf(item).map((date) =>
    applyAbsence(d, item.userId, date, { preferredId: replacements[date] || null, requestId: item.id })
  );
  save();
  res.json(item);
});

r.post('/:id/reject', managedRequest, (req, res) => {
  const { item } = req;
  if (item.status !== 'pending') return res.status(400).json({ error: `Request is already ${item.status}` });
  item.status = 'rejected';
  item.reviewedBy = req.user.id;
  item.reviewedAt = new Date().toISOString();
  item.adminNote = String(req.body?.note || '').slice(0, 500);
  save();
  res.json(item);
});

export default r;
