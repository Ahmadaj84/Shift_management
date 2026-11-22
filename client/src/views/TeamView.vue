<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('team.title') }}</h1>
        <p>{{ t('team.subtitle', { n: rotation.length }) }}</p>
      </div>
      <div class="row">
        <button class="btn" @click="balance">⚖ {{ t('team.balance') }}</button>
        <button class="btn btn-primary" @click="openEdit()">+ {{ t('team.add') }}</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head">
        <h2>{{ t('team.coverage') }}</h2>
        <span class="small muted">{{ t('team.neededPerDay', { n: needed, shifts: base.settings.shifts.length, per: base.settings.staffPerShift }) }}</span>
      </div>
      <div class="coverage">
        <div v-for="c in coverage" :key="c.weekday" class="cov" :class="{ bad: c.available < c.needed }">
          <div class="wd">{{ wdShort()[c.weekday] }}</div>
          <div class="avail">{{ c.available }}</div>
          <div class="small">{{ t('team.available') }}</div>
          <div class="small muted">{{ t('team.offCount', { n: c.off }) }}</div>
        </div>
      </div>
      <div v-if="coverage.some((c) => c.available < c.needed)" class="warn-box mt small">
        {{ t('team.notEnough') }}
      </div>
    </div>

    <div class="card" style="padding: 0">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('team.name') }}</th>
              <th>{{ t('team.username') }}</th>
              <th>{{ t('team.role') }}</th>
              <th>{{ t('team.daysOff') }}</th>
              <th>{{ t('team.contact') }}</th>
              <th>{{ t('req.status') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in sorted" :key="u.id" :class="{ inactive: u.active === false }">
              <td>
                <strong>{{ u.name }}</strong>
                <div v-if="u.employeeId" class="small muted">{{ t('team.idLabel', { id: u.employeeId }) }}</div>
              </td>
              <td class="muted" dir="ltr" style="text-align: start">{{ u.username }}</td>
              <td>
                <span class="badge" :class="u.role === 'admin' ? 'badge-admin' : 'badge-tech'">{{ u.role === 'admin' ? t('role.adminShort') : t('role.technician') }}</span>
                <div v-if="!u.inRotation" class="small muted">{{ t('team.notInRotation') }}</div>
              </td>
              <td>
                <span v-if="u.inRotation" class="chips">
                  <span v-for="d in u.daysOff" :key="d" class="badge badge-off">{{ wdShort()[d] }}</span>
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td class="small"><span dir="ltr">{{ u.phone }}</span><div class="muted">{{ u.email }}</div></td>
              <td><span class="badge" :class="u.active === false ? 'badge-cancelled' : 'badge-approved'">{{ u.active === false ? t('team.inactive') : t('team.active') }}</span></td>
              <td class="actions">
                <button class="btn btn-sm" @click="openEdit(u)">{{ t('common.edit') }}</button>
                <button v-if="u.active !== false && u.id !== auth.user.id" class="btn btn-sm btn-ghost" @click="remove(u)">{{ t('team.remove') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppModal v-if="edit" :title="edit.id ? t('team.editTitle', { name: edit.name }) : t('team.addTitle')" width="620px" @close="edit = null">
      <div class="form-grid">
        <label class="field">{{ t('team.fullName') }} <input v-model="edit.name" /></label>
        <label class="field">{{ t('team.username') }} <input v-model="edit.username" autocomplete="off" dir="ltr" /></label>
        <label class="field">{{ t('team.employeeId') }} <input v-model="edit.employeeId" /></label>
        <label class="field">
          {{ t('team.role') }}
          <select v-model="edit.role">
            <option value="technician">{{ t('role.technician') }}</option>
            <option value="admin">{{ t('role.admin') }}</option>
          </select>
        </label>
        <label class="field">{{ t('team.phone') }} <input v-model="edit.phone" dir="ltr" /></label>
        <label class="field">{{ t('team.email') }} <input v-model="edit.email" type="email" dir="ltr" /></label>
        <label class="field">
          {{ edit.id ? t('team.newPasswordKeep') : t('login.password') }}
          <input v-model="edit.password" type="password" autocomplete="new-password" dir="ltr" />
        </label>
      </div>
      <div class="row">
        <label class="check"><input v-model="edit.inRotation" type="checkbox" /> {{ t('team.worksShifts') }}</label>
        <label class="check"><input v-model="edit.active" type="checkbox" /> {{ t('team.active') }}</label>
      </div>
      <div v-if="edit.inRotation">
        <div class="field-label">{{ t('my.weeklyDaysOff') }} <span class="muted small">{{ t('team.pickTwo') }}</span></div>
        <div class="chips">
          <button
            v-for="(w, i) in weekdays()"
            :key="w"
            type="button"
            class="chip"
            :class="{ on: edit.daysOff.includes(i) }"
            @click="toggleDay(i)"
          >{{ w }} <span class="muted small">({{ offOn(i) }})</span></button>
        </div>
        <p class="small muted">{{ t('team.numbersNote') }}</p>
      </div>
      <div v-if="error" class="error-box">{{ error }}</div>
      <template #footer>
        <button class="btn" @click="edit = null">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="busy" @click="save">{{ t('common.save') }}</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AppModal from '../components/AppModal.vue';
import { api } from '../api.js';
import { auth, base, loadBase, toast } from '../store.js';
import { wdShort, weekdays } from '../utils.js';
import { t } from '../i18n.js';

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
    toast(id ? t('team.updated') : t('team.added'));
    edit.value = null;
    await refresh();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function remove(u) {
  if (!confirm(t('team.confirmRemove', { name: u.name }))) return;
  try {
    await api(`/users/${u.id}`, { method: 'DELETE' });
    toast(t('team.removed', { name: u.name }));
    await refresh();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function balance() {
  if (!confirm(t('team.confirmBalance'))) return;
  try {
    await api('/users/balance-days-off', { method: 'POST' });
    toast(t('team.balanced'));
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
.actions { white-space: nowrap; text-align: end; }
tr.inactive { opacity: 0.55; }
.field-label { font-weight: 600; font-size: 13px; margin-bottom: 8px; }
</style>
