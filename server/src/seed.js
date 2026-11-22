// Reset the database to seed data: `npm run seed`
import fs from 'node:fs';
import { DB_FILE, load } from './db.js';

if (fs.existsSync(DB_FILE) && !process.argv.includes('--force')) {
  console.log('Database already exists. Use --force to reset it.');
  process.exit(0);
}
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
load();
console.log('Seeded. Admin login: admin / admin123 — technicians: tech1..tech13 / tech123');
