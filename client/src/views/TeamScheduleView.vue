<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Team Schedule</h1>
        <p>
          {{ base.settings.shifts.length }} shifts a day ·
          {{ base.settings.staffPerShift }} technicians per shift · backup roster from staff on their day off
        </p>
      </div>
      <div class="row">
        <MonthPicker v-model="month" />
        <div class="tabs">
          <button :class="{ active: view === 'grid' }" @click="view = 'grid'">Grid</button>
          <button :class="{ active: view === 'daily' }" @click="view = 'daily'">Daily</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-box mb">{{ error }}</div>

    <div v-if="admin" class="card mb admin-bar">
      <template v-if="schedule">
        <span class="badge" :class="schedule.published ? 'badge-approved' : 'badge-pending'">
          {{ schedule.published ? 'Published — visible to team' : 'Draft — hidden from team' }}
        </span>
        <span class="small muted">Generated {{ new Date(schedule.generatedAt).toLocaleString() }}</span>
        <span v-if="warningDays.length" class="badge badge-rejected">{{ warningDays.length }} understaffed day(s)</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" @click="togglePublish">{{ schedule.published ? 'Unpublish' : 'Publish' }}</button>
        <button class="btn btn-sm" @click="generate(true)">↻ Regenerate</button>
        <button class="btn btn-sm" @click="printPage">⎙ Print</button>
      </template>
      <template v-else>
        <span>No schedule for <strong>{{ monthLabel(month) }}</strong> yet.</span>
        <span class="spacer"></span>
        <button class="btn btn-primary" :disabled="busy" @click="generate(false)">⚡ Generate schedule</button>
      </template>
    </div>

    <div v-if="!schedule && !loading && !admin" class="card empty">
      <p>The schedule for {{ monthLabel(month) }} hasn't been published yet.</p>
    </div>

    <!-- GRID VIEW -->
    <div v-if="schedule && view === 'grid'" class="card grid-card">
      <div class="table-wrap">
        <table class="roster">
          <thead>
            <tr>
              <th class="sticky name-col">Technician</th>
              <th
                v-for="d in days"
                :key="d"
                class="day-col"
                :class="{ weekend: [5, 6].includes(weekdayOf(d)), today: d === today, warn: schedule.days[d]?.warnings?.length, clickable: admin }"
                @click="admin && openDay(d)"
                :title="admin ? 'Edit this day' : ''"
              >
                <div>{{ WD_SHORT[weekdayOf(d)].slice(0, 2) }}</div>
                <div class="dn">{{ +d.slice(8) }}</div>
              </th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in staff" :key="u.id" :class="{ me: u.id === auth.user.id }">
              <td class="sticky name-col">{{ u.name }}</td>
              <td v-for="d in days" :key="d" class="c" :class="{ today: d === today }" @click="admin && openDay(d)">
                <span v-bind="cellProps(d, u.id)"></span>
              </td>
              <td class="total">{{ totals[u.id] || 0 }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-for="s in base.settings.shifts" :key="s.id">
              <td class="sticky name-col"><i class="dot" :style="{ background: s.color }"></i> {{ s.name }}</td>
              <td v-for="d in days" :key="d" class="c count" :class="{ low: (schedule.days[d]?.shifts[s.id]?.length || 0) < base.settings.staffPerShift }">
                {{ schedule.days[d]?.shifts[s.id]?.length || 0 }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="legend">
        <span v-for="s in base.settings.shifts" :key="s.id"><b class="key" :style="{ background: s.color }">{{ s.short }}</b> {{ s.name }} {{ s.start }}–{{ s.end }}</span>
        <span><b class="key bk">B</b> Backup (on day off)</span>
        <span><b class="key sb">S</b> Standby</span>
        <span><b class="key ab">L</b> Leave / excuse</span>
        <span><b class="key of">·</b> Day off</span>
      </div>
    </div>

    <!-- DAILY VIEW -->
    <div v-if="schedule && view === 'daily'" class="daily">
      <div v-for="d in days" :key="d" class="card day-card" :class="{ today: d === today }">
        <div class="card-head">
          <h3>{{ fmtDate(d) }}</h3>
          <button v-if="admin" class="btn btn-sm" @click="openDay(d)">Edit</button>
        </div>
        <div v-for="s in base.settings.shifts" :key="s.id" class="shift-row">
          <ShiftBadge :shift="s" />
          <div class="names">
            <span v-for="id in schedule.days[d].shifts[s.id]" :key="id" :class="{ meName: id === auth.user.id }">{{ userName(id) }}</span>
            <span v-if="!schedule.days[d].shifts[s.id].length" class="muted">— nobody —</span>
          </div>
          <div class="bk-name small" title="Backup">
            ⟲ {{ schedule.days[d].backup[s.id] ? userName(schedule.days[d].backup[s.id]) : '—' }}
          </div>
        </div>
        <div v-if="schedule.days[d].absent.length" class="small absent-line">
          Absent: {{ schedule.days[d].absent.map(userName).join(', ') }}
        </div>
        <div v-for="w in schedule.days[d].warnings" :key="w" class="small warn-line">⚠ {{ w }}</div>
      </div>
    </div>

    <DayEditor v-if="editing" :date="editing" :day="schedule.days[editing]" @close="editing = null" @saved="onSaved" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import MonthPicker from '../components/MonthPicker.vue';
import ShiftBadge from '../components/ShiftBadge.vue';
import DayEditor from '../components/DayEditor.vue';
import { api } from '../api.js';
import { auth, base, isAdmin, shiftById, toast, userName } from '../store.js';
import { WD_SHORT, currentMonth, daysOfMonth, fmtDate, monthLabel, statusOn, todayStr, weekdayOf } from '../utils.js';

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
  const t = {};
  if (!schedule.value) return t;
  for (const day of Object.values(schedule.value.days)) for (const id of Object.values(day.shifts).flat()) t[id] = (t[id] || 0) + 1;
  return t;
});
const warningDays = computed(() => (schedule.value ? Object.keys(schedule.value.days).filter((d) => schedule.value.days[d].warnings?.length) : []));

