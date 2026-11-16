<script setup>
import { useToast } from '../composables/useToast'

const { toasts } = useToast()

const dot = {
  violet: 'bg-violet-glow shadow-[0_0_8px_#8B5CF6]',
  cyan: 'bg-cyan-glow shadow-[0_0_8px_#06B6D4]',
  emerald: 'bg-emerald-glow shadow-[0_0_8px_#10B981]',
  rose: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]',
  zinc: 'bg-zinc-400',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:items-end" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="glass-strong flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.9)]">
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="dot[t.tone] || dot.violet" />
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
@media (min-width: 768px) {
  .toast-enter-from {
    transform: translateY(8px) scale(0.95);
  }
}
</style>
