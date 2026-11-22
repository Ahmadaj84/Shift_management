<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" class="ecg-logo" aria-label="ECG">
    <path
      d="M32 56 C 10 40, 4 28, 8 18 C 12 8, 26 8, 32 18 C 38 8, 52 8, 56 18 C 60 28, 54 40, 32 56 Z"
      fill="#e11d48"
    />
    <path
      d="M4 34 H18 L22 26 L27 44 L33 14 L38 38 L41 32 H60"
      fill="none"
      stroke="#fff"
      stroke-width="3.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="beat"
    />
  </svg>
</template>

<script setup>
defineProps({ size: { type: Number, default: 40 } });
</script>

<style scoped>
.beat {
  stroke-dasharray: 120;
  stroke-dashoffset: 0;
  animation: draw 2.4s ease-in-out infinite;
}
@keyframes draw {
  0% { stroke-dashoffset: 120; }
  45%, 100% { stroke-dashoffset: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .beat { animation: none; }
}
</style>
