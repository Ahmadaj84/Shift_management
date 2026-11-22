<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>{{ fmtDate(today) }} · {{ base.settings.departmentName }}</p>
      </div>
      <RouterLink to="/schedule" class="btn">Open team schedule →</RouterLink>
    </div>

    <div class="grid grid-4 mb">
      <div class="card stat">
        <span class="label">Team in rotation</span>
        <span class="value">{{ rotation.length }}</span>
        <EcgLine class="trace" :height="30" :beats="2" color="#0e9f6e" />
      </div>
      <div class="card stat">
        <span class="label">Pending requests</span>
        <span class="value" :style="{ color: pending.length ? 'var(--heart)' : '' }">{{ pending.length }}</span>
        <RouterLink to="/requests" class="small muted">Review →</RouterLink>
      </div>
      <div class="card stat">
        <span class="label">Absent today</span>
        <span class="value">{{ todayDay?.absent.length ?? 0 }}</span>
      </div>
      <div class="card stat">
        <span class="label">{{ monthLabel(month) }}</span>
        <span class="value small-value">{{ schedule ? (schedule.published ? 'Published' : 'Draft') : 'Not generated' }}</span>
        <span v-if="warnings.length" class="small" style="color: var(--danger)">{{ warnings.length }} understaffed day(s)</span>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head">
          <h2>On duty today</h2>
          <div class="tabs">
            <button :class="{ active: dayOffset === 0 }" @click="dayOffset = 0">Today</button>
            <button :class="{ active: dayOffset === 1 }" @click="dayOffset = 1">Tomorrow</button>
          </div>
        </div>
        <div v-if="!focusDay" class="empty">
          No schedule for this day yet.
          <div class="mt"><RouterLink to="/schedule" class="btn btn-primary">Generate schedule</RouterLink></div>
        </div>
        <template v-else>
          <div v-for="s in base.settings.shifts" :key="s.id" class="duty">
            <div class="duty-head">
              <ShiftBadge :shift="s" />
              <span class="small muted">{{ s.start }}–{{ s.end }}</span>
              <span class="spacer"></span>
              <span class="small bk">Backup: <strong>{{ focusDay.backup[s.id] ? userName(focusDay.backup[s.id]) : '—' }}</strong></span>
            </div>
            <div class="people">
              <span v-for="id in focusDay.shifts[s.id]" :key="id" class="person">{{ userName(id) }}</span>
              <span v-if="focusDay.shifts[s.id].length < base.settings.staffPerShift" class="badge badge-rejected">
                {{ base.settings.staffPerShift - focusDay.shifts[s.id].length }} missing
              </span>
            </div>
          </div>
          <div v-if="focusDay.absent.length" class="small mt" style="color: var(--heart)">
            On leave / excused: {{ focusDay.absent.map(userName).join(', ') }}
          </div>
          <div v-if="focusDay.off.length" class="small muted">Day off: {{ focusDay.off.map(userName).join(', ') }}</div>
        </template>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Pending requests</h2>
          <RouterLink to="/requests" class="small muted">View all</RouterLink>
        </div>
        <div v-if="!pending.length" class="empty">No pending requests 🎉</div>
        <div v-for="r in pending.slice(0, 6)" :key="r.id" class="req">
          <div>
            <strong>{{ userName(r.userId) }}</strong>
            <div class="small muted">
              {{ r.type === 'excuse' ? `Excuse · ${fmtDate(r.date)}` : `Leave · ${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` }}
            </div>
          </div>
          <span class="badge badge-pending">pending</span>
        </div>
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
const warnings = computed(() => (schedule.value ? Object.values(schedule.value.days).filter((d) => d.warnings?.length) : []));

onMounted(async () => {
  const calls = [api(`/schedule/${month}`), api('/requests?status=pending')];
  if (tomorrow.slice(0, 7) !== month) calls.push(api(`/schedule/${tomorrow.slice(0, 7)}`));
  [schedule.value, pending.value, nextSchedule.value = null] = await Promise.all(calls);
});
</script>

<style scoped>
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
