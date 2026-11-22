<template>
  <div v-if="route.meta.public" class="public"><RouterView /></div>
  <div v-else-if="auth.token" class="shell" :class="{ open: menuOpen }">
    <aside class="sidebar">
      <div class="brand">
        <EcgLogo :size="38" />
        <div>
          <div class="brand-title">ECG Shifts</div>
          <div class="brand-sub">{{ base.settings?.departmentName || 'ECG Department' }}</div>
        </div>
      </div>
      <EcgLine class="brand-trace" :height="26" :beats="3" />

      <nav @click="menuOpen = false">
        <template v-if="isAdmin()">
          <div class="nav-label">Administration</div>
          <RouterLink to="/dashboard"><span>◉</span> Dashboard</RouterLink>
          <RouterLink to="/schedule"><span>▦</span> Team Schedule</RouterLink>
          <RouterLink to="/requests">
            <span>✉</span> Requests
            <em v-if="pending" class="count">{{ pending }}</em>
          </RouterLink>
          <RouterLink to="/team"><span>☺</span> Team</RouterLink>
          <RouterLink to="/settings"><span>⚙</span> Settings</RouterLink>
          <div class="nav-label">Personal</div>
          <RouterLink to="/profile"><span>🔑</span> My Account</RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/my-schedule"><span>♥</span> My Schedule</RouterLink>
          <RouterLink to="/schedule"><span>▦</span> Team Schedule</RouterLink>
          <RouterLink to="/requests"><span>✉</span> Leave &amp; Excuses</RouterLink>
          <RouterLink to="/profile"><span>🔑</span> My Account</RouterLink>
        </template>
      </nav>

      <div class="user-box">
        <div class="avatar">{{ initials }}</div>
        <div class="who">
          <div class="name">{{ auth.user?.name }}</div>
          <div class="role">{{ auth.user?.role === 'admin' ? 'Administrator' : 'ECG Technician' }}</div>
        </div>
        <button class="icon-btn logout" title="Sign out" @click="logout">⏻</button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="icon-btn burger" @click="menuOpen = !menuOpen" aria-label="Menu">☰</button>
        <EcgLogo :size="28" />
        <strong>ECG Shifts</strong>
      </header>
      <RouterView v-if="base.loaded" />
      <div v-else-if="loadError" class="page"><div class="error-box">{{ loadError }}</div></div>
      <div v-else class="page empty">Loading…</div>
    </div>
    <div class="scrim" @click="menuOpen = false"></div>
  </div>

  <div class="toasts">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { RouterView, RouterLink, useRoute } from 'vue-router';
import EcgLogo from './components/EcgLogo.vue';
import EcgLine from './components/EcgLine.vue';
import { auth, base, isAdmin, loadBase, logout, toasts } from './store.js';
import { api } from './api.js';

const route = useRoute();
const menuOpen = ref(false);
const pending = ref(0);
const loadError = ref('');

const initials = computed(() =>
  (auth.user?.name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
);

async function refreshPending() {
  if (!isAdmin()) return;
  try {
    pending.value = (await api('/requests?status=pending')).length;
  } catch { /* ignore */ }
}

watch(
  () => auth.token,
  async (t) => {
    if (!t) return;
    try {
      await loadBase(true);
      refreshPending();
    } catch (e) {
      loadError.value = e.message;
    }
  },
  { immediate: true }
);
watch(() => route.fullPath, refreshPending);
</script>

<style scoped>
.shell { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
.sidebar {
  background: linear-gradient(180deg, var(--navy) 0%, var(--navy-2) 100%);
  color: #cbd5e1; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; padding: 18px 14px;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.brand-title { color: #fff; font-weight: 800; font-size: 17px; letter-spacing: 0.02em; }
.brand-sub { font-size: 12px; color: var(--trace); }
.brand-trace { margin: 10px 0 14px; opacity: 0.9; }
nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
.nav-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 14px 10px 6px; }
nav a { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: #cbd5e1; font-weight: 500; }
nav a span { width: 18px; text-align: center; opacity: 0.8; }
nav a:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
nav a.router-link-active { background: rgba(34, 227, 154, 0.14); color: #fff; box-shadow: inset 3px 0 0 var(--trace); }
.count { margin-left: auto; background: var(--heart); color: #fff; font-style: normal; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; }
.user-box { display: flex; align-items: center; gap: 10px; padding: 12px 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--trace); color: var(--navy); font-weight: 800; display: grid; place-items: center; font-size: 13px; flex-shrink: 0; }
.who { flex: 1; min-width: 0; }
.who .name { color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who .role { font-size: 12px; color: #94a3b8; }
.logout { color: #94a3b8; }
.logout:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.main { min-width: 0; }
.topbar { display: none; }
.scrim { display: none; }

.toasts { position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 100; }
.toast { background: var(--navy); color: #fff; padding: 11px 16px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); border-left: 4px solid var(--trace); max-width: 360px; }
.toast.error { border-left-color: var(--heart); }

@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 260px; z-index: 40; transform: translateX(-100%); transition: transform 0.2s; }
  .shell.open .sidebar { transform: none; }
  .shell.open .scrim { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 30; }
  .topbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--navy); color: #fff; position: sticky; top: 0; z-index: 20; }
  .burger { color: #fff; font-size: 20px; }
}
</style>
