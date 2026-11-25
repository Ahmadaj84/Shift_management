// Import team members from an Excel (.xlsx) or CSV file.
//   1. buildImportTemplate()   – a ready-to-fill template
//   2. parseImportFile()       – read rows, matching columns by Arabic/English name
//   3. validateImportRows()    – preview: new / update / error for each row
//   4. commitImportRows()      – create or update users (re-validated)
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { hashPassword } from './auth.js';
import { assignableRoles, canManageUser } from './org.js';
import { pickDaysOff } from './scheduler.js';

export const MAX_ROWS = 500;

// Column key → accepted header names (compared after normalising)
const COLUMNS = {
  name: ['الاسم', 'الاسم الكامل', 'اسم الموظف', 'name', 'full name', 'employee name'],
  username: ['اسم المستخدم', 'المستخدم', 'username', 'user name', 'login', 'user'],
  employeeId: ['الرقم الوظيفي', 'رقم الموظف', 'employee id', 'employee number', 'emp id', 'staff id', 'id'],
  jobTitle: ['المسمى الوظيفي', 'الوظيفة', 'المسمى', 'job title', 'title', 'position'],
  phone: ['الجوال', 'رقم الجوال', 'الهاتف', 'رقم الهاتف', 'phone', 'mobile', 'phone number'],
  email: ['البريد الإلكتروني', 'البريد الالكتروني', 'البريد', 'الإيميل', 'email', 'e-mail'],
  daysOff: ['أيام الراحة', 'ايام الراحة', 'يوما الراحة', 'الراحة', 'days off', 'off days', 'weekly days off'],
  role: ['الدور', 'الصلاحية', 'role'],
  password: ['كلمة المرور', 'كلمة السر', 'password'],
  inRotation: ['يعمل في المناوبات', 'في المناوبات', 'works shifts', 'in rotation', 'rotation'],
};

const TEMPLATE_HEADERS = {
  ar: { name: 'الاسم', username: 'اسم المستخدم', employeeId: 'الرقم الوظيفي', jobTitle: 'المسمى الوظيفي', phone: 'الجوال', email: 'البريد الإلكتروني', daysOff: 'أيام الراحة', role: 'الدور', password: 'كلمة المرور', inRotation: 'يعمل في المناوبات' },
  en: { name: 'Name', username: 'Username', employeeId: 'Employee ID', jobTitle: 'Job title', phone: 'Phone', email: 'Email', daysOff: 'Days off', role: 'Role', password: 'Password', inRotation: 'Works shifts' },
};

// ---------- text normalisation ----------
const normArabic = (s) =>
  s
    .replace(/[ً-ٟـ]/g, '') // diacritics, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
const normHeader = (s) => normArabic(String(s ?? '')).toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();

const HEADER_LOOKUP = new Map();
for (const [key, names] of Object.entries(COLUMNS)) for (const n of names) HEADER_LOOKUP.set(normHeader(n), key);

/** "الاسم (Name)" → tries "الاسم (name)", "الاسم" and "name". */
function headerKey(text) {
  const h = normHeader(text);
  if (!h) return null;
  const candidates = [h, h.replace(/\(.*?\)/g, '').trim(), ...[...h.matchAll(/\((.*?)\)/g)].map((m) => m[1].trim())];
  for (const c of candidates) if (HEADER_LOOKUP.has(c)) return HEADER_LOOKUP.get(c);
  return null;
}

/** Plain text of any exceljs cell value. */
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text != null) return cellText(v.text);
    if (v.result != null) return cellText(v.result);
    if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/, '');
    return '';
  }
  return String(v).trim();
}

// ---------- value parsing ----------
const DAY_WORDS = new Map(
  Object.entries({
    احد: 0, الاحد: 0, sun: 0, sunday: 0,
    اثنين: 1, الاثنين: 1, اثنان: 1, mon: 1, monday: 1,
    ثلاثاء: 2, الثلاثاء: 2, tue: 2, tues: 2, tuesday: 2,
    اربعاء: 3, الاربعاء: 3, wed: 3, wednesday: 3,
    خميس: 4, الخميس: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
    جمعه: 5, الجمعه: 5, fri: 5, friday: 5,
    سبت: 6, السبت: 6, sat: 6, saturday: 6,
  })
);

/** "الجمعة، السبت" / "Fri - Sat" / "الجمعة والسبت" → [5, 6]; null if blank; 'invalid' if unreadable. */
export function parseDaysOff(text) {
  const raw = normArabic(String(text || '')).toLowerCase().trim();
  if (!raw) return null;
  const tokens = raw.split(/[\s,،;؛/\\|+&\-–—]+/).map((t) => t.replace(/^و(?=ال)/, '')).filter(Boolean);
  const days = [];
  for (const tok of tokens) {
    if (['و', 'and'].includes(tok)) continue;
    const d = DAY_WORDS.get(tok);
    if (d === undefined) return 'invalid';
    if (!days.includes(d)) days.push(d);
  }
  return days.length === 2 ? days.sort((a, b) => a - b) : 'invalid';
}

