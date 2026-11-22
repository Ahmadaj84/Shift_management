<template>
  <div class="login ecg-paper">
    <div class="monitor">
      <div class="monitor-head">
        <EcgLogo :size="54" />
        <div>
          <h1>ECG Shift Management</h1>
          <p>Cardiology · ECG Technician Team</p>
        </div>
      </div>
      <div class="screen">
        <EcgLine :height="60" :beats="5" />
        <div class="hr"><span>♥</span> 72 <small>bpm</small></div>
      </div>

      <form @submit.prevent="submit">
        <label class="field">
          Username
          <input v-model="username" autocomplete="username" required autofocus />
        </label>
        <label class="field">
          Password
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <div v-if="error" class="error-box">{{ error }}</div>
        <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import EcgLogo from '../components/EcgLogo.vue';
import EcgLine from '../components/EcgLine.vue';
import { api } from '../api.js';
import { setAuth } from '../store.js';

const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username: username.value, password: password.value } });
    setAuth(token, user);
    router.replace('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.monitor { width: 100%; max-width: 420px; background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(11, 31, 46, 0.18); padding: 28px; border: 1px solid #fde2e7; }
.monitor-head { display: flex; gap: 14px; align-items: center; }
.monitor-head p { margin: 2px 0 0; color: var(--muted); }
.screen { margin: 22px 0; background: var(--navy); border-radius: 12px; padding: 10px 12px; position: relative; box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.5); }
.hr { position: absolute; top: 8px; right: 12px; color: var(--trace); font-weight: 800; font-size: 18px; font-variant-numeric: tabular-nums; }
.hr span { color: var(--heart); animation: pulse 0.83s infinite; display: inline-block; }
.hr small { font-size: 11px; font-weight: 600; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 15% { transform: scale(1.3); } }
form { display: flex; flex-direction: column; gap: 14px; }
form .btn { padding: 11px; font-size: 15px; }
</style>
