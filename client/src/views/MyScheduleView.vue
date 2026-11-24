<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('my.title') }}</h1>
        <p>{{ t('my.subtitle') }}</p>
      </div>
      <MonthPicker v-model="month" />
    </div>

    <div v-if="error" class="error-box mb">{{ error }}</div>

    <div class="grid grid-4 mb">
      <div v-for="s in myShifts" :key="s.id" class="card stat">
        <span class="label">{{ t('my.shiftsOf', { name: shiftName(s) }) }}</span>
        <span class="value" :style="{ color: s.color }">{{ counts[s.id] || 0 }}</span>
        <span class="small muted" dir="ltr">{{ s.start }} – {{ s.end }}</span>
      </div>
      <div class="card stat">
        <span class="label">{{ t('my.backupDuty') }}</span>
        <span class="value" style="color: #0d9488">{{ counts.backup || 0 }}</span>
        <span class="small muted">{{ t('my.mayBeCalled') }}</span>
      </div>
    </div>

    <div v-if="!schedule && !loading" class="card empty">
      <EcgLine :height="40" :beats="3" color="#cbd5e1" :animated="false" />
      <p>{{ t('schedule.notPublished', { month: monthLabel(month) }) }}</p>
    </div>

    <div v-else class="card">
      <div class="calendar">
        <div v-for="w in wdShort()" :key="w" class="wd">{{ w }}</div>
        <div v-for="n in lead" :key="'b' + n" class="cell blank"></div>
        <div
          v-for="date in days"
          :key="date"
          class="cell"
          :class="[status(date).kind, { today: date === today }]"
          :style="cellStyle(date)"
        >
          <div class="num">{{ +date.slice(8) }}</div>
          <template v-if="status(date).kind === 'shift'">
            <div class="what" :style="{ color: myShift(status(date).shift).color }">{{ shiftName(myShift(status(date).shift)) }}</div>
            <div class="small muted" dir="ltr">{{ myShift(status(date).shift).start }}–{{ myShift(status(date).shift).end }}</div>
          </template>
          <div v-else-if="status(date).kind === 'backup'" class="what backup">
            {{ t('status.backup') }}<br /><span class="small">{{ shiftName(myShift(status(date).shift)) }}</span>
          </div>
          <div v-else-if="status(date).kind === 'off'" class="what off">{{ t('status.dayOff') }}</div>
          <div v-else-if="status(date).kind === 'standby'" class="what backup">{{ t('status.standby') }}</div>
          <div v-else-if="status(date).kind === 'absent'" class="what absent">{{ absentLabel(date) }}</div>
          <button
            v-if="status(date).kind === 'shift' && date >= today && !hasRequest(date)"
            class="req-btn"
            :title="t('my.requestExcuseTitle')"
            @click="$router.push({ path: '/requests', query: { type: 'excuse', date } })"
          >{{ t('my.plusExcuse') }}</button>
          <span v-if="hasRequest(date) === 'pending'" class="badge badge-pending small pend">{{ t('status.pending') }}</span>
        </div>
      </div>

      <div class="legend">
        <span v-for="s in myShifts" :key="s.id"><i class="dot" :style="{ background: s.color }"></i> {{ shiftName(s) }}</span>
        <span><i class="dot" style="background: #14b8a6"></i> {{ t('legend.backupStandby') }}</span>
        <span><i class="dot" style="background: #94a3b8"></i> {{ t('status.dayOff') }}</span>
        <span><i class="dot" style="background: #e11d48"></i> {{ t('legend.leaveExcuse') }}</span>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head">
        <h2>{{ t('my.weeklyDaysOff') }}</h2>
      </div>
      <div class="chips">
        <span v-for="(w, i) in weekdays()" :key="w" class="chip" :class="{ on: me?.daysOff?.includes(i) }">{{ w }}</span>
      </div>
      <p class="small muted">{{ t('my.daysOffNote') }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import MonthPicker from '../components/MonthPicker.vue';
import EcgLine from '../components/EcgLine.vue';
import { api } from '../api.js';
import { auth, base, shiftById } from '../store.js';
import { t, shiftName } from '../i18n.js';
import { wdShort, weekdays, currentMonth, daysOfMonth, monthLabel, statusOn, todayStr, weekdayOf } from '../utils.js';

const month = ref(currentMonth());
const schedule = ref(null);
const requests = ref([]);
const loading = ref(false);
const error = ref('');
const today = todayStr();

// Always the user's own team (an admin may be looking at another team elsewhere)
const myTeamId = auth.user.teamId;
const myTeam = ref(base.teamId === myTeamId ? base.team : null);
const myShifts = computed(() => myTeam.value?.settings.shifts || []);
const myShift = (id) => myShifts.value.find((s) => s.id === id) || { name: id, color: '#64748b' };
const me = ref(base.users.find((u) => u.id === auth.user.id) || null);
const days = computed(() => daysOfMonth(month.value));
const lead = computed(() => weekdayOf(days.value[0]));
const status = (date) => statusOn(schedule.value?.days?.[date], auth.user.id);

const counts = computed(() => {
  const c = {};
  for (const d of days.value) {
    const s = status(d);
    if (s.kind === 'shift') c[s.shift] = (c[s.shift] || 0) + 1;
    if (s.kind === 'backup') c.backup = (c.backup || 0) + 1;
  }
  return c;
});

function requestOn(date) {
  return requests.value.find(
    (r) => ['pending', 'approved'].includes(r.status) &&
      (r.type === 'excuse' ? r.date === date : r.startDate <= date && date <= r.endDate)
  );
}
const hasRequest = (date) => requestOn(date)?.status;
const absentLabel = (date) => (requestOn(date)?.type === 'excuse' ? t('status.excused') : t('status.onLeave'));

function cellStyle(date) {
  const s = status(date);
  if (s.kind === 'shift') {
    const c = myShift(s.shift).color;
    return { background: c + '14', borderColor: c + '66' };
  }
  return {};
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (!myTeam.value) myTeam.value = await api(`/teams/${myTeamId}`);
    if (!me.value) me.value = (await api(`/users?teamId=${myTeamId}`)).find((u) => u.id === auth.user.id);
    [schedule.value, requests.value] = await Promise.all([api(`/teams/${myTeamId}/schedule/${month.value}`), api('/requests?mine=1')]);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(month, load, { immediate: true });
</script>

<style scoped>
.calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.wd { text-align: center; font-size: 12px; font-weight: 700; color: var(--muted); padding: 4px 0; }
.cell { min-height: 96px; border: 1px solid var(--border); border-radius: 10px; padding: 8px; position: relative; background: #fff; display: flex; flex-direction: column; gap: 2px; }
.cell.blank { border: none; background: transparent; }
.cell.today { box-shadow: 0 0 0 2px var(--heart); }
.cell.off { background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px); }
.cell.backup, .cell.standby { background: #f0fdfa; border-color: #99f6e4; }
.cell.absent { background: #fff1f2; border-color: #fecdd3; }
.num { font-weight: 700; font-size: 13px; }
.what { font-weight: 700; font-size: 13px; }
.what.off { color: var(--muted); font-weight: 600; }
.what.backup { color: #0f766e; }
.what.absent { color: var(--heart); }
.req-btn { position: absolute; bottom: 6px; inset-inline-end: 6px; font: inherit; font-size: 11px; border: 1px dashed var(--border); background: #fff; border-radius: 6px; padding: 1px 6px; cursor: pointer; color: var(--muted); opacity: 0; transition: opacity 0.15s; }
.cell:hover .req-btn { opacity: 1; }
.pend { position: absolute; bottom: 6px; inset-inline-end: 6px; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; color: var(--muted); font-size: 12px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 720px) {
  .cell { min-height: 70px; padding: 5px; }
  .what { font-size: 11px; }
  .cell .small { display: none; }
  .req-btn { opacity: 1; font-size: 10px; }
}
</style>
