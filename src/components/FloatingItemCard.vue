<script setup>
import { computed, ref } from 'vue'
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileArchive, FileAudio, FileText, FileVideo, File as FileIcon, Globe, ImageIcon, Link2, Terminal, X } from 'lucide-vue-next'
import { copyImage, copyText, downloadItem } from '../utils/clipboard'
import { fileExtension, formatBytes, timeAgo } from '../utils/format'
import { highlight } from '../utils/highlight'
import { useToast } from '../composables/useToast'

const props = defineProps({
  item: { type: Object, required: true },
  now: { type: Number, required: true },
})
const emit = defineEmits(['remove'])
const { notify } = useToast()

// Stable pseudo-random motion params derived from the id so cards don't re-sync on reorder.
const seed = computed(() => [...props.item.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7))
const motion = computed(() => ({
  '--float-dur': `${5.5 + (seed.value % 7) * 0.55}s`,
  '--float-delay': `-${(seed.value % 13) * 0.45}s`,
  '--float-amp': `${-5 - (seed.value % 4)}px`,
  '--tilt': `${((seed.value % 9) - 4) * 0.14}deg`,
}))

const meta = {
  link: { label: 'Link', icon: Link2, accent: 'text-cyan-300 bg-cyan-glow/10 border-cyan-glow/25' },
  image: { label: 'Image', icon: ImageIcon, accent: 'text-pink-300 bg-pink-500/10 border-pink-400/25' },
  text: { label: 'Snippet', icon: Terminal, accent: 'text-violet-300 bg-violet-glow/10 border-violet-glow/25' },
  file: { label: 'File', icon: FileIcon, accent: 'text-amber-300 bg-amber-500/10 border-amber-400/25' },
}

const toneClass = {
  violet: 'bg-violet-glow',
  cyan: 'bg-cyan-glow',
  emerald: 'bg-emerald-glow',
}

const ext = computed(() => fileExtension(props.item.name))
const extStyle = computed(() => {
  const e = ext.value
  if (e === 'PDF') return { icon: FileText, cls: 'from-rose-500/25 to-rose-500/5 text-rose-300 border-rose-400/30' }
  if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(e)) return { icon: FileArchive, cls: 'from-amber-500/25 to-amber-500/5 text-amber-300 border-amber-400/30' }
  if (['MP3', 'M4A', 'WAV', 'FLAC', 'OGG'].includes(e)) return { icon: FileAudio, cls: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300 border-emerald-400/30' }
  if (['MP4', 'MOV', 'MKV', 'WEBM'].includes(e)) return { icon: FileVideo, cls: 'from-sky-500/25 to-sky-500/5 text-sky-300 border-sky-400/30' }
  return { icon: FileIcon, cls: 'from-violet-500/25 to-violet-500/5 text-violet-300 border-violet-400/30' }
})

const highlighted = computed(() => (props.item.type === 'text' ? highlight(props.item.content) : ''))
const lineCount = computed(() => (props.item.type === 'text' ? props.item.content.split('\n').length : 0))

const faviconFailed = ref(false)
const dims = ref('')

const transferring = computed(() => props.item.status === 'sending' || props.item.status === 'receiving')
// Received files have no payload until the transfer finishes.
const ready = computed(() => props.item.status !== 'receiving' && props.item.status !== 'failed')
const percent = computed(() => Math.round((props.item.progress ?? 0) * 100))

const flash = ref('')
let flashTimer = null
function confirm(key) {
  flash.value = key
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = ''), 2000)
}

async function onCopyText() {
  const value = props.item.type === 'link' ? props.item.url : props.item.content
  if (await copyText(value)) confirm('copy')
  else notify('Clipboard unavailable', 'rose')
}

async function onCopyImage() {
  if (await copyImage(props.item.src)) confirm('copy-image')
  else notify('Image clipboard not supported in this browser', 'rose')
}

async function onDownload() {
  try {
    await downloadItem(props.item)
    confirm('download')
  } catch {
    notify('Download failed', 'rose')
  }
}
</script>

