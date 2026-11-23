<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('schedule.title') }}</h1>
        <p>{{ t('schedule.subtitle', { shifts: base.settings.shifts.length, per: base.settings.staffPerShift }) }}</p>
      </div>
      <div class="row">
        <button v-if="schedule" class="btn btn-excel" :disabled="exporting" @click="exportExcel">
          <span class="xl">X</span> {{ exporting ? t('schedule.exporting') : t('schedule.exportExcel') }}
        </button>
        <MonthPicker v-model="month" />
        <div class="tabs">
          <button :class="{ active: view === 'grid' }" @click="view = 'grid'">{{ t('schedule.grid') }}</button>
          <button :class="{ active: view === 'daily' }" @click="view = 'daily'">{{ t('schedule.daily') }}</button>
          <button v-if="admin && schedule" :class="{ active: view === 'board' }" @click="view = 'board'">✥ {{ t('schedule.board') }}</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-box mb">{{ error }}</div>

    <div v-if="admin" class="card mb admin-bar">
      <template v-if="schedule">
        <span class="badge" :class="schedule.published ? 'badge-approved' : 'badge-pending'">
          {{ schedule.published ? t('schedule.published') : t('schedule.draft') }}
        </span>
        <span class="small muted">{{ t('schedule.generatedAt', { at: fmtDateTime(schedule.generatedAt) }) }}</span>
        <span v-if="warningDays.length" class="badge badge-rejected">{{ t('schedule.understaffed', { n: warningDays.length }) }}</span>
        <button v-if="conflictErrors.length" class="badge badge-rejected linkish" @click="view = 'board'">⛔ {{ t('board.errors', { n: conflictErrors.length }) }}</button>
        <span class="spacer"></span>
        <button class="btn btn-sm" @click="togglePublish">{{ schedule.published ? t('schedule.unpublish') : t('schedule.publish') }}</button>
        <button v-if="view !== 'board'" class="btn btn-sm btn-primary" @click="view = 'board'">✥ {{ t('schedule.editBoard') }}</button>
        <button class="btn btn-sm" @click="generate(true)">↻ {{ t('schedule.regenerate') }}</button>
        <button class="btn btn-sm" @click="printPage">⎙ {{ t('schedule.print') }}</button>
      </template>
      <template v-else>
        <span>{{ t('schedule.noneYet', { month: monthLabel(month) }) }}</span>
        <span class="spacer"></span>
        <button class="btn" :disabled="busy" @click="createEmpty">✥ {{ t('schedule.createEmpty') }}</button>
        <button class="btn btn-primary" :disabled="busy" @click="generate(false)">⚡ {{ t('schedule.generate') }}</button>
      </template>
    </div>

    <div v-if="!schedule && !loading && !admin" class="card empty">
      <p>{{ t('schedule.notPublished', { month: monthLabel(month) }) }}</p>
    </div>

    <!-- GRID VIEW -->
    <div v-if="schedule && view === 'grid'" class="card grid-card">
      <div class="table-wrap">
        <table class="roster">
          <thead>
            <tr>
              <th class="sticky name-col">{{ t('schedule.technician') }}</th>
              <th
                v-for="d in days"
                :key="d"
                class="day-col"
                :class="{ weekend: [5, 6].includes(weekdayOf(d)), today: d === today, warn: dayWarnings(d).length, clickable: admin }"
                @click="admin && openDay(d)"
                :title="admin ? t('schedule.editDay') : weekdays()[weekdayOf(d)]"
              >
                <div>{{ wdLetter()[weekdayOf(d)] }}</div>
                <div class="dn">{{ +d.slice(8) }}</div>
              </th>
              <th>{{ t('schedule.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in staff" :key="u.id" :class="{ me: u.id === auth.user.id }">
              <td class="sticky name-col">{{ u.name }}</td>
              <td v-for="d in days" :key="d" class="c" :class="{ today: d === today, conflict: conflictIndex.byUserDate.has(`${d}|${u.id}`), clickable: admin }" :title="admin ? t('schedule.editDay') : ''" @click="admin && openDay(d)">
                <span v-bind="cellProps(d, u.id)"></span>
              </td>
              <td class="total">{{ totals[u.id] || 0 }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-for="s in base.settings.shifts" :key="s.id">
              <td class="sticky name-col"><i class="dot" :style="{ background: s.color }"></i> {{ shiftName(s) }}</td>
              <td v-for="d in days" :key="d" class="c count" :class="{ low: (schedule.days[d]?.shifts[s.id]?.length || 0) < base.settings.staffPerShift }">
                {{ schedule.days[d]?.shifts[s.id]?.length || 0 }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="legend">
        <span v-for="s in base.settings.shifts" :key="s.id"><b class="key" :style="{ background: s.color }">{{ shiftShort(s) }}</b> {{ shiftName(s) }} <span dir="ltr">{{ s.start }}–{{ s.end }}</span></span>
        <span><b class="key bk">{{ t('key.backup') }}</b> {{ t('legend.backupOnDayOff') }}</span>
        <span><b class="key sb">{{ t('key.standby') }}</b> {{ t('status.standby') }}</span>
        <span><b class="key ab">{{ t('key.absent') }}</b> {{ t('legend.leaveExcuse') }}</span>
        <span><b class="key of">·</b> {{ t('status.dayOff') }}</span>
      </div>
    </div>

    <!-- DAILY VIEW -->
    <div v-if="schedule && view === 'daily'" class="daily">
      <div v-for="d in days" :key="d" class="card day-card" :class="{ today: d === today }">
        <div class="card-head">
          <h3>{{ fmtDate(d) }}</h3>
          <button v-if="admin" class="btn btn-sm" @click="openDay(d)">{{ t('common.edit') }}</button>
        </div>
        <div v-for="s in base.settings.shifts" :key="s.id" class="shift-row">
          <ShiftBadge :shift="s" />
          <div class="names">
            <span v-for="id in schedule.days[d].shifts[s.id]" :key="id" :class="{ meName: id === auth.user.id }">{{ userName(id) }}</span>
            <span v-if="!schedule.days[d].shifts[s.id].length" class="muted">{{ t('schedule.nobody') }}</span>
          </div>
          <div class="bk-name small" :title="t('status.backup')">
            ⟲ {{ schedule.days[d].backup[s.id] ? userName(schedule.days[d].backup[s.id]) : '—' }}
          </div>
        </div>
        <div v-if="schedule.days[d].absent.length" class="small absent-line">
          {{ t('schedule.absent') }}: {{ schedule.days[d].absent.map(userName).join('، ') }}
        </div>
        <div v-for="w in dayWarnings(d)" :key="w" class="small warn-line">⚠ {{ w }}</div>
      </div>
    </div>

    <ScheduleBoard v-if="schedule && view === 'board' && admin" :key="schedule.generatedAt" :schedule="schedule" :month="month" />

    <DayEditor v-if="editing" :date="editing" :day="schedule.days[editing]" @close="editing = null" @saved="onSaved" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import MonthPicker from '../components/MonthPicker.vue';
import ShiftBadge from '../components/ShiftBadge.vue';
import DayEditor from '../components/DayEditor.vue';
import ScheduleBoard from '../components/ScheduleBoard.vue';
import { findConflicts, indexConflicts } from '../conflicts.js';
import { api, download } from '../api.js';
import { auth, base, isAdmin, shiftById, toast, userName } from '../store.js';
import { t, i18n, shiftName, shiftShort } from '../i18n.js';
import { wdLetter, weekdays, currentMonth, daysOfMonth, fmtDate, fmtDateTime, monthLabel, statusOn, todayStr, weekdayOf } from '../utils.js';

const admin = isAdmin();
const month = ref(currentMonth());
const view = ref('grid');
const schedule = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const editing = ref(null);
const today = todayStr();

const days = computed(() => daysOfMonth(month.value));
const staff = computed(() => {
  // rotation staff + anybody that appears in the schedule (e.g. since removed)
  const ids = new Set(base.users.filter((u) => u.inRotation && u.active !== false).map((u) => u.id));
  if (schedule.value) for (const day of Object.values(schedule.value.days)) for (const id of Object.values(day.shifts).flat()) ids.add(id);
  return base.users.filter((u) => ids.has(u.id));
});
const totals = computed(() => {
  const tot = {};
  if (!schedule.value) return tot;
  for (const day of Object.values(schedule.value.days)) for (const id of Object.values(day.shifts).flat()) tot[id] = (tot[id] || 0) + 1;
  return tot;
});

// Understaffing warnings, computed here so they follow the selected language.
function dayWarnings(date) {
  const day = schedule.value?.days?.[date];
  if (!day) return [];
  const need = base.settings.staffPerShift;
  return base.settings.shifts
    .filter((s) => (day.shifts[s.id]?.length || 0) < need)
    .map((s) => t('schedule.shortStaff', { name: shiftName(s), have: day.shifts[s.id]?.length || 0, need }));
}
const warningDays = computed(() => days.value.filter((d) => dayWarnings(d).length));
const conflictList = computed(() => (schedule.value ? findConflicts(schedule.value, base.users, base.settings) : []));
const conflictIndex = computed(() => indexConflicts(conflictList.value.filter((c) => c.type !== 'understaffed')));
const conflictErrors = computed(() => conflictList.value.filter((c) => c.severity === 'error'));

function cellProps(date, uid) {
  const s = statusOn(schedule.value?.days?.[date], uid);
  if (s.kind === 'shift') {
    const sh = shiftById(s.shift);
    return { class: 'key', style: { background: sh.color }, textContent: shiftShort(sh), title: `${shiftName(sh)} ${sh.start}–${sh.end}` };
  }
  if (s.kind === 'backup') return { class: 'key bk', textContent: t('key.backup'), title: t('schedule.backupFor', { name: shiftName(shiftById(s.shift)) }) };
  if (s.kind === 'standby') return { class: 'key sb', textContent: t('key.standby'), title: t('status.standby') };
  if (s.kind === 'absent') return { class: 'key ab', textContent: t('key.absent'), title: t('legend.leaveExcuse') };
  if (s.kind === 'off') return { class: 'key of', textContent: '·', title: t('status.dayOff') };
  return { textContent: '' };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    schedule.value = await api(`/schedule/${month.value}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(month, () => {
  if (view.value === 'board') view.value = 'grid';
  load();
}, { immediate: true });

async function generate(overwrite) {
  if (overwrite && !confirm(t('schedule.confirmRegenerate'))) return;
  busy.value = true;
  try {
    schedule.value = await api(`/schedule/${month.value}/generate`, { method: 'POST', body: { overwrite, publish: schedule.value?.published } });
    toast(t('schedule.generatedToast'));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function createEmpty() {
  busy.value = true;
  try {
    schedule.value = await api(`/schedule/${month.value}/create-empty`, { method: 'POST', body: {} });
    view.value = 'board';
    toast(t('schedule.emptyCreated'));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function togglePublish() {
  if (!schedule.value.published && conflictErrors.value.length && !confirm(t('schedule.confirmPublishConflicts', { n: conflictErrors.value.length }))) return;
  try {
    schedule.value = await api(`/schedule/${month.value}/publish`, { method: 'POST', body: { published: !schedule.value.published } });
    toast(schedule.value.published ? t('schedule.publishedToast') : t('schedule.unpublishedToast'));
  } catch (e) {
    toast(e.message, 'error');
  }
}

const openDay = (d) => (editing.value = d);
function onSaved(day) {
  schedule.value.days[editing.value] = day;
  editing.value = null;
  toast(t('schedule.dayUpdated'));
}
const printPage = () => window.print();

const exporting = ref(false);
async function exportExcel() {
  exporting.value = true;
  try {
    await download(`/schedule/${month.value}/export?lang=${i18n.locale}`, `ecg-schedule-${month.value}.xlsx`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.btn-excel { background: #107c41; border-color: #107c41; color: #fff; }
.btn-excel:hover { background: #0b5e31; }
.xl { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: #fff; color: #107c41; font-weight: 900; font-size: 12px; }
.admin-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; }
.grid-card { padding: 0; overflow: hidden; }
.roster { font-size: 12px; border-collapse: separate; border-spacing: 0; }
.roster th, .roster td { padding: 4px 2px; text-align: center; border-bottom: 1px solid var(--border); }
.roster .name-col { text-align: start; padding: 6px 12px; min-width: 160px; white-space: nowrap; font-weight: 600; }
.sticky { position: sticky; inset-inline-start: 0; background: #fff; z-index: 1; border-inline-end: 1px solid var(--border); }
thead .sticky { background: var(--surface-2); }
.day-col { min-width: 30px; font-size: 11px; line-height: 1.2; }
.day-col .dn { font-size: 13px; color: var(--text); }
.day-col.weekend { background: #fdf2f8; }
.day-col.today, td.today { background: #fff1f2 !important; }
.day-col.warn .dn { color: var(--danger); }
.day-col.clickable { cursor: pointer; }
.day-col.clickable:hover { background: #ecfdf5; }
td.c { cursor: default; }
td.c.clickable { cursor: pointer; }
td.c.conflict { box-shadow: inset 0 0 0 2px #f87171; background: #fef2f2; }
.linkish { border: none; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; }
tr.me td { background: #f0fdf4; }
tr.me .sticky { background: #f0fdf4; }
.total { font-weight: 700; }
tfoot td { background: var(--surface-2); font-weight: 600; }
tfoot .sticky { background: var(--surface-2); }
.count.low { color: #fff; background: var(--danger) !important; }
:deep(.key), .key { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: #fff; font-weight: 800; font-size: 11px; font-style: normal; }
:deep(.key.bk), .key.bk { background: #ccfbf1; color: #0f766e; border: 1px dashed #14b8a6; }
:deep(.key.sb), .key.sb { background: #f0fdfa; color: #0f766e; border: 1px solid #99f6e4; }
:deep(.key.ab), .key.ab { background: #ffe4e6; color: #be123c; }
:deep(.key.of), .key.of { background: transparent; color: #94a3b8; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.legend > span { display: inline-flex; align-items: center; gap: 6px; }

.daily { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
.day-card.today { box-shadow: 0 0 0 2px var(--heart); }
.shift-row { display: grid; grid-template-columns: 80px 1fr auto; gap: 8px; align-items: start; padding: 6px 0; border-top: 1px dashed var(--border); }
.names { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.meName { font-weight: 800; color: var(--primary-dark); }
.bk-name { color: #0f766e; white-space: nowrap; }
.absent-line { color: var(--heart); margin-top: 6px; }
.warn-line { color: var(--danger); font-weight: 600; }

@media print {
  :global(.sidebar), :global(.topbar), .admin-bar, .tabs { display: none !important; }
  :global(.shell) { display: block !important; }
}
</style>
