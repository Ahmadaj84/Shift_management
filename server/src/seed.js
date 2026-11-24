// Reset the database to seed data: `npm run seed`
import fs from 'node:fs';
import { DB_FILE, load } from './db.js';

if (fs.existsSync(DB_FILE) && !process.argv.includes('--force')) {
  console.log('Database already exists. Use --force to reset it.');
  process.exit(0);
}
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
load();
console.log('Seeded. Logins: admin/admin123 (super admin), hadmin/hadmin123 (hospital admin), tech1..13/tech123, nurse1..10/nurse123, er1..9/er123 (the first of each team is its leader)');
