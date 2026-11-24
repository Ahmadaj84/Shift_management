import { hashPassword } from './auth.js';
import { balanceDaysOff } from './scheduler.js';
import { templateSettings } from './org.js';

const ECG_TEAM = [
  'أحمد علي', 'سارة حسن', 'عمر خالد', 'فاطمة سعيد', 'يوسف ناصر',
  'نورة فهد', 'خالد إبراهيم', 'ريم عبدالله', 'فيصل صالح', 'هدى منصور',
  'ماجد طلال', 'لمى حمد', 'تركي سلطان',
];
const NURSES = ['منى عادل', 'عبدالرحمن سعد', 'أمل ياسر', 'بدر فهد', 'جود خالد', 'حسن علي', 'دانة ماجد', 'رائد سامي', 'شهد عمر', 'طلال ناصر'];
const ER_NURSES = ['سلمان راشد', 'هيا محمد', 'وليد صقر', 'غادة سالم', 'زياد فواز', 'لين أحمد', 'معاذ هاني', 'رنا بندر', 'نواف عيسى'];

function makeUser(id, name, username, password, role, extra = {}) {
  const { salt, hash } = hashPassword(password);
  return {
    id, name, username, role,
    inRotation: role === 'staff' || role === 'leader',
    active: true, phone: '', email: '', daysOff: [],
    teamId: null, hospitalId: null,
    salt, passwordHash: hash,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function buildSeedData() {
  // In production set ADMIN_PASSWORD (initial admin password) and SEED_DEMO_DATA=false
  // so no well-known demo accounts exist on a public server.
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const withDemo = process.env.SEED_DEMO_DATA !== 'false';
  const now = new Date().toISOString();
  const data = {
    version: 2,
    hospitals: [],
    departments: [],
    teams: [],
    users: [makeUser('u1', 'مدير النظام', 'admin', adminPassword, 'super_admin')],
    requests: [],
    schedules: {},
    counters: { user: 1, request: 0, hospital: 0, department: 0, team: 0 },
  };
  if (!withDemo) return data;

  const c = data.counters;
  const hospital = (name) => (data.hospitals.push({ id: `h${++c.hospital}`, name, createdAt: now }), `h${c.hospital}`);
  const dept = (hospitalId, name) => (data.departments.push({ id: `dp${++c.department}`, hospitalId, name, createdAt: now }), `dp${c.department}`);
  const team = (departmentId, name, template, staffPerShift) => {
    const settings = templateSettings(template);
    if (staffPerShift) settings.staffPerShift = staffPerShift;
    data.teams.push({ id: `t${++c.team}`, departmentId, name, settings, createdAt: now });
    return `t${c.team}`;
  };
  const addMembers = (teamId, names, prefix, password) => {
    const members = names.map((name, i) =>
      makeUser(`u${++c.user}`, name, `${prefix}${i + 1}`, password, i === 0 ? 'leader' : 'staff', { teamId })
    );
    balanceDaysOff(members);
    data.users.push(...members);
  };

  const h1 = hospital('مستشفى الملك فهد');
  const ecg = team(dept(h1, 'قسم تخطيط القلب'), 'فريق تخطيط القلب', 'three8', 3);
  const ward = team(dept(h1, 'التمريض'), 'تمريض الباطنية', 'two12', 3);
  const h2 = hospital('مستشفى الشمال');
  const er = team(dept(h2, 'الطوارئ'), 'تمريض الطوارئ', 'two12', 3);

  addMembers(ecg, ECG_TEAM, 'tech', 'tech123');
  addMembers(ward, NURSES, 'nurse', 'nurse123');
  addMembers(er, ER_NURSES, 'er', 'er123');
  data.users.push(makeUser(`u${++c.user}`, 'مدير مستشفى الملك فهد', 'hadmin', 'hadmin123', 'hospital_admin', { hospitalId: h1, inRotation: false }));
  return data;
}