const LEADER_WORDS = ['leader', 'team leader', 'supervisor', 'head', 'قائد', 'قائده', 'قائد الفريق', 'قائده الفريق', 'رئيس', 'رئيسه', 'رئيس الفريق', 'مشرف', 'مشرفه'];
const STAFF_WORDS = ['staff', 'member', 'employee', 'موظف', 'موظفه', 'عضو', 'عضوه'];
function parseRole(text) {
  const t = normHeader(text);
  if (!t) return 'staff';
  if (LEADER_WORDS.map(normHeader).includes(t)) return 'leader';
  if (STAFF_WORDS.map(normHeader).includes(t)) return 'staff';
  return 'invalid';
}

function parseYesNo(text) {
  const t = normHeader(text);
  if (!t) return true;
  if (['نعم', 'yes', 'y', '1', 'true', '✓', '✔', 'x'].includes(t)) return true;
  if (['لا', 'no', 'n', '0', 'false'].includes(t)) return false;
  return 'invalid';
}

// ---------- template ----------
const EXAMPLE_ROWS = new Set(
  ['أحمد محمد|ahmed.m', 'سارة علي|sara.a', 'Ahmed Mohammed|ahmed.m', 'Sara Ali|sara.a'].map((x) => {
    const [n, u] = x.split('|');
    return `${normHeader(n)}|${u}`;
  })
);

