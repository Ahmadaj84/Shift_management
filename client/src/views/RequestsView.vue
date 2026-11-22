<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ admin ? 'Leave & Excuse Requests' : 'Leave & Excuses' }}</h1>
        <p v-if="admin">Approve or reject requests. On approval a backup technician is pulled into the shift.</p>
        <p v-else>Request annual/sick leave or a one-day excuse. Your administrator will review it.</p>
      </div>
      <button class="btn btn-primary" @click="openForm()">+ New request</button>
    </div>

    <div class="row mb">
      <div class="tabs">
        <button v-for="f in filters" :key="f.id" :class="{ active: filter === f.id }" @click="filter = f.id">
          {{ f.label }} <span v-if="f.id === 'pending' && pendingCount" class="muted">({{ pendingCount }})</span>
        </button>
      </div>
    </div>

    <div class="card" style="padding: 0">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-if="admin">Technician</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Coverage / Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.id">
              <td v-if="admin"><strong>{{ userName(r.userId) }}</strong></td>
              <td>
                <span class="badge" :class="r.type === 'leave' ? 'badge-tech' : 'badge-backup'">
                  {{ r.type === 'leave' ? `Leave · ${r.leaveType}` : 'Day excuse' }}
                </span>
              </td>
              <td class="nowrap">
                <template v-if="r.type === 'excuse'">{{ fmtDate(r.date) }}</template>
                <template v-else>{{ fmtDate(r.startDate) }} → {{ fmtDate(r.endDate) }}<div class="small muted">{{ daysBetween(r.startDate, r.endDate) }} day(s)</div></template>
              </td>
              <td class="reason">{{ r.reason }}</td>
              <td><span class="badge" :class="'badge-' + r.status">{{ r.status }}</span></td>
              <td class="small">
                <div v-for="c in (r.coverage || []).filter((c) => c.shift)" :key="c.date">
                  {{ fmtDate(c.date).slice(0, 10) }}: {{ shiftById(c.shift)?.name }} →
                  <strong v-if="c.replacement">{{ userName(c.replacement) }}</strong>
                  <span v-else class="danger">uncovered</span>
                </div>
                <div v-if="r.adminNote" class="muted">“{{ r.adminNote }}”</div>
              </td>
              <td class="actions">
                <template v-if="r.status === 'pending'">
                  <template v-if="admin">
                    <button class="btn btn-sm btn-primary" @click="openApprove(r)">Approve</button>
                    <button class="btn btn-sm" @click="reject(r)">Reject</button>
                  </template>
                  <button v-if="r.userId === auth.user.id" class="btn btn-sm btn-ghost" @click="cancel(r)">Cancel</button>
                </template>
              </td>
            </tr>
            <tr v-if="!shown.length">
              <td :colspan="admin ? 7 : 6" class="empty">No requests here.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- New request -->
    <AppModal v-if="form" title="New request" @close="form = null">
      <div class="tabs">
        <button :class="{ active: form.type === 'excuse' }" @click="form.type = 'excuse'">Day excuse</button>
        <button :class="{ active: form.type === 'leave' }" @click="form.type = 'leave'">Leave</button>
      </div>
      <label v-if="admin" class="field">
        Technician
        <select v-model="form.userId">
          <option v-for="u in base.users.filter((u) => u.active !== false)" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
      </label>
      <div v-if="form.type === 'excuse'" class="form-grid">
        <label class="field">Date <input v-model="form.date" type="date" :min="todayStr()" /></label>
      </div>
      <div v-else class="form-grid">
        <label class="field">From <input v-model="form.startDate" type="date" :min="todayStr()" /></label>
        <label class="field">To <input v-model="form.endDate" type="date" :min="form.startDate || todayStr()" /></label>
        <label class="field">
          Leave type
          <select v-model="form.leaveType">
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="emergency">Emergency</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label class="field">Reason <textarea v-model="form.reason" maxlength="500" placeholder="Brief reason for the request"></textarea></label>
      <div v-if="formError" class="error-box">{{ formError }}</div>
      <template #footer>
        <button class="btn" @click="form = null">Cancel</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">Submit request</button>
      </template>
    </AppModal>

    <!-- Approve with backup selection -->
    <AppModal v-if="approving" :title="`Approve request — ${userName(approving.req.userId)}`" width="680px" @close="approving = null">
      <div v-if="!approving.rows" class="muted">Checking the schedule…</div>
      <template v-else>
        <div v-if="!affected.length" class="info-box">
          {{ approving.rows.some((r) => !r.scheduled) ? 'Some dates have no schedule yet — this absence will be respected when the schedule is generated.' : 'This person is not working a shift on these dates. No replacement needed.' }}
        </div>
        <p v-else class="muted small">Choose who covers each affected shift. The designated backup (on day off) is suggested first.</p>
        <div v-for="row in affected" :key="row.date" class="cover-row">
          <div>
            <strong>{{ fmtDate(row.date) }}</strong>
            <div><ShiftBadge :shift="shiftById(row.shift)" /></div>
          </div>
          <select v-model="approving.replacements[row.date]">
            <option v-for="c in row.candidates" :key="c.id" :value="c.id">{{ c.name }} — {{ rankLabel[c.rank] }}</option>
            <option v-if="!row.candidates.length" :value="null">No one available</option>
          </select>
        </div>
        <label class="field">Note to technician (optional) <input v-model="approving.note" /></label>
      </template>
      <template #footer>
        <button class="btn" @click="approving = null">Cancel</button>
        <button class="btn btn-primary" :disabled="busy || !approving.rows" @click="approve">Approve &amp; assign backups</button>
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
import { daysBetween, fmtDate, todayStr } from '../utils.js';

const admin = isAdmin();
const route = useRoute();
const requests = ref([]);
const filter = ref(admin ? 'pending' : 'all');
const form = ref(null);
const formError = ref('');
const busy = ref(false);
const approving = ref(null);

const filters = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];
const rankLabel = ['designated backup', 'standby (available)', 'day off', 'backup for another shift'];

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
  form.value = { type: 'excuse', date: '', startDate: '', endDate: '', leaveType: 'annual', reason: '', userId: auth.user.id, ...preset };
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
    toast('Request submitted');
    filter.value = admin ? 'pending' : 'all';
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function cancel(r) {
  if (!confirm('Cancel this request?')) return;
  try {
    await api(`/requests/${r.id}`, { method: 'DELETE' });
    toast('Request cancelled');
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
    toast(uncovered ? `Approved — ${uncovered} shift(s) could not be covered` : 'Approved and backups assigned', uncovered ? 'error' : 'success');
    approving.value = null;
    load();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function reject(r) {
  const note = prompt('Reason for rejection (optional):', '');
  if (note === null) return;
  try {
    await api(`/requests/${r.id}/reject`, { method: 'POST', body: { note } });
    toast('Request rejected');
    load();
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>

<style scoped>
.nowrap { white-space: nowrap; }
.reason { max-width: 260px; }
.actions { white-space: nowrap; text-align: right; }
.actions .btn { margin-left: 4px; }
.danger { color: var(--danger); font-weight: 700; }
.cover-row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
.cover-row strong { display: block; margin-bottom: 4px; }
</style>
