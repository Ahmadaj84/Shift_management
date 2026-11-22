import { Router } from 'express';
import { db, save } from '../db.js';
import { createToken, hashPassword, publicUser, requireAuth, verifyPassword } from '../auth.js';

const r = Router();

// Simple in-memory brute-force protection: max 10 failed logins per IP per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map();
const failCount = (ip) => {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) return 0;
  return f.count;
};
const recordFail = (ip) => {
  const f = fails.get(ip);
  if (!f || f.until < Date.now()) fails.set(ip, { count: 1, until: Date.now() + WINDOW_MS });
  else f.count++;
};

r.post('/login', (req, res) => {
  const ip = req.ip;
  if (failCount(ip) >= MAX_FAILS) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }
  const { username, password } = req.body || {};
  const user = db().users.find(
    (u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase() && u.active !== false
  );
  if (!user || !verifyPassword(password, user)) {
    recordFail(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  fails.delete(ip);
  res.json({ token: createToken(user), user: publicUser(user) });
});

r.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

r.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(currentPassword, req.user)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const { salt, hash } = hashPassword(newPassword);
  req.user.salt = salt;
  req.user.passwordHash = hash;
  save();
  res.json({ ok: true });
});

export default r;
