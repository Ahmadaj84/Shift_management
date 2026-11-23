import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedData } from '../src/seed-data.js';
import { generateMonth, applyAbsence, weekdayCoverage, shiftOf } from '../src/scheduler.js';
import { addDays, daysOfMonth } from '../src/dates.js';

const fresh = () => buildSeedData();

test('days off are balanced so every day can be staffed', () => {
  const d = fresh();
  for (const c of weekdayCoverage(d)) assert.ok(c.available >= c.needed, JSON.stringify(c));
  for (const u of d.users.filter((x) => x.inRotation)) assert.equal(u.daysOff.length, 2);
});

test('generated month: 3 per shift, nobody twice a day, nobody on day off, no night->morning', () => {
  const d = fresh();
  const s = generateMonth(d, '2026-12');
  const byId = Object.fromEntries(d.users.map((u) => [u.id, u]));
  let prev = null;
  for (const date of daysOfMonth('2026-12')) {
    const day = s.days[date];
    const all = Object.values(day.shifts).flat();
    assert.equal(new Set(all).size, all.length, `duplicate on ${date}`);
    for (const sid of Object.keys(day.shifts)) assert.ok(day.shifts[sid].length >= 3, `${date} ${sid}`);
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    for (const id of all) assert.ok(!byId[id].daysOff.includes(wd), `${id} works on day off ${date}`);
    for (const id of Object.values(day.backup).filter(Boolean)) assert.ok(!all.includes(id), 'backup is working');
    if (prev) for (const id of prev.shifts.night) assert.ok(!day.shifts.morning.includes(id), `night->morning ${id} ${date}`);
    assert.equal(day.warnings.length, 0);
    prev = day;
  }
});

test('shift load is fair across the team', () => {
  const d = fresh();
  const s = generateMonth(d, '2026-12');
  const totals = {};
  for (const day of Object.values(s.days)) for (const id of Object.values(day.shifts).flat()) totals[id] = (totals[id] || 0) + 1;
  const vals = Object.values(totals);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 2, JSON.stringify(totals));
});

test('approved absence pulls in the backup person', () => {
  const d = fresh();
  d.schedules['2026-12'] = generateMonth(d, '2026-12');
  const date = '2026-12-10';
  const day = d.schedules['2026-12'].days[date];
  const victim = day.shifts.evening[0];
  const backup = day.backup.evening;
  d.requests.push({ id: 'r1', userId: victim, type: 'excuse', date, status: 'approved' });
  const res = applyAbsence(d, victim, date, { requestId: 'r1' });
  assert.equal(res.status, 'covered');
  assert.equal(res.replacement, backup);
  assert.equal(shiftOf(day, victim), null);
  assert.equal(shiftOf(day, backup), 'evening');
  assert.ok(day.absent.includes(victim));
  assert.equal(day.shifts.evening.length, 3);
});

test('dates helper', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysOfMonth('2028-02').length, 29);
});

test('many months stay fully staffed (team sizes 13-17)', () => {
  for (const extra of [0, 1, 2, 3, 4]) {
    const d = fresh();
    for (let i = 0; i < extra; i++) {
      d.users.push({ ...structuredClone(d.users[1]), id: `x${i}`, name: `Extra ${i}`, username: `x${i}` });
    }
    for (const ym of ['2026-12', '2027-01', '2027-02', '2027-03']) {
      d.schedules[ym] = generateMonth(d, ym);
      for (const [date, day] of Object.entries(d.schedules[ym].days)) {
        assert.equal(day.warnings.length, 0, `${extra} ${date} ${day.warnings}`);
      }
    }
  }
});

test('generated schedules have no conflicts; edits are detected', async () => {
  const { findConflicts } = await import('../../client/src/conflicts.js');
  const d = fresh();
  const s = generateMonth(d, '2026-12');
  const found = findConflicts(s, d.users, d.settings);
  assert.deepEqual(found, [], JSON.stringify(found.slice(0, 3)));

  // put a night-shift person on the next morning, and double-book someone
  const night = s.days['2026-12-09'].shifts.night[0];
  s.days['2026-12-10'].shifts.morning.push(night);
  const someone = s.days['2026-12-11'].shifts.evening[0];
  s.days['2026-12-11'].shifts.morning.push(someone);
  const types = findConflicts(s, d.users, d.settings).map((c) => c.type);
  assert.ok(types.includes('nightMorning'));
  assert.ok(types.includes('double'));
});