function cellProps(date, uid) {
  const s = statusOn(schedule.value?.days?.[date], uid);
  if (s.kind === 'shift') {
    const sh = shiftById(s.shift);
    return { class: 'key', style: { background: sh.color }, textContent: sh.short, title: `${sh.name} ${sh.start}–${sh.end}` };
  }
  if (s.kind === 'backup') return { class: 'key bk', textContent: 'B', title: `Backup for ${shiftById(s.shift).name}` };
  if (s.kind === 'standby') return { class: 'key sb', textContent: 'S', title: 'Standby' };
  if (s.kind === 'absent') return { class: 'key ab', textContent: 'L', title: 'Leave / excuse' };
  if (s.kind === 'off') return { class: 'key of', textContent: '·', title: 'Day off' };
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
watch(month, load, { immediate: true });

async function generate(overwrite) {
  if (overwrite && !confirm('Regenerate this month? All manual edits and applied replacements for this month will be rebuilt from scratch (approved leaves are respected).')) return;
  busy.value = true;
  try {
    schedule.value = await api(`/schedule/${month.value}/generate`, { method: 'POST', body: { overwrite, publish: schedule.value?.published } });
    toast('Schedule generated');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function togglePublish() {
  try {
    schedule.value = await api(`/schedule/${month.value}/publish`, { method: 'POST', body: { published: !schedule.value.published } });
    toast(schedule.value.published ? 'Schedule published to the team' : 'Schedule unpublished');
  } catch (e) {
    toast(e.message, 'error');
  }
}

const openDay = (d) => (editing.value = d);
function onSaved(day) {
  schedule.value.days[editing.value] = day;
  editing.value = null;
  toast('Day updated');
}
const printPage = () => window.print();
</script>

<style scoped>
.admin-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; }
.grid-card { padding: 0; overflow: hidden; }
.roster { font-size: 12px; border-collapse: separate; border-spacing: 0; }
.roster th, .roster td { padding: 4px 2px; text-align: center; border-bottom: 1px solid var(--border); }
.roster .name-col { text-align: left; padding: 6px 12px; min-width: 160px; white-space: nowrap; font-weight: 600; }
.sticky { position: sticky; left: 0; background: #fff; z-index: 1; border-right: 1px solid var(--border); }
thead .sticky { background: var(--surface-2); }
.day-col { min-width: 30px; font-size: 10px; line-height: 1.2; }
.day-col .dn { font-size: 13px; color: var(--text); }
.day-col.weekend { background: #fdf2f8; }
.day-col.today, td.today { background: #fff1f2 !important; }
.day-col.warn .dn { color: var(--danger); }
.day-col.clickable { cursor: pointer; }
.day-col.clickable:hover { background: #ecfdf5; }
td.c { cursor: default; }
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
.legend span { display: inline-flex; align-items: center; gap: 6px; }

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
