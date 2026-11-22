<template>
  <Teleport to="body">
    <div class="backdrop" @mousedown.self="$emit('close')">
      <div class="modal" :style="{ maxWidth: width }" role="dialog" aria-modal="true">
        <header>
          <h2>{{ title }}</h2>
          <button class="icon-btn" @click="$emit('close')" aria-label="Close">✕</button>
        </header>
        <div class="body"><slot /></div>
        <footer v-if="$slots.footer"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
defineProps({ title: String, width: { type: String, default: '560px' } });
const emit = defineEmits(['close']);
const onKey = (e) => e.key === 'Escape' && emit('close');
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(11, 31, 46, 0.55); display: flex; align-items: flex-start; justify-content: center; padding: 6vh 16px; z-index: 50; overflow-y: auto; }
.modal { background: #fff; border-radius: 14px; width: 100%; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25); }
header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); background: var(--surface-2); border-radius: 0 0 14px 14px; }
</style>
