<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('org.title') }}</h1>
        <p>{{ t('org.subtitle') }}</p>
      </div>
      <button v-if="isSuper()" class="btn btn-primary" @click="openForm('hospital')">+ {{ t('org.addHospital') }}</button>
    </div>

    <div v-if="!base.org.length" class="card empty">
      <p>{{ t('org.empty') }}</p>
    </div>

    <div v-for="h in base.org" :key="h.id" class="card hospital">
      <div class="h-head">
        <div class="h-title">
          <span class="h-icon">🏥</span>
          <h2>{{ h.name }}</h2>
          <span class="small muted">{{ t('org.counts', { d: h.departments.length, t: h.departments.reduce((n, d) => n + d.teams.length, 0) }) }}</span>
        </div>
        <div class="row">
          <template v-if="isSuper()">
            <button class="btn btn-sm" @click="openForm('hospital', h)">{{ t('org.rename') }}</button>
            <button class="btn btn-sm btn-ghost" @click="del('hospitals', h)">{{ t('team.remove') }}</button>
          </template>
          <button v-if="h.manageable" class="btn btn-sm btn-primary" @click="openForm('department', null, { hospitalId: h.id })">+ {{ t('org.addDepartment') }}</button>
        </div>
      </div>

      <!-- hospital admins -->
      <div v-if="h.manageable" class="admins">
        <span class="small muted">{{ t('org.hospitalAdmins') }}:</span>
        <span v-for="a in h.admins" :key="a.id" class="admin-chip">
          <span class="badge badge-role-hospital_admin">{{ a.name }}</span>
          <span class="small muted" dir="ltr">{{ a.username }}</span>
          <template v-if="isSuper()">
            <button class="icon-btn" :title="t('common.edit')" @click="openForm('admin', a, { hospitalId: h.id })">✎</button>
            <button class="icon-btn" :title="t('team.remove')" @click="removeAdmin(a)">✕</button>
          </template>
        </span>
        <span v-if="!h.admins.length" class="small muted">—</span>
        <button v-if="isSuper()" class="btn btn-sm btn-ghost" @click="openForm('admin', null, { hospitalId: h.id })">+ {{ t('org.addAdmin') }}</button>
      </div>

      <div v-for="dp in h.departments" :key="dp.id" class="dept">
        <div class="d-head">
          <h3>{{ dp.name }}</h3>
          <div v-if="h.manageable" class="row">
            <button class="btn btn-sm btn-ghost" @click="openForm('department', dp, { hospitalId: h.id })">{{ t('org.rename') }}</button>
            <button class="btn btn-sm btn-ghost" @click="del('departments', dp)">{{ t('team.remove') }}</button>
            <button class="btn btn-sm" @click="openForm('team', null, { departmentId: dp.id })">+ {{ t('org.addTeam') }}</button>
          </div>
        </div>
        <div class="teams">
          <div v-for="tm in dp.teams" :key="tm.id" class="team-card" :class="{ current: tm.id === base.teamId }">
            <div class="tm-name">{{ tm.name }}</div>
            <div class="small">
              <span class="muted">{{ t('org.leaders') }}: </span>
              <strong v-if="tm.leaders.length">{{ tm.leaders.map((l) => l.name).join('، ') }}</strong>
              <span v-else class="warn-text">{{ t('org.noLeader') }}</span>
            </div>
            <div class="small muted">{{ t('org.teamStats', { m: tm.memberCount, s: tm.shiftCount, p: tm.staffPerShift }) }}</div>
            <div class="row tm-actions">
              <button class="btn btn-sm btn-primary" @click="openTeam(tm.id, '/team')">{{ t('org.members') }}</button>
              <button class="btn btn-sm" @click="openTeam(tm.id, '/schedule')">{{ t('nav.teamSchedule') }}</button>
              <template v-if="h.manageable">
                <button class="icon-btn" :title="t('org.rename')" @click="openForm('team', tm, { departmentId: dp.id })">✎</button>
                <button class="icon-btn" :title="t('team.remove')" @click="del('teams', tm)">✕</button>
              </template>
            </div>
          </div>
          <div v-if="!dp.teams.length" class="small muted">{{ t('org.noTeams') }}</div>
        </div>
      </div>
      <div v-if="!h.departments.length" class="small muted">{{ t('org.noDepartments') }}</div>
    </div>

    <!-- add / edit form -->
    <AppModal v-if="form" :title="formTitle" @close="form = null">
      <label class="field">{{ form.kind === 'admin' ? t('team.fullName') : t('team.name') }} <input v-model="form.name" /></label>
      <label v-if="form.kind === 'team' && !form.id" class="field">
        {{ t('org.shiftTemplate') }}
        <select v-model="form.template">
          <option value="three8">{{ t('settings.preset.three8') }}</option>
          <option value="two12">{{ t('settings.preset.two12') }}</option>
        </select>
      </label>
      <template v-if="form.kind === 'admin'">
        <div class="form-grid">
          <label class="field">{{ t('team.username') }} <input v-model="form.username" dir="ltr" autocomplete="off" /></label>
          <label class="field">
            {{ form.id ? t('team.newPasswordKeep') : t('login.password') }}
            <input v-model="form.password" type="password" dir="ltr" autocomplete="new-password" />
          </label>
          <label class="field">{{ t('team.phone') }} <input v-model="form.phone" dir="ltr" /></label>
          <label class="field">{{ t('team.email') }} <input v-model="form.email" dir="ltr" type="email" /></label>
        </div>
      </template>
      <div v-if="error" class="error-box">{{ error }}</div>
      <template #footer>
        <button class="btn" @click="form = null">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" :disabled="busy" @click="submit">{{ t('common.save') }}</button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppModal from '../components/AppModal.vue';
