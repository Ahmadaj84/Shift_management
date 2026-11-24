import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedData } from '../src/seed-data.js';
import { migrate, teamCtx, canManageTeam, canManageUser, orgTree } from '../src/org.js';
import { generateMonth } from '../src/scheduler.js';
import { findConflicts } from '../../client/src/conflicts.js';

test('every demo team (3×8h and 2×12h) gets a conflict-free month', () => {
  const d = buildSeedData();
  for (const team of d.teams) {
    const ctx = teamCtx(d, team);
    const s = generateMonth(ctx, '2026-12');
    const found = findConflicts(s, ctx.users, ctx.settings);
    assert.deepEqual(found, [], `${team.name}: ${JSON.stringify(found.slice(0, 2))}`);
    // only this team's members are scheduled
    const ids = new Set(ctx.users.map((u) => u.id));
    for (const day of Object.values(s.days)) for (const id of Object.values(day.shifts).flat()) assert.ok(ids.has(id));
  }
});

test('v1 single-team data is migrated without losing anything', () => {
  const v1 = {
    settings: { departmentName: 'ECG Department', staffPerShift: 3, assignExtraStaff: true, shifts: [{ id: 'morning', name: 'Morning' }] },
    users: [
      { id: 'u1', role: 'admin', inRotation: false, name: 'A' },
      { id: 'u2', role: 'technician', inRotation: true, name: 'B' },
    ],
    requests: [{ id: 'r1', userId: 'u2', status: 'approved' }],
    schedules: { '2026-11': { days: { '2026-11-01': {} } } },
    counters: { user: 2, request: 1 },
  };
  assert.equal(migrate(v1), true);
  assert.equal(v1.version, 2);
  assert.equal(v1.users[0].role, 'super_admin');
  assert.equal(v1.users[1].role, 'staff');
  assert.equal(v1.users[1].teamId, 't1');
  assert.equal(v1.requests[0].teamId, 't1');
  assert.ok(v1.schedules.t1['2026-11']);
  assert.equal(v1.teams[0].settings.shifts[0].id, 'morning');
  assert.equal(v1.settings, undefined);
  assert.equal(migrate(v1), false, 'second run is a no-op');
});

test('permissions follow hospital / team boundaries', () => {
  const d = buildSeedData();
  const user = (username) => d.users.find((u) => u.username === username);
  const [ecg, ward, er] = d.teams.map((t) => t.id);
  const admin = user('admin'), hadmin = user('hadmin'), leader = user('tech1'), staff = user('tech2'), nurse = user('nurse2');

  assert.ok(canManageTeam(d, admin, er));
  assert.ok(canManageTeam(d, hadmin, ecg) && canManageTeam(d, hadmin, ward));
  assert.ok(!canManageTeam(d, hadmin, er), 'other hospital');
  assert.ok(canManageTeam(d, leader, ecg) && !canManageTeam(d, leader, ward));
  assert.ok(!canManageTeam(d, staff, ecg));

  assert.ok(canManageUser(d, leader, staff));
  assert.ok(!canManageUser(d, leader, nurse), 'other team');
  assert.ok(!canManageUser(d, hadmin, admin), 'cannot touch super admin');
  assert.ok(!canManageUser(d, hadmin, user('er2')), 'other hospital');

  assert.equal(orgTree(d, staff).flatMap((h) => h.departments.flatMap((x) => x.teams)).length, 1);
  assert.equal(orgTree(d, hadmin).length, 1);
  assert.equal(orgTree(d, admin).length, 2);
});
