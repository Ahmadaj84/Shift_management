<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ t('nav.account') }}</h1>
        <p>{{ auth.user.name }} · <span dir="ltr">{{ auth.user.username }}</span></p>
      </div>
    </div>
    <div class="card" style="max-width: 460px">
      <div class="card-head"><h2>{{ t('profile.changePassword') }}</h2></div>
      <form class="form" @submit.prevent="submit">
        <label class="field">{{ t('profile.current') }} <input v-model="current" type="password" autocomplete="current-password" required /></label>
        <label class="field">{{ t('profile.new') }} <input v-model="next" type="password" autocomplete="new-password" minlength="6" required /></label>
        <label class="field">{{ t('profile.confirm') }} <input v-model="confirm2" type="password" autocomplete="new-password" required /></label>
        <div v-if="error" class="error-box">{{ error }}</div>
        <button class="btn btn-primary" :disabled="busy">{{ t('profile.update') }}</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '../api.js';
import { auth, toast } from '../store.js';
import { t } from '../i18n.js';

const current = ref('');
const next = ref('');
const confirm2 = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (next.value !== confirm2.value) return (error.value = t('profile.mismatch'));
  busy.value = true;
  try {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword: current.value, newPassword: next.value } });
    current.value = next.value = confirm2.value = '';
    toast(t('profile.updated'));
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
</style>
