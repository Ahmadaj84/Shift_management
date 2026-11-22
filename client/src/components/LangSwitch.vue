<template>
  <div class="lang-switch" :class="{ dark }">
    <button :class="{ on: i18n.locale === 'ar' }" @click="setLocale('ar')">العربية</button>
    <button :class="{ on: i18n.locale === 'en' }" @click="setLocale('en')">English</button>
  </div>
</template>

<script setup>
import { i18n, setLocale } from '../i18n.js';
defineProps({ dark: Boolean });
</script>

<style scoped>
.lang-switch { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; padding: 2px; background: #fff; }
.lang-switch button { border: none; background: transparent; padding: 4px 12px; border-radius: 6px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--muted); }
.lang-switch button.on { background: var(--navy); color: #fff; }
.dark { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.1); }
.dark button { color: #94a3b8; }
.dark button.on { background: var(--trace); color: var(--navy); }
</style>