import { api } from '../api.js';
import { base, isSuper, loadBase, selectTeam, toast } from '../store.js';
import { t } from '../i18n.js';

const router = useRouter();
const form = ref(null);
const error = ref('');
const busy = ref(false);

const formTitle = computed(() => {
  if (!form.value) return '';
  const k = form.value.kind;
  return form.value.id ? t('org.editTitle', { name: form.value.original }) : t(`org.add.${k}`);
});

async function openForm(kind, item = null, extra = {}) {
  error.value = '';
  form.value = { kind, id: item?.id || null, name: item?.name || '', original: item?.name || '', template: 'three8', username: item?.username || '', password: '', phone: '', email: '', ...extra };
  if (kind === 'admin' && item) {
    const full = (await api('/users')).find((u) => u.id === item.id);
    if (full) Object.assign(form.value, { phone: full.phone || '', email: full.email || '' });
  }
}

async function submit() {
  const f = form.value;
  busy.value = true;
  error.value = '';
  try {
    if (f.kind === 'hospital') {
      await api(f.id ? `/org/hospitals/${f.id}` : '/org/hospitals', { method: f.id ? 'PUT' : 'POST', body: { name: f.name } });
    } else if (f.kind === 'department') {
      await api(f.id ? `/org/departments/${f.id}` : '/org/departments', { method: f.id ? 'PUT' : 'POST', body: { name: f.name, hospitalId: f.hospitalId } });
    } else if (f.kind === 'team') {
      await api(f.id ? `/org/teams/${f.id}` : '/org/teams', { method: f.id ? 'PUT' : 'POST', body: { name: f.name, departmentId: f.departmentId, template: f.template } });
    } else if (f.kind === 'admin') {
      const body = { name: f.name, username: f.username, phone: f.phone, email: f.email, role: 'hospital_admin', hospitalId: f.hospitalId, inRotation: false };
      if (f.password) body.password = f.password;
      await api(f.id ? `/users/${f.id}` : '/users', { method: f.id ? 'PUT' : 'POST', body });
    }
    form.value = null;
    toast(t('org.saved'));
    await loadBase(true);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function del(kind, item) {
  if (!confirm(t('org.confirmDelete', { name: item.name }))) return;
  try {
    await api(`/org/${kind}/${item.id}`, { method: 'DELETE' });
    toast(t('org.deleted'));
    await loadBase(true);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function removeAdmin(a) {
  if (!confirm(t('team.confirmRemove', { name: a.name }))) return;
  try {
    await api(`/users/${a.id}`, { method: 'DELETE' });
    await loadBase(true);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function openTeam(id, path) {
  if (id !== base.teamId) await selectTeam(id);
  router.push(path);
}
</script>

<style scoped>
.hospital { margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
.h-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.h-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.h-icon { font-size: 22px; }
.admins { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; background: #faf5ff; border-radius: 10px; }
.admin-chip { display: inline-flex; align-items: center; gap: 4px; }
.dept { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: var(--surface-2); }
.d-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.team-card { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; border-inline-start: 4px solid var(--primary); }
.team-card.current { box-shadow: 0 0 0 2px var(--primary); }
.tm-name { font-weight: 800; font-size: 15px; }
.tm-actions { margin-top: 6px; gap: 6px; }
.warn-text { color: var(--warning); font-weight: 600; }
</style>
