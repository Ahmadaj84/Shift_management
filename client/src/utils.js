export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const currentMonth = () => todayStr().slice(0, 7);

export function shiftMonth(ym, delta) {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
export const monthLabel = (ym) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
export const weekdayOf = (ds) => new Date(ds + 'T00:00:00Z').getUTCDay();

export function daysOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
}

export function fmtDate(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00Z');
  return `${WD_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
}

/** Status of a user on a schedule day: { kind, shift? } */
export function statusOn(day, userId) {
  if (!day) return { kind: 'none' };
  for (const [sid, ids] of Object.entries(day.shifts)) if (ids.includes(userId)) return { kind: 'shift', shift: sid };
  if (day.absent?.includes(userId)) return { kind: 'absent' };
  const b = Object.entries(day.backup || {}).find(([, id]) => id === userId);
  if (b) return { kind: 'backup', shift: b[0] };
  if (day.standby?.includes(userId)) return { kind: 'standby' };
  if (day.off?.includes(userId)) return { kind: 'off' };
  return { kind: 'none' };
}