export async function buildImportTemplate(lang = 'ar') {
  const ar = lang !== 'en';
  const H = TEMPLATE_HEADERS[ar ? 'ar' : 'en'];
  const keys = Object.keys(H);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(ar ? 'الفريق' : 'Team', { views: [{ rightToLeft: ar, state: 'frozen', ySplit: 1 }] });
  ws.columns = keys.map((k) => ({
    header: ar ? `${H[k]} (${TEMPLATE_HEADERS.en[k]})` : H[k],
    key: k,
    width: { name: 26, email: 26, daysOff: 18, inRotation: 18 }[k] || 16,
  }));
  const head = ws.getRow(1);
  head.height = 32;
  head.eachCell((c, i) => {
    const required = keys[i - 1] === 'name';
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFB91C1C' : 'FF0B1F2E' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  const examples = ar
    ? [
        ['أحمد محمد', 'ahmed.m', '10234', 'ممرض', '0500000000', 'ahmed@example.com', 'الجمعة، السبت', 'موظف', '', 'نعم'],
        ['سارة علي', 'sara.a', '10235', 'رئيسة تمريض', '0550000000', '', '', 'قائد', '', 'نعم'],
      ]
    : [
        ['Ahmed Mohammed', 'ahmed.m', '10234', 'Nurse', '0500000000', 'ahmed@example.com', 'Fri, Sat', 'staff', '', 'yes'],
        ['Sara Ali', 'sara.a', '10235', 'Head nurse', '0550000000', '', '', 'leader', '', 'yes'],
      ];
  for (const ex of examples) {
    const row = ws.addRow(ex);
    row.eachCell((c) => (c.font = { color: { argb: 'FF64748B' }, italic: true }));
  }
  // Keep phone / ID / username as text so leading zeros survive
  for (const k of ['username', 'employeeId', 'phone']) ws.getColumn(k).numFmt = '@';
  const roleList = ar ? '"موظف,قائد"' : '"staff,leader"';
  const yesNo = ar ? '"نعم,لا"' : '"yes,no"';
  const col = (k) => ws.getColumn(k).letter;
  ws.dataValidations.add(`${col('role')}2:${col('role')}${MAX_ROWS + 1}`, { type: 'list', allowBlank: true, formulae: [roleList] });
  ws.dataValidations.add(`${col('inRotation')}2:${col('inRotation')}${MAX_ROWS + 1}`, { type: 'list', allowBlank: true, formulae: [yesNo] });

  const help = wb.addWorksheet(ar ? 'التعليمات' : 'Instructions', { views: [{ rightToLeft: ar }] });
  help.getColumn(1).width = 110;
  const lines = ar
    ? [
        'طريقة التعبئة',
        '• صف واحد لكل موظف. احذف صفّي المثال (الرماديين) أو استبدلهما.',
        '• الاسم: إلزامي.',
        '• اسم المستخدم: أحرف إنجليزية وأرقام و . _ - (3 إلى 32). إذا تُرك فارغاً يُستخدم الرقم الوظيفي.',
        '• إذا كان اسم المستخدم (أو الرقم الوظيفي) موجوداً في الفريق، تُحدَّث بيانات الموظف بدلاً من إضافته.',
        '• أيام الراحة: يومان، مثل «الجمعة، السبت» أو «Fri, Sat». إذا تُركت فارغة تُوزَّع تلقائياً بشكل متوازن.',
        '• الدور: «موظف» (الافتراضي) أو «قائد».',
        '• كلمة المرور: 6 أحرف على الأقل. إذا تُركت فارغة تُنشأ كلمة مرور ويمكنك تنزيلها بعد الاستيراد.',
        '• يعمل في المناوبات: «نعم» (الافتراضي) أو «لا».',
        '• يمكن تغيير ترتيب الأعمدة، ويُقبل ملف Excel (‎.xlsx) أو CSV. الحد الأقصى 500 صف.',
      ]
    : [
        'How to fill in',
        '• One row per person. Delete or replace the two grey example rows.',
        '• Name: required.',
        '• Username: letters, digits and . _ - (3 to 32). If blank, the employee ID is used.',
        '• If the username (or employee ID) already exists in the team, that person is updated instead of added.',
        '• Days off: two days, e.g. "Fri, Sat" or «الجمعة، السبت». If blank, balanced days off are assigned automatically.',
        '• Role: "staff" (default) or "leader".',
        '• Password: at least 6 characters. If blank, one is generated and you can download it after the import.',
        '• Works shifts: "yes" (default) or "no".',
        '• Columns can be in any order. Excel (.xlsx) or CSV files are accepted. Up to 500 rows.',
      ];
  lines.forEach((l, i) => {
    const c = help.getCell(i + 1, 1);
    c.value = l;
    c.font = i === 0 ? { bold: true, size: 14 } : { size: 11 };
    c.alignment = { wrapText: true, horizontal: ar ? 'right' : 'left' };
  });
  return wb;
}

// ---------- parsing ----------
/**
 * Read the first sheet whose header row has a name column.
 * Returns { rows: [{ row, values: { key: text } }], columns: [keys], error? }.
 */
export async function parseImportFile(buffer) {
  const wb = new ExcelJS.Workbook();
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK' = xlsx
  try {
    if (isZip) await wb.xlsx.load(buffer);
    else {
      let text = buffer.toString('utf8').replace(/^﻿/, '');
      // Excel's "CSV" in some regions uses ';' — detect from the header line
      const first = text.split(/\r?\n/, 1)[0];
      const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
      await wb.csv.read(Readable.from([text]), { parserOptions: { delimiter } });
    }
  } catch {
    return { error: 'unreadable', rows: [], columns: [] };
  }
  for (const ws of wb.worksheets) {
    // header = first of the top 10 rows with a "name" column
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const map = {};
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
        const key = headerKey(cellText(cell.value));
        if (key && !Object.values(map).includes(key)) map[c] = key;
      });
      if (!Object.values(map).includes('name')) continue;
      const rows = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const values = {};
        for (const [c, key] of Object.entries(map)) values[key] = cellText(ws.getRow(i).getCell(+c).value);
        if (Object.values(values).every((v) => !v)) continue; // empty row
        rows.push({ row: i, values });
      }
      if (rows.length > MAX_ROWS) return { error: 'tooManyRows', rows: [], columns: [] };
      return { rows, columns: Object.values(map) };
    }
  }
  return { error: 'noNameColumn', rows: [], columns: [] };
}

// ---------- validation ----------
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

/**
 * Validate rows against the team. Each result:
 *   { row, name, username, employeeId, jobTitle, phone, email, role, inRotation,
 *     daysOff, daysOffAuto, password (bool: given), status: 'new'|'update'|'error',
 *     userId (update), errors: [codes], warnings: [codes] }
 * `rows` are { row, values } from parseImportFile (or the same shape sent back by the client).
 */
