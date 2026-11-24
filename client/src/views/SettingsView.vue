<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ base.team.name }} · {{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <div v-if="draft" class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>{{ t('settings.staffing') }}</h2></div>
        <div class="form-grid">
          <label class="field">{{ t('settings.perShift') }} <input v-model.number="draft.staffPerShift" type="number" min="1" max="30" /></label>
        </div>
        <label class="check mt">
          <input v-model="draft.assignExtraStaff" type="checkbox" />
          {{ t('settings.extraStaff') }}
        </label>
        <div class="presets mt">
          <span class="small muted">{{ t('settings.presets') }}</span>
          <button class="btn btn-sm" @click="applyPreset('three8')">{{ t('settings.preset.three8') }}</button>
          <button class="btn btn-sm" @click="applyPreset('two12')">{{ t('settings.preset.two12') }}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>{{ t('settings.shifts') }}</h2>
          <button class="btn btn-sm" :disabled="draft.shifts.length >= 4" @click="addShift">+ {{ t('settings.addShift') }}</button>
        </div>
        <div v-for="(s, i) in draft.shifts" :key="i" class="shift-edit">
          <input v-model="s.color" type="color" class="color" />
          <label class="field">{{ t('team.name') }} <input v-model="s.name" /></label>
          <label class="field code">{{ t('settings.code') }} <input v-model="s.short" maxlength="2" /></label>
          <label class="field">{{ t('settings.start') }} <input v-model="s.start" type="time" /></label>
          <label class="field">{{ t('settings.end') }} <input v-model="s.end" type="time" /></label>
          <button class="icon-btn rm" :disabled="draft.shifts.length <= 1" :title="t('board.remove')" @click="draft.shifts.splice(i, 1)">✕</button>
        </div>
        <p class="small muted">{{ t('settings.shiftOrderNote') }}</p>
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
import { t, shiftName, shiftShort } from '../i18n.js';
import { clone } from '../utils.js';

// Show built-in names in the current language so they can be edited naturally.
const localized = (s) => ({ ...clone(s), shifts: s.shifts.map((x) => ({ ...x, name: shiftName(x), short: shiftShort(x) })) });
const draft = ref(localized(base.settings));
const busy = ref(false);

const PRESETS = {
  three8: [
    { id: 'morning', name: 'Morning', short: 'M', start: '07:00', end: '15:00', color: '#f59e0b' },
    { id: 'evening', name: 'Evening', short: 'E', start: '15:00', end: '23:00', color: '#3b82f6' },
    { id: 'night', name: 'Night', short: 'N', start: '23:00', end: '07:00', color: '#8b5cf6' },
  ],
  two12: [
    { id: 'day', name: 'Day', short: 'D', start: '07:00', end: '19:00', color: '#f59e0b' },
    { id: 'night', name: 'Night', short: 'N', start: '19:00', end: '07:00', color: '#8b5cf6' },
  ],
};
function applyPreset(key) {
  if (!confirm(t('settings.confirmPreset'))) return;
  draft.value.shifts = PRESETS[key].map((x) => ({ ...x, name: shiftName(x), short: shiftShort(x) }));
}
function addShift() {
  draft.value.shifts.push({ id: '', name: t('settings.newShift'), short: '', start: '08:00', end: '16:00', color: '#10b981' });
}

async function save() {
  busy.value = true;
  try {
    base.settings = await api(`/teams/${base.teamId}/settings`, { method: 'PUT', body: draft.value });
    base.team.settings = base.settings;
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
.shift-edit { display: grid; grid-template-columns: 44px 1.4fr 0.6fr 1fr 1fr 32px; gap: 10px; align-items: end; padding: 10px 0; border-top: 1px dashed var(--border); }
.shift-edit:first-of-type { border-top: none; }
.color { height: 40px; padding: 3px; cursor: pointer; }
.rm { margin-bottom: 6px; }
.presets { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media (max-width: 560px) { .shift-edit { grid-template-columns: 44px 1fr 1fr; } }
</style>
