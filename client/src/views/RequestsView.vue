<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ admin ? t('req.adminTitle') : t('req.title') }}</h1>
        <p>{{ admin ? t('req.adminSubtitle') : t('req.subtitle') }}</p>
      </div>
      <button class="btn btn-primary" @click="openForm()">+ {{ t('req.new') }}</button>
    </div>

    <div class="row mb">
      <div class="tabs">
        <button v-for="f in filters" :key="f" :class="{ active: filter === f }" @click="filter = f">
          {{ f === 'all' ? t('common.all') : t(`status.${f}`) }}
          <span v-if="f === 'pending' && pendingCount" class="muted">({{ pendingCount }})</span>
        </button>
      </div>
    </div>

    <div class="card" style="padding: 0">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-if="admin">{{ t('schedule.technician') }}</th>
              <th>{{ t('req.type') }}</th>
              <th>{{ t('req.dates') }}</th>
              <th>{{ t('req.reason') }}</th>
              <th>{{ t('req.status') }}</th>
              <th>{{ t('req.coverageNote') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.id">
              <td v-if="admin"><strong>{{ userName(r.userId) }}</strong></td>
              <td>
                <span class="badge" :class="r.type === 'leave' ? 'badge-tech' : 'badge-backup'">
                  {{ r.type === 'leave' ? `${t('req.leave')} · ${t(`leaveType.${r.leaveType}`)}` : t('req.excuse') }}
                </span>
              </td>
              <td class="nowrap">
                <template v-if="r.type === 'excuse'">{{ fmtDate(r.date) }}</template>
                <template v-else>
                  {{ fmtDate(r.startDate) }} {{ t('arrow') }} {{ fmtDate(r.endDate) }}
                  <div class="small muted">{{ t('req.dayCount', { n: daysBetween(r.startDate, r.endDate) }) }}</div>
                </template>
              </td>
              <td class="reason">{{ r.reason }}</td>
              <td><span class="badge" :class="'badge-' + r.status">{{ t(`status.${r.status}`) }}</span></td>
              <td class="small">
                <div v-for="c in (r.coverage || []).filter((c) => c.shift)" :key="c.date">
                  {{ fmtShortDate(c.date) }}: {{ shiftName(shiftById(c.shift)) }} {{ t('arrow') }}
                  <strong v-if="c.replacement">{{ userName(c.replacement) }}</strong>
                  <span v-else class="danger">{{ t('req.uncovered') }}</span>
                </div>
                <div v-if="r.adminNote" class="muted">«{{ r.adminNote }}»</div>
              </td>
              <td class="actions">
                <template v-if="r.status === 'pending'">
                  <template v-if="admin">
                    <button class="btn btn-sm btn-primary" @click="openApprove(r)">{{ t('req.approve') }}</button>
                    <button class="btn btn-sm" @click="reject(r)">{{ t('req.reject') }}</button>
                  </template>
                  <button v-if="r.userId === auth.user.id" class="btn btn-sm btn-ghost" @click="cancel(r)">{{ t('req.cancelRequest') }}</button>
                </template>
              </td>
            </tr>
            <tr v-if="!shown.length">
              <td :colspan="admin ? 7 : 6" class="empty">{{ t('req.none') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- New request -->
    <AppModal v-if="form" :title="t('req.new')" @close="form = null">
      <div class="tabs">
        <button :class="{ active: form.type === 'excuse' }" @click="form.type = 'excuse'">{{ t('req.excuse') }}</button>
        <button :class="{ active: form.type === 'leave' }" @click="form.type = 'leave'">{{ t('req.leave') }}</button>
      </div>
      <label v-if="admin" class="field">
        {{ t('schedule.technician') }}
        <select v-model="form.userId">
          <option v-for="u in base.users.filter((u) => u.active !== false)" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </label>
      <div v-if="form.type === 'excuse'" class="form-grid">
        <label class="field">{{ t('req.date') }} <input v-model="form.date" type="date" :min="todayStr()" /></label>
      </div>
      <div v-else class="form-grid">
        <label class="field">{{ t('req.from') }} <input v-model="form.startDate" type="date" :min="todayStr()" /></label>
        <label class="field">{{ t('req.to') }} <input v-model="form.endDate" type="date" :min="form.startDate || todayStr()" /></label>
        <label class="field">
          {{ t('req.leaveType') }}
          <select v-model="form.leaveType">
            <option v-for="lt in ['annual', 'sick', 'emergency', 'other']" :key="lt" :value="lt">{{ t(`leaveType.${lt}`) }}</option>
          </select>
        </label>
      </div>
      <label class="field">{{ t('req.reason') }} <textarea v-model="form.reason" maxlength="500" :placeholder="t('req.reasonPlaceholder')"></textarea></label>
      <div v-if="formError" class="error-box">{{ formError }}</div>
      <template #footer>
        <button class="btn" @click="form = null">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">{{ t('req.submit') }}</button>
      </template>
    </AppModal>

    <!-- Approve with backup selection -->
    <AppModal v-if="approving" :title="t('req.approveTitle', { name: userName(approving.req.userId) })" width="680px" @close="approving = null">
      <div v-if="!approving.rows" class="muted">{{ t('req.checking') }}</div>
      <template v-else>
        <div v-if="!affected.length" class="info-box">
          {{ approving.rows.some((r) => !r.scheduled) ? t('req.noScheduleYet') : t('req.notWorking') }}
        </div>
        <p v-else class="muted small">{{ t('req.chooseCover') }}</p>
        <div v-for="row in affected" :key="row.date" class="cover-row">
          <div>
            <strong>{{ fmtDate(row.date) }}</strong>
            <div><ShiftBadge :shift="shiftById(row.shift)" /></div>
          </div>
          <select v-model="approving.replacements[row.date]">
            <option v-for="c in row.candidates" :key="c.id" :value="c.id">{{ c.name }} — {{ t(`rank.${c.rank}`) }}</option>
            <option v-if="!row.candidates.length" :value="null">{{ t('req.noOneAvailable') }}</option>
          </select>
        </div>
        <label class="field">{{ t('req.noteOptional') }} <input v-model="approving.note" /></label>
      </template>
      <template #footer>
        <button class="btn" @click="approving = null">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="busy || !approving.rows" @click="approve">{{ t('req.approveAssign') }}</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppModal from '../components/AppModal.vue';
import ShiftBadge from '../components/ShiftBadge.vue';
import { api } from '../api.js';
import { auth, base, isAdmin, shiftById, toast, userName } from '../store.js';
import { t, shiftName } from '../i18n.js';
import { daysBetween, fmtDate, fmtShortDate, todayStr } from '../utils.js';

const admin = isAdmin();
const route = useRoute();
const requests = ref([]);
const filter = ref(admin ? 'pending' : 'all');
const form = ref(null);
const formError = ref('');
const busy = ref(false);
const approving = ref(null);

const filters = ['pending', 'approved', 'rejected', 'all'];

const pendingCount = computed(() => requests.value.filter((r) => r.status === 'pending').length);
const shown = computed(() => (filter.value === 'all' ? requests.value : requests.value.filter((r) => r.status === filter.value)));
const affected = computed(() => approving.value?.rows?.filter((r) => r.scheduled && r.shift) || []);

async function load() {
  try {
    requests.value = await api('/requests');
  } catch (e) {
    toast(e.message, 'error');
  }
}
onMounted(load);

function openForm(preset = {}) {
  formError.value = '';
  form.value = { type: 'excuse', date: '', startDate: '', endDate: '', leaveType: 'annual', reason: '', userId: auth.user?.id, ...preset };
}
watch(
  () => route.query,
  (q) => q.type && openForm({ type: q.type, date: q.date || '' }),
  { immediate: true }
);

async function submit() {
  formError.value = '';
  busy.value = true;
  try {
    await api('/requests', { method: 'POST', body: form.value });
    form.value = null;
    toast(t('req.submitted'));
    filter.value = admin ? 'pending' : 'all';
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function cancel(r) {
  if (!confirm(t('req.confirmCancel'))) return;
  try {
    await api(`/requests/${r.id}`, { method: 'DELETE' });
    toast(t('req.cancelled'));
    load();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function openApprove(r) {
  approving.value = { req: r, rows: null, replacements: {}, note: '' };
  try {
    const rows = await api(`/requests/${r.id}/coverage`);
    for (const row of rows) if (row.candidates?.length) approving.value.replacements[row.date] = row.candidates[0].id;
    approving.value.rows = rows;
  } catch (e) {
    toast(e.message, 'error');
    approving.value = null;
  }
}

async function approve() {
  busy.value = true;
  try {
    const res = await api(`/requests/${approving.value.req.id}/approve`, {
      method: 'POST',
      body: { replacements: approving.value.replacements, note: approving.value.note },
    });
    const uncovered = res.coverage.filter((c) => c.status === 'uncovered').length;
    toast(uncovered ? t('req.approvedUncovered', { n: uncovered }) : t('req.approvedToast'), uncovered ? 'error' : 'success');
    approving.value = null;
    load();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function reject(r) {
  const note = prompt(t('req.rejectPrompt'), '');
  if (note === null) return;
  try {
    await api(`/requests/${r.id}/reject`, { method: 'POST', body: { note } });
    toast(t('req.rejectedToast'));
    load();
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>

<style scoped>
.nowrap { white-space: nowrap; }
.reason { max-width: 260px; }
.actions { white-space: nowrap; text-align: end; }
.actions .btn { margin-inline-start: 4px; }
.danger { color: var(--danger); font-weight: 700; }
.cover-row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
.cover-row strong { display: block; margin-bottom: 4px; }
</style>
