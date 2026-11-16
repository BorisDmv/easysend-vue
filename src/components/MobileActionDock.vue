<script setup>
import { nextTick, ref } from 'vue'
import { ArrowUp, ClipboardPaste, ImagePlus, Type, X } from 'lucide-vue-next'

const emit = defineEmits(['pick-files', 'tap-paste', 'text'])

const expanded = ref(false)
const draft = ref('')
const inputEl = ref(null)

async function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) {
    await nextTick()
    inputEl.value?.focus()
  }
}

function submit() {
  if (!draft.value.trim()) return
  emit('text', draft.value)
  draft.value = ''
  expanded.value = false
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 md:hidden">
    <div class="glass-strong mx-auto max-w-md rounded-2xl p-2 shadow-[0_-10px_50px_-10px_rgba(0,0,0,0.9),0_0_40px_-20px_rgba(139,92,246,0.6)]">
      <Transition name="expand">
        <form v-if="expanded" class="mb-2 flex items-center gap-2" @submit.prevent="submit">
          <input
            ref="inputEl"
            v-model="draft"
            type="text"
            inputmode="text"
            enterkeyhint="send"
            class="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/40 px-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-violet-glow/60 focus:outline-none"
            placeholder="Note or link…"
            aria-label="Quick text or link"
            data-quick-drop
          />
          <button type="submit" class="btn-primary h-11 w-11 shrink-0 rounded-xl !px-0" :disabled="!draft.trim()" aria-label="Beam">
            <ArrowUp class="h-5 w-5" />
          </button>
        </form>
      </Transition>

      <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
        <button type="button" class="btn-primary h-14 flex-col !gap-1 rounded-xl text-[12px]" @click="emit('pick-files')">
          <ImagePlus class="h-4 w-4" /> Files / Photos
        </button>
        <button type="button" class="btn-ghost h-14 flex-col !gap-1 rounded-xl text-[12px] hover:!border-cyan-glow/50" @click="emit('tap-paste')">
          <ClipboardPaste class="h-4 w-4 text-cyan-300" /> 1-Tap Paste
        </button>
        <button
          type="button"
          class="btn-ghost h-14 w-14 rounded-xl !px-0"
          :class="expanded && '!border-violet-glow/60 !text-white'"
          :aria-expanded="expanded"
          aria-label="Type a note or link"
          @click="toggle"
        >
          <X v-if="expanded" class="h-4 w-4" />
          <Type v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
}
.expand-enter-to,
.expand-leave-from {
  max-height: 60px;
}
</style>
