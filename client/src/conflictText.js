import { t, shiftName } from './i18n.js';
import { shiftById, userName } from './store.js';
import { fmtShortDate } from './utils.js';

/** Human-readable text for a conflict, in the current language. */
export function conflictText(c) {
  const p = c.params || {};
  return t(`conflict.${c.type}${p.backup ? 'Backup' : ''}`, {
    name: c.userId ? userName(c.userId) : '',
    shift: c.shift ? shiftName(shiftById(c.shift)) : '',
    other: p.other ? shiftName(shiftById(p.other)) : '',
    have: p.have,
    need: p.need,
    n: p.n,
    end: p.end ? fmtShortDate(p.end) : '',
  });
}
