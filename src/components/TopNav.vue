<script setup>
import { Box, QrCode, Trash2, X } from 'lucide-vue-next'

defineProps({
  status: { type: Object, required: true },
  pairingOpen: { type: Boolean, default: false },
})

defineEmits(['clear', 'toggle-pairing'])

const tones = {
  emerald: { pill: 'border-emerald-glow/25 bg-emerald-glow/[0.07] text-emerald-300', dot: 'bg-emerald-glow', ping: true },
  amber: { pill: 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200', dot: 'bg-amber-400', ping: true },
  zinc: { pill: 'border-white/[0.1] bg-white/[0.03] text-zinc-300', dot: 'bg-zinc-400', ping: false },
  rose: { pill: 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300', dot: 'bg-rose-500', ping: false },
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-white/[0.06] bg-obsidian/70 backdrop-blur-xl">
    <div class="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 md:h-16 md:gap-3 md:px-6">
      <!-- Logo -->
      <div class="flex min-w-0 items-center gap-2.5">
        <div class="relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-white/10 bg-onyx shadow-[0_0_20px_-4px_rgba(139,92,246,0.7)]">
          <Box class="h-4 w-4 text-violet-300" :stroke-width="2.2" />
          <span class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-glow shadow-[0_0_8px_#06B6D4]" />
        </div>
        <div class="hidden leading-tight min-[400px]:block">
          <p class="text-sm font-semibold tracking-tight text-white">Magic Box</p>
          <p class="hidden text-[11px] text-zinc-500 sm:block">Zero-friction cross-device drop</p>
        </div>
      </div>

      <div class="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 md:gap-2">
        <!-- Desktop / tablet status -->
        <div class="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs md:flex" :class="tones[status.tone].pill">
          <span class="relative flex h-2 w-2">
            <span v-if="tones[status.tone].ping" class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" :class="tones[status.tone].dot" />
            <span class="relative inline-flex h-2 w-2 rounded-full" :class="tones[status.tone].dot" />
          </span>
          <span class="font-medium">{{ status.label }}</span>
          <template v-if="status.detail">
            <span class="opacity-40">•</span>
            <span class="font-mono text-[11px]">{{ status.detail }}</span>
          </template>
        </div>

        <!-- Mobile status pill -->
        <div class="flex min-w-0 items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-medium md:hidden" :class="tones[status.tone].pill">
          <span class="relative flex h-1.5 w-1.5 shrink-0">
            <span v-if="tones[status.tone].ping" class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" :class="tones[status.tone].dot" />
            <span class="relative inline-flex h-1.5 w-1.5 rounded-full" :class="tones[status.tone].dot" />
          </span>
          <span class="truncate">{{ status.short }}</span>
        </div>

        <button
          type="button"
          class="btn-ghost h-8 w-8 shrink-0 !px-0 md:hidden"
          :class="pairingOpen && '!border-violet-glow/60 !text-white'"
          :aria-expanded="pairingOpen"
          aria-label="Toggle QR and room code"
          @click="$emit('toggle-pairing')"
        >
          <X v-if="pairingOpen" class="h-4 w-4" />
          <QrCode v-else class="h-4 w-4" />
        </button>

        <button
          type="button"
          class="btn-ghost h-8 min-w-8 shrink-0 hover:!border-rose-400/50 hover:!text-rose-200 max-sm:w-8 max-sm:!px-0"
          title="Clear Box"
          @click="$emit('clear')"
        >
          <Trash2 class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Clear Box</span>
        </button>
      </div>
    </div>
  </header>
</template>
