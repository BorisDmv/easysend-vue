<script setup>
import { computed, ref } from 'vue'
import { ArrowUp, Box, ClipboardPaste, Link2, Plus, Terminal, UploadCloud } from 'lucide-vue-next'
import FloatingItemCard from './FloatingItemCard.vue'
import { isUrl } from '../utils/format'

const props = defineProps({
  items: { type: Array, required: true },
  now: { type: Number, required: true },
  pulse: { type: Boolean, default: false },
})
const emit = defineEmits(['files', 'text', 'remove', 'pick-files'])

const draft = ref('')
const dragDepth = ref(0)
const dragCount = ref(0)
const isDragging = computed(() => dragDepth.value > 0)

const draftKind = computed(() => {
  if (!draft.value.trim()) return null
  return isUrl(draft.value) ? 'link' : 'text'
})

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files')
}

function onDragEnter(e) {
  if (!hasFiles(e)) return
  dragDepth.value++
  dragCount.value = e.dataTransfer.items?.length || 0
}

function onDragOver(e) {
  if (hasFiles(e)) e.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(e) {
  if (!hasFiles(e)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(e) {
  dragDepth.value = 0
  const files = e.dataTransfer?.files
  if (files?.length) return emit('files', files)
  const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
  if (text) emit('text', text)
}

// Pin leaving cards in place so siblings can FLIP into the freed slot immediately.
function onBeforeLeave(el) {
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = el
  Object.assign(el.style, {
    position: 'absolute',
    left: `${offsetLeft}px`,
    top: `${offsetTop}px`,
    width: `${offsetWidth}px`,
    height: `${offsetHeight}px`,
    margin: '0',
  })
}

function submit() {
  if (!draft.value.trim()) return
  emit('text', draft.value)
  draft.value = ''
}
</script>

<template>
  <section
    class="magic-box relative flex min-h-[60vh] flex-col rounded-[24px] md:h-[calc(100dvh-7rem)] md:min-h-[560px]"
    :class="{ 'is-dragging': isDragging, 'is-pulsing': pulse }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Ambient glow layers -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
      <div class="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-violet-glow/[0.12] blur-[90px]" />
      <div class="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-cyan-glow/[0.08] blur-[110px]" />
      <div class="grid-texture absolute inset-0" />
    </div>

    <!-- Header strip -->
    <div class="relative flex items-center gap-3 px-4 pt-4 md:px-6 md:pt-5">
      <div class="flex items-center gap-2">
        <Box class="h-4 w-4 text-violet-300" />
        <h1 class="text-sm font-semibold tracking-tight text-white">The Box</h1>
      </div>
      <span class="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
        {{ items.length }} item{{ items.length === 1 ? '' : 's' }}
      </span>
      <p class="ml-auto hidden items-center gap-1.5 text-[11px] text-zinc-500 md:flex">
        <ClipboardPaste class="h-3 w-3" />
        Drop files or press
        <kbd class="rounded border border-white/10 bg-white/5 px-1 font-mono text-[10px] text-zinc-300">Ctrl</kbd>
        <kbd class="rounded border border-white/10 bg-white/5 px-1 font-mono text-[10px] text-zinc-300">V</kbd>
        anywhere
      </p>
    </div>

    <!-- Spatial card field -->
    <div class="relative flex-1 px-4 pb-4 pt-4 md:overflow-y-auto md:px-6 md:pb-28">
      <TransitionGroup
        tag="div"
        name="card"
        @before-leave="onBeforeLeave"
        class="relative grid grid-cols-1 items-start gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3"
      >
        <div v-for="(item, i) in items" :key="item.id" class="card-slot" :class="i % 3 === 1 ? 'xl:mt-6' : i % 3 === 2 ? 'xl:mt-2' : ''">
          <FloatingItemCard :item="item" :now="now" @remove="emit('remove', $event)" />
        </div>
      </TransitionGroup>

      <!-- Empty state -->
      <Transition name="fade">
        <div v-if="!items.length" class="absolute inset-0 grid place-items-center px-6 md:pb-24">
          <div class="flex max-w-sm flex-col items-center text-center">
            <div class="empty-orb relative mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-white/[0.03]">
              <UploadCloud class="h-8 w-8 text-violet-300" />
            </div>
            <p class="text-base font-semibold text-white">The box is empty</p>
            <p class="mt-1.5 text-sm text-zinc-500">Pair another device with the QR code or room code, then drop files, paste a link or image, or type a note. Everything is end-to-end encrypted.</p>
            <button type="button" class="btn-ghost mt-5" @click="emit('pick-files')">
              <Plus class="h-3.5 w-3.5" /> Choose files
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Quick-drop input bar (tablet / desktop) -->
    <form
      class="absolute inset-x-4 bottom-4 hidden items-center gap-2 rounded-2xl p-2 md:inset-x-6 md:bottom-5 md:flex glass-strong shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] transition focus-within:border-violet-glow/50 focus-within:shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_20px_50px_-20px_rgba(139,92,246,0.5)]"
      @submit.prevent="submit"
    >
      <button type="button" class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:border-violet-glow/50 hover:text-white" aria-label="Attach files" @click="emit('pick-files')">
        <Plus class="h-4 w-4" />
      </button>
      <div class="relative flex min-w-0 flex-1 items-center">
        <input
          v-model="draft"
          type="text"
          class="peer h-10 w-full bg-transparent px-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          placeholder="Type a note, paste a URL, or press Ctrl+V anywhere..."
          aria-label="Quick drop text or URL"
          data-quick-drop
        />
        <Transition name="fade">
          <span
            v-if="draftKind"
            class="pointer-events-none ml-2 inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            :class="draftKind === 'link' ? 'border-cyan-glow/30 text-cyan-300' : 'border-violet-glow/30 text-violet-300'"
          >
            <component :is="draftKind === 'link' ? Link2 : Terminal" class="h-3 w-3" />
            {{ draftKind === 'link' ? 'Link' : 'Text' }}
          </span>
        </Transition>
      </div>
      <button type="submit" class="btn-primary h-10 shrink-0 rounded-xl px-4 text-sm" :disabled="!draftKind">
        Beam <ArrowUp class="h-4 w-4" />
      </button>
    </form>

    <!-- Drag overlay -->
    <Transition name="fade">
      <div v-if="isDragging" class="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-[20px] border-2 border-dashed border-violet-glow/70 bg-violet-glow/[0.06] backdrop-blur-[2px]">
        <div class="flex flex-col items-center gap-3">
          <div class="grid h-16 w-16 animate-bounce place-items-center rounded-2xl bg-violet-glow/20 shadow-[0_0_40px_-4px_rgba(139,92,246,0.8)]">
            <UploadCloud class="h-7 w-7 text-white" />
          </div>
          <p class="text-sm font-semibold text-white">Release to beam {{ dragCount > 1 ? `${dragCount} files` : 'into the box' }}</p>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.magic-box {
  background:
    radial-gradient(120% 80% at 50% 0%, rgb(124 58 237 / 0.1), transparent 60%),
    radial-gradient(80% 60% at 100% 100%, rgb(6 182 212 / 0.06), transparent 60%),
    #0a0a0c;
  border: 1px solid rgb(255 255 255 / 0.08);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    0 40px 120px -60px rgb(124 58 237 / 0.35);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.magic-box:hover {
  border-color: rgb(255 255 255 / 0.12);
}

.magic-box.is-dragging {
  border-color: rgb(139 92 246 / 0.9);
  box-shadow:
    0 0 0 4px rgb(139 92 246 / 0.15),
    0 0 80px -10px rgb(139 92 246 / 0.6),
    inset 0 0 80px -20px rgb(139 92 246 / 0.35);
}

.magic-box.is-pulsing {
  animation: cyan-pulse 1.4s ease-out;
}

@keyframes cyan-pulse {
  0% {
    border-color: rgb(6 182 212 / 1);
    box-shadow:
      0 0 0 0 rgb(6 182 212 / 0.55),
      0 0 60px -10px rgb(6 182 212 / 0.7),
      inset 0 0 60px -20px rgb(6 182 212 / 0.4);
  }
  70% {
    border-color: rgb(6 182 212 / 0.5);
    box-shadow:
      0 0 0 14px rgb(6 182 212 / 0),
      0 0 60px -10px rgb(6 182 212 / 0.25),
      inset 0 0 60px -20px rgb(6 182 212 / 0.1);
  }
  100% {
    border-color: rgb(255 255 255 / 0.08);
  }
}

.grid-texture {
  background-image:
    linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse at 50% 30%, black 20%, transparent 75%);
}

.empty-orb::before {
  content: '';
  position: absolute;
  inset: -14px;
  border-radius: 28px;
  border: 1px dashed rgb(139 92 246 / 0.35);
  animation: spin 18s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* TransitionGroup: scale-in entrance, soft exit, smooth reflow. */
.card-enter-active {
  transition:
    opacity 0.5s ease,
    transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.5s ease;
}
.card-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease,
    filter 0.25s ease;
}
.card-enter-from {
  opacity: 0;
  transform: scale(0.82) translateY(18px);
  filter: blur(8px);
}
.card-leave-to {
  opacity: 0;
  transform: scale(0.9);
  filter: blur(4px);
}
.card-move {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
