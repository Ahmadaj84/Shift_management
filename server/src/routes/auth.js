import { Router } from 'express';
import { db, save } from '../db.js';
import { createToken, hashPassword, publicUser, requireAuth, verifyPassword } from '../auth.js';

const r = Router();

r.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db().users.find(
    (u) => u.username.toLowerCase() === String(username || '').trim().toLowerCase() && u.active !== false
  );
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
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
