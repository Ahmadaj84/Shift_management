import { hashPassword } from './auth.js';
import { balanceDaysOff } from './scheduler.js';

const TEAM = [
  'Ahmed Ali', 'Sara Hassan', 'Omar Khalid', 'Fatimah Saeed', 'Yousef Nasser',
  'Noura Fahad', 'Khalid Ibrahim', 'Reem Abdullah', 'Faisal Saleh', 'Huda Mansour',
  'Majed Talal', 'Lama Hamad', 'Turki Sultan',
];

export const DEFAULT_SETTINGS = {
  departmentName: 'ECG Department',
  staffPerShift: 3,
  assignExtraStaff: true,
  shifts: [
    { id: 'morning', name: 'Morning', short: 'M', start: '07:00', end: '15:00', color: '#f59e0b' },
    { id: 'evening', name: 'Evening', short: 'E', start: '15:00', end: '23:00', color: '#3b82f6' },
    { id: 'night', name: 'Night', short: 'N', start: '23:00', end: '07:00', color: '#8b5cf6' },
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
  const users = [makeUser('u1', 'Department Admin', 'admin', 'admin123', 'admin')];
  TEAM.forEach((name, i) => {
    users.push(makeUser(`u${i + 2}`, name, `tech${i + 1}`, 'tech123', 'technician'));
  });
  balanceDaysOff(users.filter((u) => u.inRotation));
  return {
    settings: structuredClone(DEFAULT_SETTINGS),
    users,
    requests: [],
    schedules: {},
    counters: { user: users.length, request: 0 },
  };
}
