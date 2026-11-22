import { hashPassword } from './auth.js';
import { balanceDaysOff } from './scheduler.js';

const TEAM = [
  'أحمد علي', 'سارة حسن', 'عمر خالد', 'فاطمة سعيد', 'يوسف ناصر',
  'نورة فهد', 'خالد إبراهيم', 'ريم عبدالله', 'فيصل صالح', 'هدى منصور',
  'ماجد طلال', 'لمى حمد', 'تركي سلطان',
];

export const DEFAULT_SETTINGS = {
  departmentName: 'قسم تخطيط القلب',
  staffPerShift: 3,
  assignExtraStaff: true,
  shifts: [
    { id: 'morning', name: 'صباحي', short: 'ص', start: '07:00', end: '15:00', color: '#f59e0b' },
    { id: 'evening', name: 'مسائي', short: 'م', start: '15:00', end: '23:00', color: '#3b82f6' },
    { id: 'night', name: 'ليلي', short: 'ل', start: '23:00', end: '07:00', color: '#8b5cf6' },
  ],
};

function makeUser(id, name, username, password, role, extra = {}) {
  const { salt, hash } = hashPassword(password);
  return {
    id,
    name,
    username,
    role,
    inRotation: role !== 'admin',
    active: true,
    phone: '',
    email: '',
    daysOff: [],
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function buildSeedData() {
  // In production set ADMIN_PASSWORD (initial admin password) and SEED_DEMO_DATA=false
  // so no well-known demo accounts exist on a public server.
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const withDemoTeam = process.env.SEED_DEMO_DATA !== 'false';
  const users = [makeUser('u1', 'مدير القسم', 'admin', adminPassword, 'admin')];
  if (withDemoTeam) {
    TEAM.forEach((name, i) => {
      users.push(makeUser(`u${i + 2}`, name, `tech${i + 1}`, 'tech123', 'technician'));
    });
  }
  balanceDaysOff(users.filter((u) => u.inRotation));
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    users,
    requests: [],
    schedules: {},
    counters: { user: users.length, request: 0 },
  };
}
