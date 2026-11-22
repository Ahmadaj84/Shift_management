<template>
  <span class="badge" :style="style">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue';
import { shiftName, shiftShort } from '../i18n.js';
const props = defineProps({ shift: Object, short: Boolean, prefix: String });
const style = computed(() => ({
  background: props.shift?.color + '22',
  color: props.shift?.color,
  border: `1px solid ${props.shift?.color}55`,
}));
const label = computed(() => {
  const name = props.short ? shiftShort(props.shift) : shiftName(props.shift);
  return props.prefix ? `${props.prefix} ${name}` : name;
});
</script>
