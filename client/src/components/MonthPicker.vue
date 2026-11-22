<template>
  <div class="month-picker">
    <button class="btn btn-sm" @click="$emit('update:modelValue', shiftMonth(modelValue, -1))" :aria-label="t('month.prev')">{{ isRtl() ? '›' : '‹' }}</button>
    <strong>{{ monthLabel(modelValue) }}</strong>
    <button class="btn btn-sm" @click="$emit('update:modelValue', shiftMonth(modelValue, 1))" :aria-label="t('month.next')">{{ isRtl() ? '‹' : '›' }}</button>
    <button v-if="modelValue !== currentMonth()" class="btn btn-sm btn-ghost" @click="$emit('update:modelValue', currentMonth())">{{ t('month.today') }}</button>
  </div>
</template>

<script setup>
import { shiftMonth, monthLabel, currentMonth } from '../utils.js';
import { t, isRtl } from '../i18n.js';
defineProps({ modelValue: String });
defineEmits(['update:modelValue']);
</script>

<style scoped>
.month-picker { display: inline-flex; align-items: center; gap: 10px; }
strong { min-width: 130px; text-align: center; font-size: 15px; }
</style>
