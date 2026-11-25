<template>
  <AppModal :title="t('import.title', { team: base.team.name })" width="980px" @close="$emit('close')">
    <!-- 1. choose a file -->
    <template v-if="step === 'upload'">
      <ol class="steps">
        <li>
          {{ t('import.step1') }}
          <button class="btn btn-sm btn-excel" :disabled="busy" @click="getTemplate"><span class="xl">X</span> {{ t('import.downloadTemplate') }}</button>
        </li>
        <li>{{ t('import.step2') }}</li>
        <li>{{ t('import.step3') }}</li>
      </ol>
      <label
        class="drop"
        :class="{ over: dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" @change="onPick" />
        <span class="big">📄</span>
        <strong>{{ busy ? t('import.reading') : t('import.chooseFile') }}</strong>
        <span class="small muted">{{ t('import.fileTypes') }}</span>
      </label>
      <div class="info-box small">{{ t('import.flexibleNote') }}</div>
    </template>

    <!-- 2. preview -->
    <template v-else-if="step === 'preview'">
      <div class="summary">
        <span class="small muted">{{ fileName }}</span>
        <span class="badge badge-approved">{{ t('import.count.new', { n: counts.new }) }}</span>
        <span class="badge badge-tech">{{ t('import.count.update', { n: counts.update }) }}</span>
        <span class="badge" :class="counts.error ? 'badge-rejected' : 'badge-cancelled'">{{ t('import.count.error', { n: counts.error }) }}</span>
        <span class="spacer"></span>
        <div class="tabs">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">{{ t('common.all') }}</button>
          <button :class="{ active: filter === 'error' }" @click="filter = 'error'">{{ t('import.onlyErrors') }}</button>
        </div>
      </div>
      <p v-if="missingColumns.length" class="warn-box small">{{ t('import.missingColumns', { cols: missingColumns.map((c) => t(`import.col.${c}`)).join('، ') }) }}</p>
      <div class="table-wrap preview">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('team.name') }}</th>
              <th>{{ t('team.username') }}</th>
              <th>{{ t('team.jobTitle') }}</th>
              <th>{{ t('team.daysOff') }}</th>
              <th>{{ t('team.role') }}</th>
              <th>{{ t('req.status') }}</th>
              <th>{{ t('import.notes') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shownRows" :key="r.row" :class="r.status">
              <td class="muted">{{ r.row }}</td>
              <td><strong>{{ r.name || '—' }}</strong></td>
              <td dir="ltr" style="text-align: start">{{ r.username || '—' }}</td>
              <td>{{ r.jobTitle }}</td>
              <td class="nowrap">
                <template v-if="r.daysOff">{{ r.daysOff.map((d) => wdShort()[d]).join('، ') }}</template>
                <template v-else-if="!r.inRotation">—</template>
                <span v-if="r.daysOffAuto" class="auto">{{ t('import.auto') }}</span>
              </td>
              <td>{{ t(`role.${r.role}`) }}<span v-if="!r.inRotation" class="small muted"> · {{ t('team.notInRotation') }}</span></td>
              <td><span class="badge" :class="statusClass[r.status]">{{ t(`import.status.${r.status}`) }}</span></td>
              <td class="notes">
                <div v-for="e in r.errors" :key="e" class="err">⛔ {{ t(`import.err.${e}`) }}</div>
                <div v-for="w in r.status === 'error' ? [] : r.warnings" :key="w" class="warn">⚠ {{ t(`import.warn.${w}`) }}</div>
              </td>
            </tr>
            <tr v-if="!shownRows.length"><td colspan="8" class="empty">{{ t('import.noRows') }}</td></tr>
          </tbody>
        </table>
      </div>
      <p v-if="counts.error && counts.new + counts.update" class="small muted">{{ t('import.errorsSkipped') }}</p>
    </template>

    <!-- 3. done -->
    <template v-else-if="step === 'done'">
      <div class="done">
        <div class="big">✓</div>
        <div class="summary">
          <span class="badge badge-approved">{{ t('import.result.created', { n: result.created }) }}</span>
          <span class="badge badge-tech">{{ t('import.result.updated', { n: result.updated }) }}</span>
          <span v-if="result.skipped" class="badge badge-cancelled">{{ t('import.result.skipped', { n: result.skipped }) }}</span>
        </div>
      </div>
      <template v-if="result.credentials.length">
        <div class="warn-box small">{{ t('import.credentialsNote') }}</div>
        <div class="table-wrap creds">
          <table>
            <thead><tr><th>{{ t('team.name') }}</th><th>{{ t('team.username') }}</th><th>{{ t('login.password') }}</th></tr></thead>
            <tbody>
              <tr v-for="c in result.credentials" :key="c.username">
                <td>{{ c.name }}</td>
                <td dir="ltr" style="text-align: start">{{ c.username }}</td>
                <td dir="ltr" style="text-align: start"><code>{{ c.password }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>

    <div v-if="error" class="error-box">{{ error }}</div>

    <template #footer>
      <template v-if="step === 'preview'">
        <button class="btn" @click="reset">{{ t('import.otherFile') }}</button>
        <button class="btn btn-primary" :disabled="busy || !(counts.new + counts.update)" @click="commit">
          {{ busy ? t('import.importing') : t('import.importN', { n: counts.new + counts.update }) }}
        </button>
      </template>
      <template v-else-if="step === 'done'">
        <button v-if="result.credentials.length" class="btn" @click="downloadCredentials">⬇ {{ t('import.downloadCredentials') }}</button>
        <button class="btn btn-primary" @click="$emit('close')">{{ t('common.close') }}</button>
      </template>
      <button v-else class="btn" @click="$emit('close')">{{ t('common.cancel') }}</button>
    </template>
  </AppModal>
</template>

<script setup>
import { computed, ref } from 'vue';
import AppModal from './AppModal.vue';
import { download, upload, api } from '../api.js';
import { base } from '../store.js';
import { t, i18n } from '../i18n.js';
import { wdShort } from '../utils.js';

const emit = defineEmits(['close', 'imported']);
const step = ref('upload');
const busy = ref(false);
const error = ref('');
const dragOver = ref(false);
const fileName = ref('');
const preview = ref(null);
const result = ref(null);
const filter = ref('all');

const statusClass = { new: 'badge-approved', update: 'badge-tech', error: 'badge-rejected' };
const counts = computed(() => {
  const c = { new: 0, update: 0, error: 0 };
  for (const r of preview.value?.rows || []) c[r.status]++;
  return c;
});
const shownRows = computed(() => (preview.value?.rows || []).filter((r) => filter.value === 'all' || r.status === 'error'));
const missingColumns = computed(() =>
  preview.value ? ['username', 'daysOff'].filter((c) => !preview.value.columns.includes(c)) : []
);

const msg = (e) => (e.message.startsWith('import.') ? t(`import.fileErr.${e.message.slice(7)}`) : e.message);

async function getTemplate() {
  error.value = '';
  try {
    await download(`/teams/${base.teamId}/import/template?lang=${i18n.locale}`, 'team-import-template.xlsx');
  } catch (e) {
    error.value = msg(e);
  }
}

async function readFile(file) {
  if (!file) return;
  error.value = '';
  if (/\.xls$/i.test(file.name)) return (error.value = t('import.fileErr.oldXls'));
  if (file.size > 5 * 1024 * 1024) return (error.value = t('import.fileErr.tooBig'));
  busy.value = true;
  fileName.value = file.name;
  try {
    preview.value = await upload(`/teams/${base.teamId}/import/preview`, file);
    filter.value = preview.value.rows.some((r) => r.status === 'error') && preview.value.rows.length > 20 ? 'error' : 'all';
    step.value = 'preview';
  } catch (e) {
    error.value = msg(e);
  } finally {
    busy.value = false;
  }
}
const onPick = (e) => readFile(e.target.files[0]);
function onDrop(e) {
  dragOver.value = false;
  readFile(e.dataTransfer.files[0]);
}

function reset() {
  step.value = 'upload';
  preview.value = null;
  error.value = '';
}

async function commit() {
  busy.value = true;
  error.value = '';
  try {
    result.value = await api(`/teams/${base.teamId}/import/commit`, { method: 'POST', body: { rows: preview.value.raw } });
    step.value = 'done';
    emit('imported');
  } catch (e) {
    error.value = msg(e);
  } finally {
    busy.value = false;
  }
}

// CSV with a BOM so Excel shows Arabic correctly
function downloadCredentials() {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [[t('team.name'), t('team.username'), t('login.password')], ...result.value.credentials.map((c) => [c.name, c.username, c.password])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `new-accounts-${base.teamId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
</script>

<style scoped>
.steps { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 8px; }
.steps li { line-height: 1.8; }
.steps .btn { margin-inline-start: 8px; }
.btn-excel { background: #107c41; border-color: #107c41; color: #fff; }
.xl { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 3px; background: #fff; color: #107c41; font-weight: 900; font-size: 11px; }
.drop { border: 2px dashed #94a3b8; border-radius: 14px; padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; background: var(--surface-2); text-align: center; }
.drop.over, .drop:hover { border-color: var(--primary); background: #ecfdf5; }
.drop input { display: none; }
.drop .big { font-size: 34px; }
.summary { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.preview { max-height: 52vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
.preview table { font-size: 13px; }
.preview th { position: sticky; top: 0; z-index: 1; }
.preview tr.error td { background: #fff7f7; }
.nowrap { white-space: nowrap; }
.auto { margin-inline-start: 6px; font-size: 10px; font-weight: 700; color: #0f766e; background: #ccfbf1; border-radius: 6px; padding: 0 5px; }
.notes { font-size: 12px; min-width: 220px; }
.notes .err { color: #b91c1c; }
.notes .warn { color: #92400e; }
.done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px; }
.done .big { width: 56px; height: 56px; border-radius: 50%; background: #d1fae5; color: var(--primary-dark); display: grid; place-items: center; font-size: 30px; font-weight: 800; }
.creds { max-height: 40vh; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 5px; font-size: 13px; }
</style>
