// Excel export of a month's schedule (exceljs). Two sheets:
//  1. Monthly grid: one row per technician, one column per day, shift codes with colours
//  2. Daily list: one row per day with the names on each shift and the backups
import ExcelJS from 'exceljs';
import { daysOfMonth, weekday } from './dates.js';

const T = {
  ar: {
    grid: 'الجدول الشهري',
    daily: 'التوزيع اليومي',
    title: 'جدول المناوبات',
    technician: 'الموظف',
    total: 'المجموع',
    backupCol: 'احتياط',
    date: 'التاريخ',
    day: 'اليوم',
    backupFor: 'احتياط {name}',
    absent: 'غائب (إجازة/استئذان)',
    legend: 'دليل الرموز',
    keyBackup: 'ط', keyStandby: 'ج', keyAbsent: 'غ', keyOff: '·',
    backup: 'احتياط (في يوم راحته)', standby: 'جاهز للاستدعاء', leave: 'إجازة / استئذان', off: 'يوم راحة',
    countRow: 'عدد {name}',
    draft: 'مسودة — غير منشور',
    exported: 'تاريخ التصدير',
    weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    letters: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
    shift: { morning: 'صباحي', evening: 'مسائي', night: 'ليلي', day: 'نهاري' },
    short: { morning: 'ص', evening: 'م', night: 'ل', day: 'ن' },
    months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  },
  en: {
    grid: 'Monthly roster',
    daily: 'Daily list',
    title: 'Shift schedule',
    technician: 'Staff member',
    total: 'Total',
    backupCol: 'Backup',
    date: 'Date',
    day: 'Day',
    backupFor: 'Backup {name}',
    absent: 'Absent (leave/excuse)',
    legend: 'Legend',
    keyBackup: 'B', keyStandby: 'S', keyAbsent: 'L', keyOff: '·',
    backup: 'Backup (on day off)', standby: 'Standby', leave: 'Leave / excuse', off: 'Day off',
    countRow: '{name} count',
    draft: 'Draft — not published',
    exported: 'Exported',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    letters: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    shift: { morning: 'Morning', evening: 'Evening', night: 'Night', day: 'Day' },
    short: { morning: 'M', evening: 'E', night: 'N', day: 'D' },
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

// Built-in names (either language) follow the export language; custom names are kept.
const DEFAULT_NAMES = { morning: ['Morning', 'صباحي'], evening: ['Evening', 'مسائي'], night: ['Night', 'ليلي'], day: ['Day', 'نهاري'] };
const DEFAULT_SHORT = { morning: ['M', 'ص'], evening: ['E', 'م'], night: ['N', 'ل'], day: ['D', 'ن'] };

const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const thin = { style: 'thin', color: { argb: 'FFD9DEE5' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fmt = (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '');
// Blend a colour with white (for light backgrounds)
function tint(hex, amount = 0.8) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

/**
 * @param d       team view ({ settings, users, schedules }) from org.teamCtx
 * @param labels  { hospital, department, team } names for the title
 */
export async function buildScheduleWorkbook(d, labels, ym, lang = 'ar') {
  const L = T[lang] || T.ar;
  const rtl = lang !== 'en';
  const schedule = d.schedules[ym];
  const days = daysOfMonth(ym);
  const shifts = d.settings.shifts.map((s) => ({
    ...s,
    label: DEFAULT_NAMES[s.id]?.includes(s.name) ? L.shift[s.id] : s.name,
    code: DEFAULT_SHORT[s.id]?.includes(s.short) ? L.short[s.id] : s.short,
  }));
  const heading = [labels.hospital, labels.department, labels.team].filter(Boolean).join(' — ');
  const monthName = `${L.months[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
  const byId = new Map(d.users.map((u) => [u.id, u]));
  const name = (id) => byId.get(id)?.name ?? id;

  // Staff rows: rotation staff + anyone who appears in the schedule
  const ids = new Set(d.users.filter((u) => u.inRotation && u.active !== false).map((u) => u.id));
  for (const day of Object.values(schedule.days)) for (const id of Object.values(day.shifts).flat()) ids.add(id);
  const staff = d.users.filter((u) => ids.has(u.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = labels.hospital || 'Shift Management';
  wb.created = new Date();
  const font = { name: 'Arial', size: 10 };

  // ---------- Sheet 1: monthly grid ----------
  const ws = wb.addWorksheet(L.grid, {
    views: [{ rightToLeft: rtl, state: 'frozen', xSplit: 1, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const firstDayCol = 2;
  const totalsCol = firstDayCol + days.length; // per-shift totals, then total, then backup
  const lastCol = totalsCol + shifts.length + 1;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `${heading} — ${L.title} — ${monthName}`;
  ws.getCell(1, 1).font = { ...font, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, 1).fill = fill('#0B1F2E');
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = `${schedule.published ? '' : L.draft + ' · '}${L.exported}: ${new Date().toISOString().slice(0, 10)} · ${shifts
    .map((s) => `${s.code} = ${s.label} ${s.start}–${s.end}`)
    .join(' · ')}`;
  ws.getCell(2, 1).font = { ...font, italic: true, color: { argb: schedule.published ? 'FF64748B' : 'FFB45309' } };
  ws.getCell(2, 1).alignment = { horizontal: 'center' };

  // header rows 3 (weekday letters) and 4 (day numbers)
  const h3 = ws.getRow(3);
  const h4 = ws.getRow(4);
  ws.mergeCells(3, 1, 4, 1);
  h3.getCell(1).value = L.technician;
  days.forEach((date, i) => {
    const wd = weekday(date);
    h3.getCell(firstDayCol + i).value = L.letters[wd];
    h4.getCell(firstDayCol + i).value = +date.slice(8);
  });
  shifts.forEach((s, i) => {
    ws.mergeCells(3, totalsCol + i, 4, totalsCol + i);
    h3.getCell(totalsCol + i).value = s.label;
    h3.getCell(totalsCol + i).fill = fill(tint(s.color, 0.75));
  });
  ws.mergeCells(3, totalsCol + shifts.length, 4, totalsCol + shifts.length);
  h3.getCell(totalsCol + shifts.length).value = L.total;
  ws.mergeCells(3, lastCol, 4, lastCol);
  h3.getCell(lastCol).value = L.backupCol;
  for (const row of [h3, h4]) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.font = { ...font, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
      if (!cell.fill || cell.fill.type !== 'pattern') cell.fill = fill('#EEF2F6');
    }
  }
  days.forEach((date, i) => {
    if ([5, 6].includes(weekday(date))) for (const row of [h3, h4]) row.getCell(firstDayCol + i).fill = fill('#FCE7F3');
  });

  // staff rows
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  staff.forEach((u, r) => {
    const row = ws.getRow(5 + r);
    row.getCell(1).value = u.name;
    row.getCell(1).font = { ...font, bold: true };
    row.getCell(1).border = border;
    const counts = Object.fromEntries(shifts.map((s) => [s.id, 0]));
    let backups = 0;
    days.forEach((date, i) => {
      const day = schedule.days[date];
      const cell = row.getCell(firstDayCol + i);
      cell.border = border;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { ...font, bold: true };
      const sid = Object.keys(day.shifts).find((k) => day.shifts[k].includes(u.id));
      const bk = Object.keys(day.backup || {}).find((k) => day.backup[k] === u.id);
      if (sid && shiftById.get(sid)) {
        const s = shiftById.get(sid);
        cell.value = s.code;
        cell.fill = fill(s.color);
        cell.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
        counts[sid]++;
      } else if (day.absent?.includes(u.id)) {
        cell.value = L.keyAbsent;
        cell.fill = fill('#FFE4E6');
        cell.font = { ...font, bold: true, color: { argb: 'FFBE123C' } };
      } else if (bk) {
        cell.value = L.keyBackup;
        cell.fill = fill('#CCFBF1');
        cell.font = { ...font, bold: true, color: { argb: 'FF0F766E' } };
        cell.note = fmt(L.backupFor, { name: shiftById.get(bk)?.label ?? bk });
        backups++;
      } else if (day.standby?.includes(u.id)) {
        cell.value = L.keyStandby;
        cell.fill = fill('#F0FDFA');
        cell.font = { ...font, color: { argb: 'FF0F766E' } };
      } else {
        cell.value = L.keyOff;
        cell.fill = fill('#F8FAFC');
        cell.font = { ...font, color: { argb: 'FF94A3B8' } };
      }
    });
    shifts.forEach((s, i) => {
      const c = row.getCell(totalsCol + i);
      c.value = counts[s.id];
      c.fill = fill(tint(s.color, 0.85));
    });
    row.getCell(totalsCol + shifts.length).value = Object.values(counts).reduce((a, b) => a + b, 0);
    row.getCell(totalsCol + shifts.length).font = { ...font, bold: true };
    row.getCell(lastCol).value = backups;
    for (let c = totalsCol; c <= lastCol; c++) {
      row.getCell(c).border = border;
      row.getCell(c).alignment = { horizontal: 'center' };
    }
  });

  // per-shift daily counts
  let rowNo = 5 + staff.length;
  for (const s of shifts) {
    const row = ws.getRow(rowNo++);
    row.getCell(1).value = fmt(L.countRow, { name: s.label });
    row.getCell(1).font = { ...font, bold: true };
    row.getCell(1).fill = fill(tint(s.color, 0.8));
    days.forEach((date, i) => {
      const n = schedule.days[date].shifts[s.id]?.length || 0;
      const cell = row.getCell(firstDayCol + i);
      cell.value = n;
      cell.alignment = { horizontal: 'center' };
      if (n < d.settings.staffPerShift) {
        cell.fill = fill('#DC2626');
        cell.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
      } else cell.fill = fill('#F1F5F9');
    });
    for (let c = 1; c < totalsCol; c++) row.getCell(c).border = border;
  }

  // legend
  rowNo += 1;
  ws.getCell(rowNo, 1).value = L.legend;
  ws.getCell(rowNo, 1).font = { ...font, bold: true };
  const legend = [
    ...shifts.map((s) => [s.code, `${s.label} ${s.start}–${s.end}`, s.color, 'FFFFFFFF']),
    [L.keyBackup, L.backup, '#CCFBF1', 'FF0F766E'],
    [L.keyStandby, L.standby, '#F0FDFA', 'FF0F766E'],
    [L.keyAbsent, L.leave, '#FFE4E6', 'FFBE123C'],
    [L.keyOff, L.off, '#F8FAFC', 'FF94A3B8'],
  ];
  for (const [code, text, bg, fg] of legend) {
    rowNo++;
    const key = ws.getCell(rowNo, 1);
    key.value = code;
    key.fill = fill(bg);
    key.font = { ...font, bold: true, color: { argb: fg } };
    key.alignment = { horizontal: 'center' };
    key.border = border;
    ws.mergeCells(rowNo, 2, rowNo, 10);
    ws.getCell(rowNo, 2).value = text;
    ws.getCell(rowNo, 2).font = font;
  }

  ws.getColumn(1).width = 22;
  for (let c = firstDayCol; c < totalsCol; c++) ws.getColumn(c).width = 4.2;
  for (let c = totalsCol; c <= lastCol; c++) ws.getColumn(c).width = 9;

  // ---------- Sheet 2: daily list ----------
  const ds = wb.addWorksheet(L.daily, {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const cols = [
    { header: L.date, key: 'date', width: 12 },
    { header: L.day, key: 'day', width: 11 },
    ...shifts.map((s) => ({ header: `${s.label} (${s.start}–${s.end})`, key: s.id, width: 34 })),
    ...shifts.map((s) => ({ header: fmt(L.backupFor, { name: s.label }), key: 'bk_' + s.id, width: 18 })),
    { header: L.absent, key: 'absent', width: 26 },
  ];
  ds.columns = cols;
  const header = ds.getRow(1);
  header.height = 30;
  header.eachCell((cell, c) => {
    cell.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
    const s = shifts.find((x) => cols[c - 1].key === x.id);
    cell.fill = fill(s ? s.color : cols[c - 1].key.startsWith('bk_') ? '#0F766E' : '#0B1F2E');
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  for (const date of days) {
    const day = schedule.days[date];
    const row = ds.addRow({
      date,
      day: L.weekdays[weekday(date)],
      ...Object.fromEntries(shifts.map((s) => [s.id, (day.shifts[s.id] || []).map(name).join('\n')])),
      ...Object.fromEntries(shifts.map((s) => ['bk_' + s.id, day.backup?.[s.id] ? name(day.backup[s.id]) : '—'])),
      absent: (day.absent || []).map(name).join('\n'),
    });
    const weekend = [5, 6].includes(weekday(date));
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.font = { ...font, bold: c <= 2 };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: c <= 2 ? 'center' : rtl ? 'right' : 'left' };
      cell.border = border;
      if (weekend) cell.fill = fill('#FDF2F8');
      const s = shifts.find((x) => cols[c - 1].key === x.id);
      if (s && (day.shifts[s.id]?.length || 0) < d.settings.staffPerShift) cell.fill = fill('#FEE2E2');
    });
  }

  return wb;
}
