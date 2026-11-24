// End-to-end API checks with a real server on a temporary data folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-api-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test-secret';
const { load } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
load();
const server = createApp().listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(token, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const login = async (username, password) => (await call(null, 'POST', '/auth/login', { username, password })).body.token;

test('roles see and manage only their scope', async () => {
  const admin = await login('admin', 'admin123');
  const hadmin = await login('hadmin', 'hadmin123');
  const leader = await login('tech1', 'tech123');
  const staff = await login('tech2', 'tech123');
  const nurseLeader = await login('nurse1', 'nurse123');

  const org = (await call(admin, 'GET', '/org')).body;
  const teams = org.flatMap((h) => h.departments.flatMap((d) => d.teams));
  const ecg = teams.find((t) => t.name === 'فريق تخطيط القلب').id;
  const er = teams.find((t) => t.name === 'تمريض الطوارئ').id;
  assert.equal(teams.length, 3);

  // leader generates own team's schedule; staff and other leaders cannot
  assert.equal((await call(leader, 'POST', `/teams/${ecg}/schedule/2026-12/generate`, {})).status, 200);
  assert.equal((await call(staff, 'POST', `/teams/${ecg}/schedule/2026-12/generate`, { overwrite: true })).status, 403);
  assert.equal((await call(nurseLeader, 'GET', `/teams/${ecg}/schedule/2026-12`)).status, 403);
  // staff cannot see a draft; can after publishing
  assert.equal((await call(staff, 'GET', `/teams/${ecg}/schedule/2026-12`)).body, null);
  await call(leader, 'POST', `/teams/${ecg}/schedule/2026-12/publish`, { published: true });
  assert.ok((await call(staff, 'GET', `/teams/${ecg}/schedule/2026-12`)).body.days);

  // hospital admin: own hospital only
  assert.equal((await call(hadmin, 'GET', `/teams/${ecg}`)).status, 200);
  assert.equal((await call(hadmin, 'GET', `/teams/${er}`)).status, 403);
  assert.equal((await call(hadmin, 'POST', '/org/hospitals', { name: 'X' })).status, 403);

  // staff request → visible to own leader, not to the nurse leader; leader approves
  const req = await call(staff, 'POST', '/requests', { type: 'excuse', date: '2026-12-10', reason: 'test' });
  assert.equal(req.status, 201);
  assert.equal(req.body.teamId, ecg);
  const nurseList = (await call(nurseLeader, 'GET', '/requests')).body;
  assert.ok(!nurseList.some((x) => x.id === req.body.id));
  assert.equal((await call(nurseLeader, 'POST', `/requests/${req.body.id}/approve`, {})).status, 403);
  const ok = await call(leader, 'POST', `/requests/${req.body.id}/approve`, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'approved');

  // leader can add staff only to own team, and cannot create leaders
  const day = [0, 1];
  assert.equal((await call(leader, 'POST', '/users', { name: 'New', username: 'newtech', password: 'secret1', daysOff: day })).status, 201);
  assert.equal((await call(leader, 'POST', '/users', { name: 'L', username: 'newlead', password: 'secret1', role: 'leader', daysOff: day })).status, 400);

  // super admin builds a new hospital → department → team
  const h = (await call(admin, 'POST', '/org/hospitals', { name: 'مستشفى جديد' })).body;
  const dep = (await call(admin, 'POST', '/org/departments', { hospitalId: h.id, name: 'الأشعة' })).body;
  const team = await call(admin, 'POST', '/org/teams', { departmentId: dep.id, name: 'فريق الأشعة', template: 'two12' });
  assert.equal(team.status, 201);
  assert.equal(team.body.settings.shifts.length, 2);
  // and its hospital admin, who then manages it
  const ha = await call(admin, 'POST', '/users', { name: 'HA', username: 'ha2', password: 'secret1', role: 'hospital_admin', hospitalId: h.id });
  assert.equal(ha.status, 201);
  const ha2 = await login('ha2', 'secret1');
  assert.equal((await call(ha2, 'PUT', `/teams/${team.body.id}/settings`, { staffPerShift: 4 })).status, 200);
  assert.equal((await call(ha2, 'GET', `/teams/${ecg}`)).status, 403);

  // Excel export works per team
  const res = await fetch(`${base}/teams/${ecg}/schedule/2026-12/export`, { headers: { Authorization: `Bearer ${staff}` } });
  assert.equal(res.status, 200);
  assert.ok((await res.arrayBuffer()).byteLength > 5000);
});
