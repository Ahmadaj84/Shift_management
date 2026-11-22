// Lightweight i18n: Arabic (default, RTL) and English.
import { reactive } from 'vue';
import ar from './locales/ar.js';
import en from './locales/en.js';

const dicts = { ar, en };
const saved = (() => {
  try {
    return localStorage.getItem('ecg-locale');
  } catch {
    return null;
  }
})();

export const i18n = reactive({ locale: dicts[saved] ? saved : 'ar' });

function apply() {
  document.documentElement.lang = i18n.locale;
  document.documentElement.dir = i18n.locale === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app.title');
}

export function setLocale(l) {
  i18n.locale = l;
  try {
    localStorage.setItem('ecg-locale', l);
  } catch { /* ignore */ }
  apply();
}

export const isRtl = () => i18n.locale === 'ar';

export function t(key, params = {}) {
  const s = dicts[i18n.locale][key] ?? dicts.en[key] ?? key;
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

/** Gregorian calendar, Western digits, in the current language. */
export const dateLocale = () => (i18n.locale === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB');

// Built-in names (either language) are translated; custom names set by the admin are shown as-is.
const DEFAULT_SHIFT = {
  morning: ['Morning', 'صباحي', 'M', 'ص'],
  evening: ['Evening', 'مسائي', 'E', 'م'],
  night: ['Night', 'ليلي', 'N', 'ل'],
};
export const shiftName = (s) => (s && DEFAULT_SHIFT[s.id]?.slice(0, 2).includes(s.name) ? t(`shift.${s.id}`) : s?.name ?? '');
export const shiftShort = (s) => (s && DEFAULT_SHIFT[s.id]?.slice(2).includes(s.short) ? t(`shiftShort.${s.id}`) : s?.short ?? '');
export const deptName = (n) => (!n || ['ECG Department', 'قسم تخطيط القلب'].includes(n) ? t('app.department') : n);

// Server error messages are in English; translate them for display.
const ERROR_PATTERNS = [
  [/^Unknown staff id (.+)$/, 'err.unknownStaffId'],
  [/^Leave cannot exceed (\d+) days$/, 'err.leaveTooLong'],
  [/^Request is already (\w+)$/, 'err.requestAlready'],
  [/^Request failed \((\d+)\)$/, 'err.requestFailed'],
];
export function translateError(msg) {
  if (!msg) return t('err.generic');
  const direct = dicts[i18n.locale].errors?.[msg];
  if (direct) return direct;
  for (const [re, key] of ERROR_PATTERNS) {
    const m = msg.match(re);
    if (m) {
      const v = m[1];
      return t(key, { v: key === 'err.requestAlready' ? t(`status.${v}`) : v });
    }
  }
  return msg;
}

apply();
