import { t, dateLocale } from './i18n.js';

// Functions (not constants) so they follow the selected language.
export const weekdays = () => t('weekdays');
export const wdShort = () => t('weekdaysShort');
export const wdLetter = () => t('weekdaysLetter');

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
export const monthLabel = (ym) =>
  new Intl.DateTimeFormat(dateLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(ym + '-01T00:00:00Z'));
export const weekdayOf = (ds) => new Date(ds + 'T00:00:00Z').getUTCDay();

export function daysOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
}

export function fmtDate(ds, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!ds) return '';
  return new Intl.DateTimeFormat(dateLocale(), { ...opts, timeZone: 'UTC' }).format(new Date(ds + 'T00:00:00Z'));
}
export const fmtShortDate = (ds) => fmtDate(ds, { day: 'numeric', month: 'short' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' });

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