export function validateImportRows(d, actor, team, rows) {
  const members = d.users.filter((u) => u.teamId === team.id);
  const offCount = Array(7).fill(0);
  for (const u of members) if (u.active !== false && u.inRotation) for (const x of u.daysOff || []) offCount[x]++;
  const seenUsernames = new Map();
  const allowedRoles = assignableRoles(actor);

  const out = rows.map(({ row, values: v }, i) => {
    const r = {
      row,
      name: (v.name || '').trim().slice(0, 100),
      username: (v.username || '').trim().toLowerCase(),
      employeeId: (v.employeeId || '').trim().slice(0, 40),
      jobTitle: (v.jobTitle || '').trim().slice(0, 60),
      phone: (v.phone || '').trim().slice(0, 30),
      email: (v.email || '').trim().slice(0, 100),
      errors: [],
      warnings: [],
    };
    if (!r.name) r.errors.push('nameRequired');
    // The template's grey example rows, left in by mistake
    if (EXAMPLE_ROWS.has(`${normHeader(r.name)}|${r.username}`)) r.errors.push('exampleRow');

    // username: given, or from the employee ID
    if (!r.username && r.employeeId) {
      const fromId = r.employeeId.toLowerCase().replace(/\s+/g, '');
      if (USERNAME_RE.test(fromId)) {
        r.username = fromId;
        r.warnings.push('usernameFromId');
      }
    }
    // existing member of this team? (by username, else by employee ID)
    const existing =
      (r.username && d.users.find((u) => u.username === r.username)) ||
      (r.employeeId && members.find((u) => u.employeeId && u.employeeId === r.employeeId)) ||
      null;
    if (existing && existing.teamId === team.id) {
      r.status = 'update';
      r.userId = existing.id;
      if (!r.username) r.username = existing.username;
      if (!canManageUser(d, actor, existing)) r.errors.push('notAllowed');
    } else if (existing) {
      r.errors.push('usernameTaken');
    } else {
      r.status = 'new';
      if (!r.username) r.errors.push('usernameRequired');
      else if (!USERNAME_RE.test(r.username)) r.errors.push('usernameInvalid');
    }
    if (r.username) {
      if (seenUsernames.has(r.username)) r.errors.push('duplicateInFile');
      else seenUsernames.set(r.username, i);
    }

    const role = parseRole(v.role);
    if (role === 'invalid') r.errors.push('roleInvalid');
    else if (!allowedRoles.includes(role)) r.errors.push('roleNotAllowed');
    // Updating: keep the current role when the cell is blank
    r.role = role === 'invalid' ? 'staff' : !v.role && existing && r.status === 'update' ? existing.role : role;

    const rot = parseYesNo(v.inRotation);
    if (rot === 'invalid') r.errors.push('rotationInvalid');
    r.inRotation = rot === 'invalid' ? true : !v.inRotation && r.status === 'update' ? existing.inRotation : rot;

    const days = parseDaysOff(v.daysOff);
    if (days === 'invalid') r.errors.push('daysOffInvalid');
    r.daysOff = Array.isArray(days) ? days : null;

    r.password = !!v.password;
    if (v.password && String(v.password).length < 6) r.errors.push('passwordShort');
    if (!v.password && r.status === 'new') r.warnings.push('passwordGenerated');
    if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) r.warnings.push('emailOdd');

    if (r.errors.length) r.status = 'error';
    return r;
  });

  // Balanced days off for valid rows that need them (counting the team + earlier rows)
  for (const r of out) if (r.status !== 'error' && r.inRotation && r.daysOff) for (const x of r.daysOff) offCount[x]++;
  out.forEach((r, i) => {
    if (r.status === 'error' || !r.inRotation || r.daysOff) return;
    const current = r.status === 'update' ? d.users.find((u) => u.id === r.userId)?.daysOff : null;
    if (current?.length === 2) return; // keep an existing member's days off
    r.daysOff = pickDaysOff(offCount, i);
    r.daysOffAuto = true;
    r.warnings.push('daysOffAuto');
  });
  return out;
}

const genPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('');
};

/**
 * Create / update users for the valid rows. Rows are validated again here
 * (the client only sends back what the preview showed).
 * Returns { created, updated, skipped, credentials: [{ name, username, password }] }.
 */
export function commitImportRows(d, actor, team, rows, nextUserId) {
  const checked = validateImportRows(d, actor, team, rows);
  const passwords = new Map(rows.map((r) => [r.row, r.values.password]));
  const result = { created: 0, updated: 0, skipped: 0, credentials: [] };
  const now = new Date().toISOString();
  for (const r of checked) {
    if (r.status === 'error') {
      result.skipped++;
      continue;
    }
    const given = passwords.get(r.row);
    if (r.status === 'update') {
      const u = d.users.find((x) => x.id === r.userId);
      for (const k of ['name', 'employeeId', 'jobTitle', 'phone', 'email']) if (r[k]) u[k] = r[k];
      u.role = r.role;
      u.inRotation = r.inRotation;
      if (r.daysOff) u.daysOff = r.daysOff;
      if (given) Object.assign(u, (({ salt, hash }) => ({ salt, passwordHash: hash }))(hashPassword(given)));
      result.updated++;
    } else {
      const password = given || genPassword();
      const { salt, hash } = hashPassword(password);
      d.users.push({
        id: nextUserId(),
        name: r.name,
        username: r.username,
        role: r.role,
        teamId: team.id,
        hospitalId: null,
        inRotation: r.inRotation,
        active: true,
        daysOff: r.daysOff || [],
        employeeId: r.employeeId,
        jobTitle: r.jobTitle,
        phone: r.phone,
        email: r.email,
        salt,
        passwordHash: hash,
        createdAt: now,
        importedBy: actor.id,
      });
      result.created++;
      if (!given) result.credentials.push({ name: r.name, username: r.username, password });
    }
  }
  return result;
}
