<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>Settings</h1>
        <p>Shift times, staffing levels and department details.</p>
      </div>
    </div>

    <div v-if="draft" class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>Department</h2></div>
        <div class="form-grid">
          <label class="field">Department name <input v-model="draft.departmentName" /></label>
          <label class="field">Technicians per shift <input v-model.number="draft.staffPerShift" type="number" min="1" max="20" /></label>
        </div>
        <label class="check mt">
          <input v-model="draft.assignExtraStaff" type="checkbox" />
          When more technicians are available than needed, add them to shifts (otherwise they are standby)
        </label>
      </div>

      <div class="card">
        <div class="card-head"><h2>Shifts</h2></div>
        <div v-for="s in draft.shifts" :key="s.id" class="shift-edit">
          <input v-model="s.color" type="color" class="color" />
          <label class="field">Name <input v-model="s.name" /></label>
          <label class="field code">Code <input v-model="s.short" maxlength="2" /></label>
          <label class="field">Start <input v-model="s.start" type="time" /></label>
          <label class="field">End <input v-model="s.end" type="time" /></label>
        </div>
      </div>
    </div>

    <div class="row mt">
      <button class="btn btn-primary" :disabled="busy" @click="save">Save settings</button>
      <span class="small muted">Changes to staffing apply to schedules generated afterwards.</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '../api.js';
import { base, toast } from '../store.js';

const draft = ref(structuredClone(base.settings));
const busy = ref(false);

async function save() {
  busy.value = true;
  try {
    base.settings = await api('/settings', { method: 'PUT', body: draft.value });
    draft.value = structuredClone(base.settings);
    toast('Settings saved');
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
