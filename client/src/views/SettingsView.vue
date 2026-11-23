<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <div v-if="draft" class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>{{ t('settings.department') }}</h2></div>
        <div class="form-grid">
          <label class="field">{{ t('settings.departmentName') }} <input v-model="draft.departmentName" /></label>
          <label class="field">{{ t('settings.perShift') }} <input v-model.number="draft.staffPerShift" type="number" min="1" max="20" /></label>
        </div>
        <label class="check mt">
          <input v-model="draft.assignExtraStaff" type="checkbox" />
          {{ t('settings.extraStaff') }}
        </label>
      </div>

      <div class="card">
        <div class="card-head"><h2>{{ t('settings.shifts') }}</h2></div>
        <div v-for="s in draft.shifts" :key="s.id" class="shift-edit">
          <input v-model="s.color" type="color" class="color" />
          <label class="field">{{ t('team.name') }} <input v-model="s.name" /></label>
          <label class="field code">{{ t('settings.code') }} <input v-model="s.short" maxlength="2" /></label>
          <label class="field">{{ t('settings.start') }} <input v-model="s.start" type="time" /></label>
          <label class="field">{{ t('settings.end') }} <input v-model="s.end" type="time" /></label>
        </div>
      </div>
    </div>

    <div class="row mt">
      <button class="btn btn-primary" :disabled="busy" @click="save">{{ t('settings.save') }}</button>
      <span class="small muted">{{ t('settings.note') }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '../api.js';
import { base, toast } from '../store.js';
import { t, shiftName, shiftShort, deptName } from '../i18n.js';
import { clone } from '../utils.js';

// Show built-in names in the current language so they can be edited naturally.
const localized = (s) => ({
  ...clone(s),
  departmentName: deptName(s.departmentName),
  shifts: s.shifts.map((x) => ({ ...x, name: shiftName(x), short: shiftShort(x) })),
});
const draft = ref(localized(base.settings));
const busy = ref(false);

async function save() {
  busy.value = true;
  try {
    base.settings = await api('/settings', { method: 'PUT', body: draft.value });
    draft.value = localized(base.settings);
    toast(t('settings.saved'));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.shift-edit { display: grid; grid-template-columns: 44px 1.4fr 0.6fr 1fr 1fr; gap: 10px; align-items: end; padding: 10px 0; border-top: 1px dashed var(--border); }
.shift-edit:first-of-type { border-top: none; }
.color { height: 40px; padding: 3px; cursor: pointer; }
@media (max-width: 560px) { .shift-edit { grid-template-columns: 44px 1fr 1fr; } }
</style>
