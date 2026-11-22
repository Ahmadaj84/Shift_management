<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Team</h1>
        <p>{{ rotation.length }} technicians in rotation · each has two days off per week</p>
      </div>
      <div class="row">
        <button class="btn" @click="balance">⚖ Auto-balance days off</button>
        <button class="btn btn-primary" @click="openEdit()">+ Add member</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head">
        <h2>Weekly coverage</h2>
        <span class="small muted">Needed per day: {{ needed }} ({{ base.settings.shifts.length }} shifts × {{ base.settings.staffPerShift }})</span>
      </div>
      <div class="coverage">
        <div v-for="c in coverage" :key="c.weekday" class="cov" :class="{ bad: c.available < c.needed }">
          <div class="wd">{{ WD_SHORT[c.weekday] }}</div>
          <div class="avail">{{ c.available }}</div>
          <div class="small">available</div>
          <div class="small muted">{{ c.off }} off</div>
        </div>
      </div>
      <div v-if="coverage.some((c) => c.available < c.needed)" class="warn-box mt small">
        Some days don't have enough available technicians. Adjust days off, add team members or reduce staff per shift.
      </div>
    </div>

    <div class="card" style="padding: 0">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Days off</th>
              <th>Contact</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in sorted" :key="u.id" :class="{ inactive: u.active === false }">
              <td>
                <strong>{{ u.name }}</strong>
                <div v-if="u.employeeId" class="small muted">ID {{ u.employeeId }}</div>
              </td>
              <td class="muted">{{ u.username }}</td>
              <td>
                <span class="badge" :class="u.role === 'admin' ? 'badge-admin' : 'badge-tech'">{{ u.role === 'admin' ? 'Admin' : 'Technician' }}</span>
                <div v-if="!u.inRotation" class="small muted">not in rotation</div>
              </td>
              <td>
                <span v-if="u.inRotation" class="chips">
                  <span v-for="d in u.daysOff" :key="d" class="badge badge-off">{{ WD_SHORT[d] }}</span>
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td class="small">{{ u.phone }}<div class="muted">{{ u.email }}</div></td>
              <td><span class="badge" :class="u.active === false ? 'badge-cancelled' : 'badge-approved'">{{ u.active === false ? 'Inactive' : 'Active' }}</span></td>
              <td class="actions">
                <button class="btn btn-sm" @click="openEdit(u)">Edit</button>
                <button v-if="u.active !== false && u.id !== auth.user.id" class="btn btn-sm btn-ghost" @click="remove(u)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal v-if="edit" :title="edit.id ? `Edit ${edit.name}` : 'Add team member'" width="620px" @close="edit = null">
      <div class="form-grid">
        <label class="field">Full name <input v-model="edit.name" /></label>
        <label class="field">Username <input v-model="edit.username" autocomplete="off" /></label>
        <label class="field">Employee ID <input v-model="edit.employeeId" /></label>
        <label class="field">
          Role
          <select v-model="edit.role">
            <option value="technician">ECG Technician</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label class="field">Phone <input v-model="edit.phone" /></label>
        <label class="field">Email <input v-model="edit.email" type="email" /></label>
        <label class="field">
          {{ edit.id ? 'New password (leave blank to keep)' : 'Password' }}
          <input v-model="edit.password" type="password" autocomplete="new-password" />
        </label>
      </div>
      <div class="row">
        <label class="check"><input v-model="edit.inRotation" type="checkbox" /> Works shifts (in rotation)</label>
        <label class="check"><input v-model="edit.active" type="checkbox" /> Active</label>
      </div>
      <div v-if="edit.inRotation">
        <div class="field-label">Weekly days off <span class="muted small">(pick exactly two)</span></div>
        <div class="chips">
          <button
            v-for="(w, i) in WEEKDAYS"
            :key="w"
            type="button"
            class="chip"
            :class="{ on: edit.daysOff.includes(i) }"
            @click="toggleDay(i)"
          >{{ w }} <span class="muted small">({{ offOn(i) }})</span></button>
        </div>
        <p class="small muted">Numbers show how many others are already off that day.</p>
      </div>
      <div v-if="error" class="error-box">{{ error }}</div>
      <template #footer>
        <button class="btn" @click="edit = null">Cancel</button>
        <button class="btn btn-primary" :disabled="busy" @click="save">Save</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AppModal from '../components/AppModal.vue';
import { api } from '../api.js';
import { auth, base, loadBase, toast } from '../store.js';
import { WD_SHORT, WEEKDAYS } from '../utils.js';

const coverage = ref([]);
const edit = ref(null);
const error = ref('');
const busy = ref(false);

const rotation = computed(() => base.users.filter((u) => u.inRotation && u.active !== false));
const needed = computed(() => base.settings.shifts.length * base.settings.staffPerShift);
const sorted = computed(() =>
  [...base.users].sort((a, b) => (a.active === false) - (b.active === false) || (a.role === 'admin' ? -1 : 0) - (b.role === 'admin' ? -1 : 0) || a.name.localeCompare(b.name))
);
const offOn = (wd) => rotation.value.filter((u) => u.id !== edit.value?.id && u.daysOff?.includes(wd)).length;

async function refresh() {
  await loadBase(true);
  coverage.value = await api('/users/coverage');
}
onMounted(refresh);

function openEdit(u) {
  error.value = '';
  edit.value = u
    ? { ...u, daysOff: [...(u.daysOff || [])], password: '' }
    : { name: '', username: '', employeeId: '', role: 'technician', phone: '', email: '', password: '', inRotation: true, active: true, daysOff: [] };
}

function toggleDay(i) {
  const d = edit.value.daysOff;
  if (d.includes(i)) d.splice(d.indexOf(i), 1);
  else {
    if (d.length >= 2) d.shift();
    d.push(i);
  }
}

async function save() {
  busy.value = true;
  error.value = '';
  try {
    const { id, createdAt, ...body } = edit.value;
    if (!body.password) delete body.password;
    if (id) await api(`/users/${id}`, { method: 'PUT', body });
    else await api('/users', { method: 'POST', body });
    toast(id ? 'Team member updated' : 'Team member added');
    edit.value = null;
    await refresh();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function remove(u) {
  if (!confirm(`Remove ${u.name} from the team? They will no longer be able to sign in or be scheduled.`)) return;
  try {
    await api(`/users/${u.id}`, { method: 'DELETE' });
    toast(`${u.name} removed`);
    await refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function balance() {
  if (!confirm('Reassign everyone\'s two days off (consecutive days) to spread coverage evenly across the week? Existing schedules are not changed until regenerated.')) return;
  try {
    await api('/users/balance-days-off', { method: 'POST' });
    toast('Days off rebalanced');
    await refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}
</script>

<style scoped>
.coverage { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.cov { text-align: center; padding: 10px 4px; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; }
.cov.bad { background: #fef2f2; border-color: #fecaca; }
.cov .wd { font-weight: 700; font-size: 12px; text-transform: uppercase; color: var(--muted); }
.cov .avail { font-size: 24px; font-weight: 800; color: var(--primary-dark); }
.cov.bad .avail { color: var(--danger); }
.actions { white-space: nowrap; text-align: right; }
tr.inactive { opacity: 0.55; }
.field-label { font-weight: 600; font-size: 13px; margin-bottom: 8px; }
</style>
