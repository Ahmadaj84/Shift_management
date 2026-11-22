<template>
  <div class="month-picker">
    <button class="btn btn-sm" @click="$emit('update:modelValue', shiftMonth(modelValue, -1))" aria-label="Previous month">‹</button>
    <strong>{{ monthLabel(modelValue) }}</strong>
    <button class="btn btn-sm" @click="$emit('update:modelValue', shiftMonth(modelValue, 1))" aria-label="Next month">›</button>
    <button v-if="modelValue !== currentMonth()" class="btn btn-sm btn-ghost" @click="$emit('update:modelValue', currentMonth())">Today</button>
  </div>
</template>

<script setup>
import { shiftMonth, monthLabel, currentMonth } from '../utils.js';
defineProps({ modelValue: String });
defineEmits(['update:modelValue']);
</script>

<style scoped>
.month-picker { display: inline-flex; align-items: center; gap: 10px; }
strong { min-width: 130px; text-align: center; font-size: 15px; }
</style>
