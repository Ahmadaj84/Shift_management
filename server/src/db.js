// Tiny JSON-file database. The whole dataset is kept in memory and
// written atomically (tmp file + rename) after every mutation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedData } from './seed-data.js';
import { migrate } from './org.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');

let data = null;

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    data = buildSeedData();
    save();
    console.log(`[db] created new database with seed data at ${DB_FILE}`);
  } else {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if ((data.version || 1) < 2) {
      // Upgrade from the single-team format; keep a copy of the original first.
      const backup = `${DB_FILE}.v1-backup-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backup);
      migrate(data);
      save();
      console.log(`[db] upgraded database to multi-hospital format (backup: ${backup})`);
    }
  }
  // forward-compatible defaults
  data.users ??= [];
  data.requests ??= [];
  data.schedules ??= {};
  data.hospitals ??= [];
  data.departments ??= [];
  data.teams ??= [];
  data.counters ??= {};
  for (const k of ['user', 'request', 'hospital', 'department', 'team']) data.counters[k] ??= 0;
  return data;
}

export function db() {
  if (!data) load();
  return data;
}

export function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const PREFIX = { user: 'u', request: 'r', hospital: 'h', department: 'dp', team: 't' };
export function nextId(kind) {
  const d = db();
  d.counters[kind] = (d.counters[kind] || 0) + 1;
  return `${PREFIX[kind]}${d.counters[kind]}`;
}

/** For tests: replace in-memory data without touching disk. */
export function _setData(newData) {
  data = newData;
}
