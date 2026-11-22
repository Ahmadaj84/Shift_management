<template>
  <svg class="ecg-line" :viewBox="`0 0 ${w} 40`" preserveAspectRatio="none" :style="{ height: height + 'px' }">
    <path :d="path" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="trace" />
  </svg>
</template>

<script setup>
const props = defineProps({
  color: { type: String, default: '#22e39a' },
  height: { type: Number, default: 40 },
  beats: { type: Number, default: 4 },
  animated: { type: Boolean, default: true },
});
const w = props.beats * 100;
// One PQRST complex per 100 units
const beat = (x) =>
  `L${x + 20} 22 Q${x + 25} 16 ${x + 30} 22 L${x + 38} 22 L${x + 41} 26 L${x + 45} 4 L${x + 49} 34 L${x + 52} 22 L${x + 62} 22 Q${x + 70} 12 ${x + 78} 22 L${x + 100} 22`;
const path = `M0 22 ` + Array.from({ length: props.beats }, (_, i) => beat(i * 100)).join(' ');
</script>

<style scoped>
.ecg-line { width: 100%; display: block; }
.trace {
  stroke-dasharray: 1400;
  animation: run 4s linear infinite;
  filter: drop-shadow(0 0 3px currentColor);
}
@keyframes run {
  from { stroke-dashoffset: 1400; }
  to { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .trace { animation: none; }
}
</style>
