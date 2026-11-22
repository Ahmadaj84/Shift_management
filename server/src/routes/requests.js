import { Router } from 'express';
import { db, nextId, save } from '../db.js';
import { requireAdmin } from '../auth.js';
import { dateRange, isDate, monthOf } from '../dates.js';
import { applyAbsence, replacementCandidates, shiftOf } from '../scheduler.js';

const r = Router();

const LEAVE_TYPES = ['annual', 'sick', 'emergency', 'other'];
const MAX_LEAVE_DAYS = 60;

const datesOf = (req) => (req.type === 'excuse' ? [req.date] : dateRange(req.startDate, req.endDate));

r.get('/', (req, res) => {
  const d = db();
  let list = d.requests;
  if (req.user.role !== 'admin') list = list.filter((x) => x.userId === req.user.id);
  if (req.query.status) list = list.filter((x) => x.status === req.query.status);
  res.json([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

r.post('/', (req, res) => {
  const d = db();
  const body = req.body || {};
  // Admins may file a request on behalf of a team member.
  const userId = req.user.role === 'admin' && body.userId ? body.userId : req.user.id;
  if (!d.users.some((u) => u.id === userId && u.active !== false)) return res.status(400).json({ error: 'Unknown staff member' });

  const item = {
    id: null,
    userId,
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
  if (item.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
  item.status = 'cancelled';
  item.reviewedAt = new Date().toISOString();
  save();
  res.json(item);
});

// For the approval dialog: per affected date, the shift and the suggested backup.
r.get('/:id/coverage', requireAdmin, (req, res) => {
  const d = db();
  const item = d.requests.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
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

r.post('/:id/approve', requireAdmin, (req, res) => {
  const d = db();
  const item = d.requests.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
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

r.post('/:id/reject', requireAdmin, (req, res) => {
  const d = db();
  const item = d.requests.find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: `Request is already ${item.status}` });
  item.status = 'rejected';
  item.reviewedBy = req.user.id;
  item.reviewedAt = new Date().toISOString();
  item.adminNote = String(req.body?.note || '').slice(0, 500);
  save();
  res.json(item);
});

export default r;
