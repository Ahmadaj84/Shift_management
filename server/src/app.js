import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import scheduleRoutes from './routes/schedule.js';
import requestRoutes from './routes/requests.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/schedule', requireAuth, scheduleRoutes);
  app.use('/api/requests', requireAuth, requestRoutes);
  app.use('/api/settings', requireAuth, settingsRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built Vue app in production
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
  });
  return app;
}
