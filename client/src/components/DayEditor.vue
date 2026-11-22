<template>
  <AppModal :title="t('dayEditor.title', { date: fmtDate(date) })" width="760px" @close="$emit('close')">
    <div v-for="s in base.settings.shifts" :key="s.id" class="shift-block">
      <div class="row">
        <ShiftBadge :shift="s" />
        <span class="small muted" dir="ltr">{{ s.start }}–{{ s.end }}</span>
        <span class="spacer"></span>
        <span class="small" :class="{ low: draft.shifts[s.id].length < base.settings.staffPerShift }">
          {{ draft.shifts[s.id].length }}/{{ base.settings.staffPerShift }}
        </span>
      </div>
      <div class="chips">
        <button
          v-for="u in staff"
          :key="u.id"
          type="button"
          class="chip"
          :class="{ on: draft.shifts[s.id].includes(u.id), offday: isOffDay(u) }"
          :disabled="busyElsewhere(u.id, s.id) || isAbsent(u.id)"
          :title="isAbsent(u.id) ? t('dayEditor.onLeave') : isOffDay(u) ? t('dayEditor.regularOff') : ''"
          @click="toggle(s.id, u.id)"
        >
          {{ u.name }}
        </button>
      </div>
      <label class="field backup">
        {{ t('schedule.backupFor', { name: shiftName(s) }) }}
        <select v-model="draft.backup[s.id]">
          <option :value="null">{{ t('common.none') }}</option>
          <option v-for="u in backupOptions" :key="u.id" :value="u.id">{{ u.name }}{{ isOffDay(u) ? ` (${t('status.dayOff')})` : '' }}</option>
        </select>
      </label>
    </div>
    <div v-if="day.changes?.length" class="info-box small">
      <strong>{{ t('dayEditor.changeLog') }}</strong>
      <div v-for="(c, i) in day.changes" :key="i">
        <template v-if="c.type === 'replacement'">
          {{ userName(c.absent) }} {{ t('arrow') }} {{ c.replacement ? userName(c.replacement) : t('dayEditor.noReplacement') }} ({{ shiftName(shiftById(c.shift)) }})
        </template>
        <template v-else>{{ t('dayEditor.editedBy', { name: userName(c.by) }) }}</template>
        <span class="muted"> · {{ fmtDateTime(c.at) }}</span>
      </div>
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <template #footer>
      <span class="small muted legend">{{ t('dayEditor.dashedNote') }}</span>
      <button class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
      <button class="btn btn-primary" :disabled="busy" @click="save">{{ t('dayEditor.save') }}</button>
    </template>
  </AppModal>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import AppModal from './AppModal.vue';
import ShiftBadge from './ShiftBadge.vue';
import { api } from '../api.js';
import { base, shiftById, userName } from '../store.js';
import { fmtDate, fmtDateTime, weekdayOf } from '../utils.js';
import { t, shiftName } from '../i18n.js';

const props = defineProps({ date: String, day: Object });
const emit = defineEmits(['close', 'saved']);
const draft = reactive(structuredClone({ shifts: props.day.shifts, backup: props.day.backup }));
const busy = ref(false);
const error = ref('');

const staff = computed(() => base.users.filter((u) => u.active !== false && u.inRotation));
const wd = weekdayOf(props.date);
const isOffDay = (u) => u.daysOff?.includes(wd);
const isAbsent = (id) => props.day.absent?.includes(id) && !Object.values(draft.shifts).flat().includes(id);
const busyElsewhere = (id, sid) => Object.entries(draft.shifts).some(([k, ids]) => k !== sid && ids.includes(id));
const working = computed(() => new Set(Object.values(draft.shifts).flat()));
const backupOptions = computed(() => staff.value.filter((u) => !working.value.has(u.id) && !props.day.absent?.includes(u.id)));

function toggle(sid, id) {
  const list = draft.shifts[sid];
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else {
    list.push(id);
    for (const k of Object.keys(draft.backup)) if (draft.backup[k] === id) draft.backup[k] = null;
  }
}

async function save() {
  busy.value = true;
  error.value = '';
  try {
    const day = await api(`/schedule/${props.date.slice(0, 7)}/days/${props.date}`, { method: 'PUT', body: draft });
    emit('saved', day);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.shift-block { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.chip.offday:not(.on) { border-style: dashed; color: var(--muted); }
.low { color: var(--danger); font-weight: 700; }
.backup { max-width: 320px; font-weight: 500; }
.legend { margin-inline-end: auto; }
</style>