<template>
  <article class="card-float group relative" :style="motion">
    <div
      class="card-surface relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300 ease-out group-hover:scale-[1.02] group-hover:border-violet-glow/40 group-hover:shadow-[0_24px_60px_-20px_rgba(139,92,246,0.45),0_0_0_1px_rgba(139,92,246,0.15)]"
      :class="item.incoming && 'incoming'"
    >
      <!-- Top sheen -->
      <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <!-- Header -->
      <header class="flex items-center gap-2 px-3.5 pt-3.5">
        <span class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" :class="meta[item.type].accent">
          <component :is="meta[item.type].icon" class="h-3 w-3" />
          {{ meta[item.type].label }}
        </span>
        <span class="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full border border-white/[0.07] bg-white/[0.03] py-0.5 pl-1.5 pr-2 text-[10.5px] text-zinc-300">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="toneClass[item.sender.tone]" />
          <span class="truncate">{{ item.sender.name }}<span class="hidden text-zinc-500 min-[420px]:inline"> · {{ item.sender.device }}</span></span>
        </span>
        <time class="ml-auto shrink-0 pr-6 font-mono text-[10px] text-zinc-500">{{ timeAgo(item.createdAt, now) }}</time>
      </header>

      <button
        type="button"
        class="absolute right-2 top-2.5 grid h-6 w-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label="Dismiss item"
        @click="emit('remove', item.id)"
      >
        <X class="h-3.5 w-3.5" />
      </button>

      <!-- Body -->
      <div class="flex-1 px-3.5 py-3">
        <!-- LINK -->
        <template v-if="item.type === 'link'">
          <div class="flex items-start gap-3">
            <div class="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-br from-cyan-glow/20 to-violet-glow/10">
              <img
                v-if="!faviconFailed"
                :src="`https://www.google.com/s2/favicons?domain=${item.host}&sz=64`"
                :alt="`${item.host} favicon`"
                class="h-5 w-5"
                loading="lazy"
                @error="faviconFailed = true"
              />
              <Globe v-else class="h-5 w-5 text-cyan-300" />
            </div>
            <div class="min-w-0">
              <p class="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{{ item.title }}</p>
              <p class="mt-1 truncate font-mono text-[11px] text-cyan-300/70" :title="item.url">{{ item.url.replace(/^https?:\/\//, '') }}</p>
            </div>
          </div>
        </template>

        <!-- IMAGE -->
        <template v-else-if="item.type === 'image'">
          <div class="relative overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
            <img
              v-if="item.src"
              :src="item.src"
              :alt="item.name"
              class="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              draggable="false"
              @load="(e) => (dims = `${e.target.naturalWidth}×${e.target.naturalHeight}`)"
            />
            <div v-else class="grid aspect-[16/10] w-full place-items-center bg-gradient-to-br from-pink-500/10 via-violet-glow/5 to-cyan-glow/10">
              <ImageIcon class="h-8 w-8 animate-pulse text-zinc-600" />
            </div>
            <span v-if="dims" class="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 backdrop-blur">{{ dims }}</span>
          </div>
          <div class="mt-2.5 flex items-center justify-between gap-2">
            <p class="truncate text-sm font-medium text-zinc-100" :title="item.name">{{ item.name }}</p>
            <span class="shrink-0 font-mono text-[11px] text-zinc-500">{{ formatBytes(item.size) }}</span>
          </div>
        </template>

        <!-- TEXT / CODE -->
        <template v-else-if="item.type === 'text'">
          <div class="relative rounded-xl border border-white/[0.06] bg-black/50">
            <div class="flex items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5">
              <span class="h-2 w-2 rounded-full bg-zinc-700" />
              <span class="h-2 w-2 rounded-full bg-zinc-700" />
              <span class="h-2 w-2 rounded-full bg-zinc-700" />
            </div>
            <pre class="max-h-44 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12px] leading-relaxed text-zinc-300"><code v-html="highlighted" /></pre>
          </div>
          <p class="mt-2 font-mono text-[10.5px] text-zinc-500">
            {{ item.content.length }} chars<span v-if="lineCount > 1"> · {{ lineCount }} lines</span>
          </p>
        </template>

        <!-- FILE -->
        <template v-else>
          <div class="flex items-center gap-3">
            <div class="relative grid h-14 w-12 shrink-0 place-items-center rounded-lg border bg-gradient-to-b" :class="extStyle.cls">
              <component :is="extStyle.icon" class="h-5 w-5 opacity-80" />
              <span class="absolute -bottom-1.5 rounded border border-white/10 bg-onyx px-1 font-mono text-[9px] font-bold tracking-wider">{{ ext }}</span>
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-zinc-100" :title="item.name">{{ item.name }}</p>
              <p class="mt-0.5 font-mono text-[11px] text-zinc-500">{{ formatBytes(item.size) }} · {{ item.mime.split('/')[1] || item.mime }}</p>
            </div>
          </div>
        </template>

        <!-- Transfer status -->
        <div v-if="transferring" class="mt-3">
          <div class="mb-1 flex justify-between font-mono text-[10px] text-zinc-500">
            <span>{{ item.status === 'sending' ? 'Encrypting & sending…' : 'Receiving…' }}</span>
            <span>{{ percent }}%</span>
          </div>
          <div class="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div class="h-full rounded-full bg-gradient-to-r from-violet-glow to-cyan-glow transition-[width] duration-200" :style="{ width: `${percent}%` }" />
          </div>
        </div>
        <p v-else-if="item.status === 'failed'" class="mt-3 flex items-center gap-1.5 text-[11px] text-rose-300">
          <AlertTriangle class="h-3.5 w-3.5 shrink-0" /> {{ item.error || 'Transfer failed' }}
        </p>
      </div>

      <!-- Actions -->
      <footer class="flex gap-2 border-t border-white/[0.05] px-3.5 py-2.5">
        <template v-if="item.type === 'link'">
          <a :href="item.url" target="_blank" rel="noopener noreferrer" class="btn-primary h-9 flex-1 md:h-8">
            <ExternalLink class="h-3.5 w-3.5" /> Open Link
          </a>
          <button type="button" class="btn-ghost h-9 flex-1 md:h-8" :class="flash === 'copy' && '!border-emerald-glow/50 !text-emerald-300'" @click="onCopyText">
            <component :is="flash === 'copy' ? Check : Copy" class="h-3.5 w-3.5" />
            {{ flash === 'copy' ? 'Copied ✓' : 'Copy URL' }}
          </button>
        </template>

        <template v-else-if="item.type === 'image'">
          <button type="button" class="btn-primary h-9 flex-1 md:h-8" :disabled="!ready" @click="onDownload">
            <component :is="flash === 'download' ? Check : Download" class="h-3.5 w-3.5" />
            {{ flash === 'download' ? 'Saved ✓' : 'Download' }}
          </button>
          <button type="button" class="btn-ghost h-9 flex-1 md:h-8" :disabled="!ready" :class="flash === 'copy-image' && '!border-emerald-glow/50 !text-emerald-300'" @click="onCopyImage">
            <component :is="flash === 'copy-image' ? Check : Copy" class="h-3.5 w-3.5" />
            {{ flash === 'copy-image' ? 'Copied ✓' : 'Copy Image' }}
          </button>
        </template>

        <template v-else-if="item.type === 'text'">
          <button
            type="button"
            class="h-9 flex-1 md:h-8"
            :class="flash === 'copy' ? 'btn-ghost !border-emerald-glow/50 !bg-emerald-glow/10 !text-emerald-300' : 'btn-primary'"
            @click="onCopyText"
          >
            <component :is="flash === 'copy' ? Check : Copy" class="h-3.5 w-3.5" />
            {{ flash === 'copy' ? 'Copied ✓' : '1-Click Copy' }}
          </button>
        </template>

        <template v-else>
          <button type="button" class="btn-primary h-9 flex-1 md:h-8" :disabled="!ready" @click="onDownload">
            <component :is="flash === 'download' ? Check : Download" class="h-3.5 w-3.5" />
            {{ flash === 'download' ? 'Saved ✓' : 'Download' }}
          </button>
        </template>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.card-float {
  animation: levitate var(--float-dur, 6s) ease-in-out var(--float-delay, 0s) infinite;
  transform: rotate(var(--tilt, 0deg));
  will-change: transform;
}

.card-float:hover,
.card-float:focus-within {
  animation-play-state: paused;
}

@keyframes levitate {
  0%,
  100% {
    transform: translateY(0) rotate(var(--tilt, 0deg));
  }
  50% {
    transform: translateY(var(--float-amp, -6px)) rotate(calc(var(--tilt, 0deg) * -1));
  }
}

.card-surface {
  background: linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.02));
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border: 1px solid rgb(255 255 255 / 0.08);
  box-shadow:
    0 18px 40px -24px rgb(0 0 0 / 0.9),
    inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.card-surface.incoming {
  animation: incoming-glow 1.8s ease-out 1;
}

@keyframes incoming-glow {
  0% {
    border-color: rgb(6 182 212 / 0.9);
    box-shadow: 0 0 0 1px rgb(6 182 212 / 0.6), 0 0 40px -6px rgb(6 182 212 / 0.7);
  }
  100% {
    border-color: rgb(255 255 255 / 0.08);
    box-shadow: 0 18px 40px -24px rgb(0 0 0 / 0.9);
  }
}

@media (max-width: 767px) {
  .card-float {
    --tilt: 0deg !important;
  }
}
</style>
