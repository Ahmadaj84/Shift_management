<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('nav.dashboard') }}</h1>
        <p>{{ fmtDate(today) }} · {{ base.team.name }} · {{ base.team.hospital }} — {{ base.team.department }}</p>
      </div>
      <RouterLink to="/schedule" class="btn">{{ t('dash.openSchedule') }}</RouterLink>
    </div>

    <div class="grid grid-4 mb">
      <div class="card stat">
        <span class="label">{{ t('dash.inRotation') }}</span>
        <span class="value">{{ rotation.length }}</span>
        <EcgLine class="trace" :height="30" :beats="2" color="#0e9f6e" />
      </div>
      <div class="card stat">
        <span class="label">{{ t('dash.pendingRequests') }}</span>
        <span class="value" :style="{ color: pending.length ? 'var(--heart)' : '' }">{{ pending.length }}</span>
        <RouterLink to="/requests" class="small muted">{{ t('dash.review') }}</RouterLink>
      </div>
      <div class="card stat">
        <span class="label">{{ t('dash.absentToday') }}</span>
        <span class="value">{{ todayDay?.absent.length ?? 0 }}</span>
      </div>
      <div class="card stat">
        <span class="label">{{ monthLabel(month) }}</span>
        <span class="value small-value">{{ schedule ? (schedule.published ? t('dash.published') : t('dash.draft')) : t('dash.notGenerated') }}</span>
        <span v-if="warnings.length" class="small" style="color: var(--danger)">{{ t('schedule.understaffed', { n: warnings.length }) }}</span>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head">
          <h2>{{ t('dash.onDuty') }}</h2>
          <div class="tabs">
            <button :class="{ active: dayOffset === 0 }" @click="dayOffset = 0">{{ t('month.today') }}</button>
            <button :class="{ active: dayOffset === 1 }" @click="dayOffset = 1">{{ t('dash.tomorrow') }}</button>
          </div>
        </div>
        <div v-if="!focusDay" class="empty">
          {{ t('dash.noSchedule') }}
          <div class="mt"><RouterLink to="/schedule" class="btn btn-primary">{{ t('schedule.generate') }}</RouterLink></div>
        </div>
        <template v-else>
          <div v-for="s in base.settings.shifts" :key="s.id" class="duty">
            <div class="duty-head">
              <ShiftBadge :shift="s" />
              <span class="small muted" dir="ltr">{{ s.start }}–{{ s.end }}</span>
              <span class="spacer"></span>
              <span class="small bk">{{ t('status.backup') }}: <strong>{{ focusDay.backup[s.id] ? userName(focusDay.backup[s.id]) : '—' }}</strong></span>
            </div>
            <div class="people">
              <span v-for="id in focusDay.shifts[s.id]" :key="id" class="person">{{ userName(id) }}</span>
              <span v-if="focusDay.shifts[s.id].length < base.settings.staffPerShift" class="badge badge-rejected">
                {{ t('dash.missing', { n: base.settings.staffPerShift - focusDay.shifts[s.id].length }) }}
              </span>
            </div>
          </div>
          <div v-if="focusDay.absent.length" class="small mt" style="color: var(--heart)">
            {{ t('dash.onLeave') }}: {{ focusDay.absent.map(userName).join('، ') }}
          </div>
          <div v-if="focusDay.off.length" class="small muted">{{ t('status.dayOff') }}: {{ focusDay.off.map(userName).join('، ') }}</div>
        </template>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>{{ t('dash.pendingRequests') }}</h2>
          <RouterLink to="/requests" class="small muted">{{ t('dash.viewAll') }}</RouterLink>
        </div>
        <div v-if="!pending.length" class="empty">{{ t('dash.noPending') }}</div>
        <div v-for="r in pending.slice(0, 6)" :key="r.id" class="req">
          <div>
            <strong>{{ userName(r.userId) }}</strong>
            <div class="small muted">
              {{ r.type === 'excuse' ? `${t('req.excuse')} · ${fmtDate(r.date)}` : `${t('req.leave')} · ${fmtDate(r.startDate)} ${t('arrow')} ${fmtDate(r.endDate)}` }}
            </div>
          </div>
          <span class="badge badge-pending">{{ t('status.pending') }}</span>
        </div>
      </div>
    </div>

    <div v-if="isOrgAdmin() && overview.length > 1" class="card mt">
      <div class="card-head">
        <h2>{{ t('dash.allTeams') }}</h2>
        <span class="small muted">{{ monthLabel(month) }}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('org.hospital') }}</th>
              <th>{{ t('org.department') }}</th>
              <th>{{ t('org.team') }}</th>
              <th>{{ t('org.leaders') }}</th>
              <th>{{ t('org.members') }}</th>
              <th>{{ t('dash.scheduleStatus') }}</th>
              <th>{{ t('dash.pendingRequests') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in overview" :key="row.teamId" :class="{ current: row.teamId === base.teamId }">
              <td>{{ row.hospital }}</td>
              <td>{{ row.department }}</td>
              <td><strong>{{ row.name }}</strong></td>
              <td class="small">{{ row.leaders.map((l) => l.name).join('، ') || '—' }}</td>
              <td>{{ row.members }}</td>
              <td>
                <span class="badge" :class="{ published: 'badge-approved', draft: 'badge-pending', none: 'badge-cancelled' }[row.schedule]">{{ t(`dash.sched.${row.schedule}`) }}</span>
              </td>
              <td><span v-if="row.pending" class="badge badge-rejected">{{ row.pending }}</span><span v-else class="muted">0</span></td>
              <td><button v-if="row.teamId !== base.teamId" class="btn btn-sm" @click="selectTeam(row.teamId)">{{ t('dash.open') }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import EcgLine from '../components/EcgLine.vue';
import ShiftBadge from '../components/ShiftBadge.vue';
import { api } from '../api.js';
import { base, userName } from '../store.js';
import { t } from '../i18n.js';
import { isOrgAdmin, selectTeam, teamList } from '../store.js';
import { currentMonth, fmtDate, monthLabel, todayStr } from '../utils.js';

const today = todayStr();
const month = currentMonth();
const schedule = ref(null);
const nextSchedule = ref(null);
const pending = ref([]);
const dayOffset = ref(0);

const rotation = computed(() => base.users.filter((u) => u.inRotation && u.active !== false));
const todayDay = computed(() => schedule.value?.days?.[today]);
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const focusDay = computed(() => {
  if (dayOffset.value === 0) return todayDay.value;
  const s = tomorrow.slice(0, 7) === month ? schedule.value : nextSchedule.value;
  return s?.days?.[tomorrow];
});
const warnings = computed(() => (schedule.value ? Object.values(schedule.value.days).filter((d) => base.settings.shifts.some((s) => (d.shifts[s.id]?.length || 0) < base.settings.staffPerShift)) : []));

const overview = ref([]);
async function loadOverview() {
  if (!isOrgAdmin()) return;
  const rows = await api('/org/overview');
  const teams = new Map(teamList().map((tm) => [tm.id, tm]));
  overview.value = rows.map((r) => ({ ...r, ...teams.get(r.teamId) })).filter((r) => r.name);
}

onMounted(async () => {
  loadOverview();
  const calls = [api(`/teams/${base.teamId}/schedule/${month}`), api(`/requests?status=pending&teamId=${base.teamId}`)];
  if (tomorrow.slice(0, 7) !== month) calls.push(api(`/teams/${base.teamId}/schedule/${tomorrow.slice(0, 7)}`));
  [schedule.value, pending.value, nextSchedule.value = null] = await Promise.all(calls);
});
</script>

<style scoped>
tr.current td { background: #f0fdf4; }
.small-value { font-size: 20px; }
.duty { padding: 12px 0; border-top: 1px dashed var(--border); }
.duty:first-of-type { border-top: none; padding-top: 0; }
.duty-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bk { color: #0f766e; }
.people { display: flex; gap: 6px; flex-wrap: wrap; }
.person { background: var(--surface-2); border: 1px solid var(--border); padding: 4px 10px; border-radius: 8px; font-weight: 600; }
.req { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
.req:first-of-type { border-top: none; }
</style>
