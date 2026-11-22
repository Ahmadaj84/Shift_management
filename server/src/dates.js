// All dates are plain 'YYYY-MM-DD' strings handled in UTC to avoid TZ drift.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isMonth = (s) => typeof s === 'string' && MONTH_RE.test(s) && +s.slice(5) >= 1 && +s.slice(5) <= 12;

export const toDate = (s) => new Date(s + 'T00:00:00Z');
export const fmt = (d) => d.toISOString().slice(0, 10);
export const weekday = (s) => toDate(s).getUTCDay(); // 0 = Sunday
export const monthOf = (s) => s.slice(0, 7);

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function daysOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

export function dateRange(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export const today = () => fmt(new Date());
