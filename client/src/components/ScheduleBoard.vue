<template>
  <div class="board-wrap" @keydown.esc="selected = null" tabindex="-1">
    <!-- Toolbar -->
    <div class="card toolbar">
      <div class="tabs weeks">
        <button v-for="(w, i) in weeks" :key="i" :class="{ active: weekIndex === i }" @click="weekIndex = i">
          {{ t('board.week', { n: i + 1 }) }}
          <span v-if="weekErrorCount(w)" class="wdot err"></span>
          <span v-else-if="weekWarnCount(w)" class="wdot warn"></span>
        </button>
      </div>
      <span class="spacer"></span>
      <span class="badge" :class="errors.length ? 'badge-rejected' : 'badge-approved'">⛔ {{ t('board.errors', { n: errors.length }) }}</span>
      <span class="badge badge-pending">⚠ {{ t('board.warnings', { n: warnings.length }) }}</span>
      <span class="save-state small" :class="saveState">{{ t(`board.save.${saveState}`) }}</span>
      <button class="btn btn-sm" :disabled="!undoStack.length || saving" @click="undo">↶ {{ t('board.undo') }}</button>
    </div>

    <p class="hint small muted">
      {{ t('board.hint') }}
      <span v-if="selected" class="sel-hint">
        {{ t('board.selected', { name: userName(selected.userId) }) }}
        <button class="btn btn-sm btn-ghost" @click="selected = null">✕</button>
      </span>
    </p>

    <div class="layout">
      <!-- Staff palette -->
      <aside class="card palette" @dragover.prevent @drop="onDrop($event, { kind: 'palette' })">
        <h3>{{ t('board.team') }}</h3>
        <p class="small muted">{{ t('board.paletteNote') }}</p>
        <div class="pal-list">
          <div
            v-for="u in staff"
            :key="u.id"
            class="chip-x pal"
            :data-user="u.id"
            :class="{ sel: selected?.userId === u.id && selected.from.kind === 'palette' }"
            draggable="true"
            @dragstart="onDragStart($event, u.id, { kind: 'palette' })"
            @dragend="dragging = null"
            @click="select(u.id, { kind: 'palette' })"
          >
            <span class="nm">{{ u.name }}</span>
            <span class="wk" :class="{ over: weekLoad(u.id) > 5 }" :title="t('board.weekLoad')">{{ weekLoad(u.id) }}/5</span>
          </div>
        </div>
      </aside>

      <!-- Board -->
      <div class="card board-card">
        <div class="board" :style="{ '--cols': 7 }">
          <div class="corner"></div>
          <div v-for="(date, i) in currentWeek" :key="'h' + i" class="day-head" :class="{ today: date === today, blank: !date }">
            <template v-if="date">
              <div class="dname">{{ weekdays()[weekdayOf(date)] }}</div>
              <div class="ddate">{{ fmtShortDate(date) }}</div>
            </template>
          </div>

          <template v-for="s in base.settings.shifts" :key="s.id">
            <div class="row-head" :style="{ borderColor: s.color }">
              <ShiftBadge :shift="s" />
              <span class="small muted" dir="ltr">{{ s.start }}–{{ s.end }}</span>
            </div>
            <div
              v-for="(date, i) in currentWeek"
              :key="s.id + i"
              class="cell"
              :data-date="date"
              :data-shift="s.id"
              :class="cellClass(date, s.id)"
              @dragover.prevent="onDragOver($event, date, s.id, 'shift')"
              @dragleave="hover = null"
              @drop="onDrop($event, { kind: 'shift', date, shift: s.id })"
              @click.self="placeSelected({ kind: 'shift', date, shift: s.id })"
            >
              <template v-if="date">
                <div class="count" :class="{ low: (day(date).shifts[s.id]?.length || 0) < need }" @click="placeSelected({ kind: 'shift', date, shift: s.id })">
                  {{ day(date).shifts[s.id]?.length || 0 }}/{{ need }}
                </div>
                <div
                  v-for="uid in day(date).shifts[s.id]"
                  :key="uid"
                  class="chip-x"
                  :data-user="uid"
                  :class="chipClass(date, uid, { kind: 'shift', date, shift: s.id })"
                  :title="chipTitle(date, uid)"
                  draggable="true"
                  @dragstart="onDragStart($event, uid, { kind: 'shift', date, shift: s.id })"
                  @dragend="dragging = null"
                  @click.stop="select(uid, { kind: 'shift', date, shift: s.id })"
                >
                  <span v-if="sevOf(date, uid)" class="ic">{{ sevOf(date, uid) === 'error' ? '⛔' : '⚠' }}</span>
                  <span class="nm">{{ userName(uid) }}</span>
                  <button class="rm" :title="t('board.remove')" @click.stop="remove(uid, { kind: 'shift', date, shift: s.id })">×</button>
                </div>
                <!-- backup slot -->
                <div
                  class="backup-slot"
                  :data-backup="s.id"
                  :class="{ over: hover === `${date}|${s.id}|backup` }"
                  @dragover.prevent.stop="onDragOver($event, date, s.id, 'backup')"
                  @dragleave="hover = null"
                  @drop.stop="onDrop($event, { kind: 'backup', date, shift: s.id })"
                  @click.stop="placeSelected({ kind: 'backup', date, shift: s.id })"
                >
                  <span class="lbl">⟲ {{ t('status.backup') }}</span>
                  <div
                    v-if="day(date).backup[s.id]"
                    class="chip-x bk"
                    :data-user="day(date).backup[s.id]"
                    :class="chipClass(date, day(date).backup[s.id], { kind: 'backup', date, shift: s.id })"
                    :title="chipTitle(date, day(date).backup[s.id])"
                    draggable="true"
                    @dragstart.stop="onDragStart($event, day(date).backup[s.id], { kind: 'backup', date, shift: s.id })"
                    @dragend="dragging = null"
                    @click.stop="select(day(date).backup[s.id], { kind: 'backup', date, shift: s.id })"
                  >
                    <span v-if="sevOf(date, day(date).backup[s.id])" class="ic">{{ sevOf(date, day(date).backup[s.id]) === 'error' ? '⛔' : '⚠' }}</span>
                    <span class="nm">{{ userName(day(date).backup[s.id]) }}</span>
                    <button class="rm" :title="t('board.remove')" @click.stop="remove(day(date).backup[s.id], { kind: 'backup', date, shift: s.id })">×</button>
                  </div>
                  <span v-else class="empty-slot">{{ t('board.dropBackup') }}</span>
                </div>
              </template>
            </div>
          </template>

          <!-- Unassigned pool per day -->
          <div class="row-head pool-head">
            <strong>{{ t('board.notAssigned') }}</strong>
            <span class="small muted">{{ t('board.dropToRemove') }}</span>
          </div>
          <div
            v-for="(date, i) in currentWeek"
            :key="'p' + i"
            class="cell pool"
            :data-pool="date"
            :class="{ blank: !date, over: hover === `${date}|pool` }"
            @dragover.prevent="date && onDragOver($event, date, null, 'pool')"
            @dragleave="hover = null"
            @drop="date && onDrop($event, { kind: 'pool', date })"
            @click.self="date && placeSelected({ kind: 'pool', date })"
          >
            <template v-if="date">
              <div
                v-for="p in poolOf(date)"
                :key="p.id"
                class="chip-x"
                :data-user="p.id"
                :class="[p.kind, { sel: selected?.userId === p.id && selected.from.date === date && selected.from.kind === 'pool' }]"
                :title="t(`board.pool.${p.kind}`)"
                :draggable="true"
                @dragstart="onDragStart($event, p.id, { kind: 'pool', date })"
                @dragend="dragging = null"
                @click.stop="select(p.id, { kind: 'pool', date })"
              >
                <span class="nm">{{ userName(p.id) }}</span>
                <span class="tag">{{ t(`board.poolTag.${p.kind}`) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Conflicts panel -->
    <div class="card conflicts">
      <div class="card-head">
        <h2>{{ t('board.conflicts') }}</h2>
        <div class="tabs">
          <button :class="{ active: scope === 'week' }" @click="scope = 'week'">{{ t('board.thisWeek') }}</button>
          <button :class="{ active: scope === 'month' }" @click="scope = 'month'">{{ t('board.wholeMonth') }}</button>
        </div>
      </div>
      <div v-if="!shownConflicts.length" class="ok">✓ {{ t('board.noConflicts') }}</div>
      <ul v-else>
        <li
          v-for="c in shownConflicts"
          :key="conflictKey(c)"
          :class="[c.severity, { fresh: freshKeys.has(conflictKey(c)) }]"
          @click="jumpTo(c.date)"
        >
          <span class="ic">{{ c.severity === 'error' ? '⛔' : '⚠' }}</span>
          <span class="when">{{ fmtShortDate(c.date) }}</span>
          <span>{{ conflictText(c) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ShiftBadge from './ShiftBadge.vue';
import { api } from '../api.js';
import { base, toast, userName } from '../store.js';
import { t } from '../i18n.js';
import { conflictText } from '../conflictText.js';
import { findConflicts, indexConflicts, conflictKey } from '../conflicts.js';
import { clone, daysOfMonth, fmtShortDate, todayStr, weekdayOf, weekdays } from '../utils.js';

const props = defineProps({ schedule: Object, month: String });

const today = todayStr();
const need = computed(() => base.settings.staffPerShift);
const staff = computed(() => base.users.filter((u) => u.active !== false && u.inRotation));
const day = (date) => props.schedule.days[date];

// ---- weeks (Sunday first) ----
const weeks = computed(() => {
  const days = daysOfMonth(props.month);
  const out = [];
  let week = Array(weekdayOf(days[0])).fill(null);
  for (const d of days) {
    week.push(d);
    if (week.length === 7) {
      out.push(week);
      week = [];
    }
  }
  if (week.length) out.push([...week, ...Array(7 - week.length).fill(null)]);
  return out;
});
const weekIndex = ref(Math.max(0, weeks.value.findIndex((w) => w.includes(today))));
watch(() => props.month, () => (weekIndex.value = Math.max(0, weeks.value.findIndex((w) => w.includes(today)))));
const currentWeek = computed(() => weeks.value[weekIndex.value] || []);

const weekLoad = (uid) => currentWeek.value.filter((d) => d && Object.values(day(d).shifts).some((ids) => ids.includes(uid))).length;

// ---- conflicts ----
const conflicts = computed(() => findConflicts(props.schedule, base.users, base.settings));
const index = computed(() => indexConflicts(conflicts.value));
const errors = computed(() => conflicts.value.filter((c) => c.severity === 'error'));
const warnings = computed(() => conflicts.value.filter((c) => c.severity === 'warning'));
const scope = ref('week');
const shownConflicts = computed(() => {
  const inWeek = new Set(currentWeek.value.filter(Boolean));
  const list = scope.value === 'week' ? conflicts.value.filter((c) => inWeek.has(c.date)) : conflicts.value;
  return [...list].sort((a, b) => (a.severity === b.severity ? a.date.localeCompare(b.date) : a.severity === 'error' ? -1 : 1));
});
const weekErrorCount = (w) => conflicts.value.filter((c) => c.severity === 'error' && w.includes(c.date)).length;
const weekWarnCount = (w) => conflicts.value.filter((c) => c.severity === 'warning' && c.type !== 'understaffed' && w.includes(c.date)).length;

const userConflicts = (date, uid) => index.value.byUserDate.get(`${date}|${uid}`) || [];
const sevOf = (date, uid) => {
  const list = userConflicts(date, uid);
  return list.some((c) => c.severity === 'error') ? 'error' : list.length ? 'warning' : null;
};
const chipTitle = (date, uid) => userConflicts(date, uid).map(conflictText).join('\n') || userName(uid);

// newly introduced conflicts flash for a few seconds
const freshKeys = ref(new Set());
const freshCells = ref(new Set());
let freshTimer = null;

// ---- unassigned pool ----
function poolOf(date) {
  const d = day(date);
  const working = new Set(Object.values(d.shifts).flat());
  const backups = new Set(Object.values(d.backup).filter(Boolean));
  const absent = new Set(d.absent || []);
  const wd = weekdayOf(date);
  return staff.value
    .filter((u) => !working.has(u.id) && !backups.has(u.id))
    .map((u) => ({ id: u.id, kind: absent.has(u.id) ? 'leave' : u.daysOff?.includes(wd) ? 'off' : 'free' }))
    .sort((a, b) => ['free', 'off', 'leave'].indexOf(a.kind) - ['free', 'off', 'leave'].indexOf(b.kind));
}

// ---- classes ----
const hover = ref(null);
function cellClass(date, sid) {
  if (!date) return 'blank';
  const sc = index.value.byShiftDate.get(`${date}|${sid}`) || [];
  return {
    over: hover.value === `${date}|${sid}|shift`,
    today: date === today,
    'has-err': sc.some((c) => c.severity === 'error'),
    flash: freshCells.value.has(`${date}|${sid}`),
  };
}
function chipClass(date, uid, from) {
  return {
    err: sevOf(date, uid) === 'error',
    warn: sevOf(date, uid) === 'warning',
    sel: selected.value?.userId === uid && selected.value.from.kind === from.kind && selected.value.from.date === from.date && selected.value.from.shift === from.shift,
    flash: freshCells.value.has(`${date}|${uid}`),
  };
}

// ---- drag & drop / click-to-place ----
const dragging = ref(null);
const selected = ref(null);

function onDragStart(e, userId, from) {
  dragging.value = { userId, from };
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', userId);
}
function onDragOver(e, date, sid, kind) {
  e.dataTransfer.dropEffect = e.ctrlKey || e.altKey || dragging.value?.from.kind === 'palette' ? 'copy' : 'move';
  hover.value = kind === 'pool' ? `${date}|pool` : `${date}|${sid}|${kind}`;
}
function onDrop(e, target) {
  e.preventDefault();
  hover.value = null;
  const p = dragging.value;
  dragging.value = null;
  if (!p) return;
  move(p.userId, p.from, target, e.ctrlKey || e.altKey);
}
function select(userId, from) {
  const s = selected.value;
  if (s && s.userId === userId && s.from.kind === from.kind && s.from.date === from.date && s.from.shift === from.shift) {
    selected.value = null;
  } else if (s && from.kind !== 'palette' && !(from.kind === 'pool' && s.from.kind === 'pool')) {
    // A name is already selected: clicking another name places it in that name's slot
    placeSelected(from.kind === 'pool' ? { kind: 'pool', date: from.date } : from);
  } else selected.value = { userId, from };
}
function placeSelected(target) {
  if (!selected.value) return;
  const { userId, from } = selected.value;
  selected.value = null;
  move(userId, from, target, false);
}
const remove = (uid, from) => move(uid, from, { kind: 'pool', date: from.date }, false);

/** Move (or copy) a person from one slot to another and save. */
function move(userId, from, target, copy) {
  if (target.kind === 'palette') target = { kind: 'pool', date: from.date };
  if (!target.date) return;
  const same = from.kind === target.kind && from.date === target.date && from.shift === target.shift;
  if (same) return;

  const drafts = {};
  const draft = (date) =>
    (drafts[date] ??= clone({ shifts: day(date).shifts, backup: day(date).backup }));

  // take out of the source slot (palette / pool are sources without a slot)
  if (!copy && from.date) {
    if (from.kind === 'shift') draft(from.date).shifts[from.shift] = draft(from.date).shifts[from.shift].filter((x) => x !== userId);
    if (from.kind === 'backup' && draft(from.date).backup[from.shift] === userId) draft(from.date).backup[from.shift] = null;
  }
  // put into the target slot
  if (target.kind === 'shift') {
    const list = draft(target.date).shifts[target.shift];
    if (!list.includes(userId)) list.push(userId);
  } else if (target.kind === 'backup') {
    draft(target.date).backup[target.shift] = userId;
  } else if (target.kind === 'pool' && target.date !== from.date) {
    // dropping on another day's pool: just remove from the source
  }
  if (!Object.keys(drafts).length) return;
  commit(drafts, { record: true, focus: { date: target.date, userId, shift: target.shift } });
}

// ---- saving, undo ----
const undoStack = ref([]);
const saving = ref(false);
const saveState = ref('saved'); // saved | saving | error
let queue = Promise.resolve();

function applyLocal(date, { shifts, backup }) {
  const d = day(date);
  d.shifts = shifts;
  d.backup = backup;
  const working = new Set(Object.values(shifts).flat());
  const absent = new Set(d.absent || []);
  const wd = weekdayOf(date);
  const free = staff.value.filter((u) => !working.has(u.id) && !absent.has(u.id));
  d.off = free.filter((u) => u.daysOff?.includes(wd)).map((u) => u.id);
  d.standby = free.filter((u) => !u.daysOff?.includes(wd)).map((u) => u.id);
}

function commit(drafts, { record, focus }) {
  const beforeKeys = new Set(conflicts.value.map(conflictKey));
  const snapshot = Object.fromEntries(
    Object.keys(drafts).map((date) => [date, clone({ shifts: day(date).shifts, backup: day(date).backup })])
  );
  for (const [date, dr] of Object.entries(drafts)) applyLocal(date, dr);
  if (record) undoStack.value.push(snapshot);
  if (undoStack.value.length > 50) undoStack.value.shift();

  // Report conflicts this change introduced
  const fresh = conflicts.value.filter((c) => !beforeKeys.has(conflictKey(c)));
  freshKeys.value = new Set(fresh.map(conflictKey));
  freshCells.value = new Set(fresh.flatMap((c) => [`${c.date}|${c.userId}`, `${c.date}|${c.shift}`]));
  clearTimeout(freshTimer);
  freshTimer = setTimeout(() => {
    freshKeys.value = new Set();
    freshCells.value = new Set();
  }, 4000);
  if (fresh.length) {
    const first = fresh.find((c) => c.severity === 'error') || fresh[0];
    const more = fresh.length > 1 ? ' ' + t('board.andMore', { n: fresh.length - 1 }) : '';
    toast(`${first.severity === 'error' ? '⛔' : '⚠'} ${conflictText(first)}${more}`, 'error');
  }

  // Save (requests are serialised so the server sees them in order)
  saving.value = true;
  saveState.value = 'saving';
  queue = queue
    .then(() => api(`/schedule/${props.month}/days`, { method: 'PATCH', body: { days: drafts } }))
    .then((days) => {
      for (const [date, d] of Object.entries(days)) Object.assign(day(date), d);
      saveState.value = 'saved';
    })
    .catch((e) => {
      for (const [date, s] of Object.entries(snapshot)) applyLocal(date, s);
      if (record) undoStack.value.pop();
      saveState.value = 'error';
      toast(e.message, 'error');
    })
    .finally(() => (saving.value = false));
}

function undo() {
  const snap = undoStack.value.pop();
  if (snap) commit(snap, { record: false });
}

function jumpTo(date) {
  const i = weeks.value.findIndex((w) => w.includes(date));
  if (i >= 0) weekIndex.value = i;
}

onBeforeUnmount(() => clearTimeout(freshTimer));
</script>

<style scoped>
.board-wrap { outline: none; display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 14px; }
.weeks { max-width: 100%; overflow-x: auto; }
.weeks button { position: relative; white-space: nowrap; }
.wdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-inline-start: 4px; vertical-align: middle; }
.wdot.err { background: var(--danger); }
.wdot.warn { background: var(--warning); }
.save-state { color: var(--muted); min-width: 70px; }
.save-state.saving { color: var(--info); }
.save-state.error { color: var(--danger); }
.hint { margin: 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.sel-hint { background: var(--navy); color: #fff; padding: 2px 4px 2px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px; }
.sel-hint .btn { color: #fff; padding: 0 6px; }

.layout { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: start; }
.palette { position: sticky; top: 12px; padding: 12px; max-height: calc(100vh - 24px); overflow-y: auto; }
.palette h3 { margin-bottom: 4px; }
.palette p { margin: 0 0 10px; }
.pal-list { display: flex; flex-direction: column; gap: 6px; }
.chip-x.pal { justify-content: space-between; }
.wk { font-size: 11px; color: var(--muted); font-weight: 700; }
.wk.over { color: var(--danger); }

.board-card { padding: 0; overflow-x: auto; }
.board { display: grid; grid-template-columns: 104px repeat(var(--cols), minmax(118px, 1fr)); min-width: 930px; }
.board > div { border-bottom: 1px solid var(--border); border-inline-start: 1px solid var(--border); }
.corner, .day-head { background: var(--surface-2); }
.day-head { padding: 8px; text-align: center; }
.day-head.today { background: #fff1f2; }
.dname { font-weight: 700; }
.ddate { font-size: 12px; color: var(--muted); }
.row-head { padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; justify-content: center; background: var(--surface-2); border-inline-start: 4px solid; }
.pool-head { border-inline-start-color: #94a3b8 !important; }

.cell { padding: 6px; min-height: 120px; display: flex; flex-direction: column; gap: 4px; position: relative; transition: background 0.12s; }
.cell.blank { background: repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #f3f4f6 6px, #f3f4f6 12px); }
.cell.today { background: #fffafb; }
.cell.over { background: #ecfdf5; box-shadow: inset 0 0 0 2px var(--primary); }
.cell.has-err { box-shadow: inset 0 0 0 2px #fca5a5; }
.cell.flash { animation: flash 0.9s ease-in-out 3; }
.cell.pool { min-height: 80px; background: #fbfcfd; }
.cell.pool.over { background: #fef2f2; box-shadow: inset 0 0 0 2px #fca5a5; }
.count { align-self: flex-end; font-size: 11px; font-weight: 700; color: var(--primary-dark); background: #ecfdf5; border-radius: 6px; padding: 0 6px; cursor: pointer; }
.count.low { color: #fff; background: var(--danger); }

.chip-x {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 8px;
  background: #fff; border: 1px solid var(--border); font-size: 12px; font-weight: 600;
  cursor: grab; user-select: none; box-shadow: 0 1px 1px rgba(15, 23, 42, 0.04);
}
.chip-x:active { cursor: grabbing; }
.chip-x:hover { border-color: #94a3b8; }
.chip-x .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-x .ic { font-size: 11px; }
.chip-x .rm { border: none; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; opacity: 0; }
.chip-x:hover .rm { opacity: 1; }
.chip-x.sel { outline: 2px solid var(--navy); outline-offset: 1px; }
.chip-x.err { background: #fef2f2; border-color: #f87171; color: #991b1b; }
.chip-x.warn { background: #fffbeb; border-color: #fbbf24; color: #92400e; }
.chip-x.flash { animation: flash 0.9s ease-in-out 3; }
.chip-x.off { border-style: dashed; color: var(--muted); }
.chip-x.leave { background: #fff1f2; color: #be123c; border-color: #fecdd3; }
.chip-x .tag { font-size: 10px; font-weight: 600; color: var(--muted); }
.chip-x.bk { background: #f0fdfa; border: 1px dashed #14b8a6; color: #0f766e; }
.chip-x.bk.err { background: #fef2f2; border-color: #f87171; color: #991b1b; }

.backup-slot { margin-top: auto; border: 1px dashed #99f6e4; border-radius: 8px; padding: 4px; display: flex; flex-direction: column; gap: 3px; background: #f8fffe; cursor: pointer; }
.backup-slot.over { background: #ccfbf1; border-color: #14b8a6; }
.backup-slot .lbl { font-size: 10px; color: #0f766e; font-weight: 700; }
.empty-slot { font-size: 11px; color: #94a3b8; }

.conflicts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto; }
.conflicts li { display: flex; gap: 8px; align-items: baseline; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
.conflicts li.error { background: #fef2f2; color: #991b1b; }
.conflicts li.warning { background: #fffbeb; color: #92400e; }
.conflicts li.fresh { outline: 2px solid currentColor; }
.conflicts .when { font-weight: 700; min-width: 70px; }
.conflicts .ok { color: var(--primary-dark); font-weight: 600; }

@keyframes flash {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.45); }
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .palette { position: static; max-height: none; }
  .pal-list { flex-direction: row; flex-wrap: wrap; }
}
</style>
