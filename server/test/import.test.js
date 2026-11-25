import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

// Set the data folder BEFORE loading any app module (they read it on load)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-import-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test-secret';
const { parseDaysOff } = await import('../src/importTeam.js');

test('days off are read in Arabic and English forms', () => {
  assert.deepEqual(parseDaysOff('الجمعة، السبت'), [5, 6]);
  assert.deepEqual(parseDaysOff('الجمعة والسبت'), [5, 6]);
  assert.deepEqual(parseDaysOff('جمعة - سبت'), [5, 6]);
  assert.deepEqual(parseDaysOff('Fri, Sat'), [5, 6]);
  assert.deepEqual(parseDaysOff('sunday monday'), [0, 1]);
  assert.deepEqual(parseDaysOff('الأحد/الإثنين'), [0, 1]);
  assert.equal(parseDaysOff(''), null);
  assert.equal(parseDaysOff('الجمعة'), 'invalid');
  assert.equal(parseDaysOff('يوم'), 'invalid');
});

// ---- API: template → fill → preview → commit ----
const { load } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
load();
const server = createApp().listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const login = async (u, p) =>
  (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).json()).token;

test('leader imports a filled template', async () => {
  const leader = await login('nurse1', 'nurse123');
  const auth = { Authorization: `Bearer ${leader}` };
  const team = (await (await fetch(base + '/org', { headers: auth })).json())[0].departments[0].teams[0].id;

  // template downloads and has the bilingual headers
  const tpl = await fetch(`${base}/teams/${team}/import/template`, { headers: auth });
  assert.equal(tpl.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await tpl.arrayBuffer()));
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell(1, 1).value, 'الاسم (Name)');

  // fill it like a user would (forgetting to delete the two example rows)
  const rows = [
    ['ليلى حسن', 'layla.h', '20001', 'ممرضة', '0501111111', 'layla@x.com', 'الجمعة، السبت', 'موظف', 'secret12', 'نعم'],
    ['خالد سمير', '', '20002', 'ممرض', '', '', '', '', '', ''], // username from ID, auto days off, generated password
    ['', 'noname', '', '', '', '', '', '', '', ''], // error: no name
    ['مها فهد', 'layla.h', '', '', '', '', '', '', '', ''], // error: duplicate in file
    ['رائد عمر', 'raed.o', '', '', '', '', 'الجمعة', '', '', ''], // error: one day off
    ['سامي قائد', 'sami.l', '', '', '', '', '', 'قائد', '', ''], // error: leader cannot create leaders
    ['عبدالرحمن سعد (محدث)', 'nurse2', '', 'ممرض أول', '', '', 'Sun, Mon', '', '', ''], // update existing member
    ['تقني آخر', 'tech2', '', '', '', '', '', '', '', ''], // error: username of another team
  ];
  for (const r of rows) ws.addRow(r);
  const file = Buffer.from(await wb.xlsx.writeBuffer());

  const preview = await (await fetch(`${base}/teams/${team}/import/preview`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: file })).json();
  const byName = (n) => preview.rows.find((r) => r.name === n || (n === '' && !r.name));
  assert.ok(byName('أحمد محمد').errors.includes('exampleRow'), 'template example rows are skipped');
  assert.ok(byName('سارة علي').errors.includes('exampleRow'));
  assert.equal(byName('ليلى حسن').status, 'new');
  assert.deepEqual(byName('ليلى حسن').daysOff, [5, 6]);
  assert.equal(byName('خالد سمير').username, '20002');
  assert.ok(byName('خالد سمير').warnings.includes('daysOffAuto'));
  assert.ok(byName('خالد سمير').warnings.includes('passwordGenerated'));
  assert.ok(byName('').errors.includes('nameRequired'));
  assert.ok(byName('مها فهد').errors.includes('duplicateInFile'));
  assert.ok(byName('رائد عمر').errors.includes('daysOffInvalid'));
  assert.ok(byName('سامي قائد').errors.includes('roleNotAllowed'));
  assert.equal(byName('عبدالرحمن سعد (محدث)').status, 'update');
  assert.ok(byName('تقني آخر').errors.includes('usernameTaken'));

  const result = await (await fetch(`${base}/teams/${team}/import/commit`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: preview.raw }) })).json();
  assert.deepEqual([result.created, result.updated, result.skipped], [2, 1, 7]);
  assert.equal(result.credentials.length, 1);
  assert.equal(result.credentials[0].username, '20002');

  // new people can log in; the update was applied
  assert.ok(await login('layla.h', 'secret12'));
  assert.ok(await login('20002', result.credentials[0].password));
  const members = await (await fetch(`${base}/users?teamId=${team}`, { headers: auth })).json();
  const updated = members.find((u) => u.username === 'nurse2');
  assert.equal(updated.jobTitle, 'ممرض أول');
  assert.deepEqual(updated.daysOff, [0, 1]);

  // CSV with ; separator and English headers also works
  const csv = '﻿Name;Username;Days off\nNew CSV Person;csv.person;Thu, Fri\n';
  const p2 = await (await fetch(`${base}/teams/${team}/import/preview`, { method: 'POST', headers: { ...auth, 'Content-Type': 'text/csv' }, body: csv })).json();
  assert.equal(p2.rows[0].status, 'new');
  assert.deepEqual(p2.rows[0].daysOff, [4, 5]);

  // staff cannot import
  const staff = await login('nurse3', 'nurse123');
  const denied = await fetch(`${base}/teams/${team}/import/preview`, { method: 'POST', headers: { Authorization: `Bearer ${staff}` }, body: file });
  assert.equal(denied.status, 403);
});
