<script setup>
import { computed, ref } from 'vue'
import {
  AlertTriangle,
  Check,
  Copy,
  Laptop,
  Link2,
  Loader2,
  LogIn,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Users,
} from 'lucide-vue-next'
import QrCode from './QrCode.vue'
import { useMagicBox } from '../composables/useMagicBox'
import { useToast } from '../composables/useToast'
import { copyText } from '../utils/clipboard'

defineProps({
  compact: { type: Boolean, default: false },
})

const { device, room, peers, shareUrl, createRoom, joinRoom } = useMagicBox()
const { notify } = useToast()

const copied = ref('')
let copiedTimer = null
async function copy(kind) {
  const ok = await copyText(kind === 'code' ? room.code.replace('-', '') : shareUrl.value)
  if (!ok) return notify('Clipboard unavailable', 'rose')
  copied.value = kind
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = ''), 2000)
}

const joinCode = ref('')
const joining = ref(false)
async function submitJoin() {
  if (joining.value) return
  joining.value = true
  try {
    if (await joinRoom(joinCode.value)) joinCode.value = ''
  } finally {
    joining.value = false
  }
}

async function newRoom() {
  if (await createRoom()) notify('New room created', 'violet')
}

const isLocalhost = computed(() => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
const busy = computed(() => ['idle', 'creating', 'connecting', 'reconnecting'].includes(room.status))
const kindIcon = { phone: Smartphone, tablet: Tablet, laptop: Laptop }
</script>

<template>
  <aside class="grid content-start gap-4" :class="!compact && 'md:grid-cols-2 lg:grid-cols-1'">
    <!-- Current device -->
    <section v-if="!compact" class="glass relative overflow-hidden rounded-2xl p-4 md:col-span-2 lg:col-span-1">
      <div class="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-glow/20 blur-3xl" />
      <p class="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">This device</p>
      <div class="flex items-center gap-3">
        <div class="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-deep via-violet-glow to-cyan-glow text-sm font-bold text-white shadow-[0_0_24px_-6px_rgba(139,92,246,0.9)]">
          {{ device.name.split(' ').map((w) => w[0]).join('') }}
          <span
            class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-onyx"
            :class="room.status === 'online' ? 'bg-emerald-glow' : room.status === 'error' ? 'bg-rose-500' : 'bg-amber-400'"
          />
        </div>
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold text-white">{{ device.name }}</p>
          <p class="truncate font-mono text-xs text-zinc-400">{{ device.os }} · {{ device.browser }}</p>
        </div>
        <span class="ml-auto inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] font-medium text-zinc-400">
          <ShieldCheck class="h-3 w-3 text-emerald-400" /> Ephemeral
        </span>
      </div>
    </section>

    <!-- Pairing -->
    <section class="glass rounded-2xl p-4">
      <div class="mb-4 flex items-center justify-between">
        <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Instant pairing</p>
        <button type="button" class="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-violet-300 disabled:opacity-40" :disabled="busy" @click="newRoom">
          <RefreshCw class="h-3 w-3" /> New room
        </button>
      </div>

      <!-- Server unreachable -->
      <div v-if="room.status === 'error'" class="flex flex-col items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-center">
        <AlertTriangle class="h-5 w-5 text-rose-300" />
        <p class="text-sm text-rose-200">{{ room.error }}</p>
        <button type="button" class="btn-ghost" @click="newRoom"><RefreshCw class="h-3.5 w-3.5" /> Try again</button>
      </div>

      <div v-else class="flex flex-col items-center gap-4" :class="compact && 'sm:flex-row sm:items-center'">
        <!-- QR with corner brackets -->
        <div class="relative aspect-square shrink-0 p-3" :class="compact ? 'w-40' : 'w-44 lg:w-48'">
          <span class="corner left-0 top-0 rounded-tl-xl border-l-2 border-t-2" />
          <span class="corner right-0 top-0 rounded-tr-xl border-r-2 border-t-2" />
          <span class="corner bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2" />
          <span class="corner bottom-0 right-0 rounded-br-xl border-b-2 border-r-2" />
          <div class="relative grid h-full w-full place-items-center overflow-hidden rounded-lg bg-onyx/80">
            <QrCode v-if="shareUrl" :value="shareUrl" />
            <Loader2 v-else class="h-6 w-6 animate-spin text-zinc-500" />
            <div v-if="shareUrl" class="scan-line" />
          </div>
        </div>

        <div class="flex w-full flex-col items-center gap-2" :class="compact && 'sm:items-start'">
          <p class="flex items-center gap-1.5 text-xs text-zinc-500"><ScanLine class="h-3.5 w-3.5" /> Scan, or enter the code on the other device</p>
          <div class="relative">
            <button
              type="button"
              class="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/40 px-4 py-2.5 transition hover:border-violet-glow/60 hover:shadow-[0_0_24px_-8px_rgba(139,92,246,0.8)] disabled:pointer-events-none"
              :disabled="!room.code"
              :aria-label="`Copy room code ${room.code}`"
              @click="copy('code')"
            >
              <span class="font-mono text-[28px] font-semibold leading-none tracking-[0.12em] text-white">{{ room.code || '———-———' }}</span>
              <span class="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] transition group-hover:border-violet-glow/50" :class="copied === 'code' ? 'text-emerald-400' : 'text-zinc-400 group-hover:text-white'">
                <Check v-if="copied === 'code'" class="h-4 w-4" />
                <Copy v-else class="h-4 w-4" />
              </span>
            </button>
            <Transition name="badge">
              <span v-if="copied" class="absolute -top-3 left-1/2 -ml-7 w-14 rounded-full border border-emerald-glow/40 bg-emerald-950/90 py-0.5 text-center text-[10px] font-semibold text-emerald-300 shadow-[0_0_16px_-4px_#10B981]">
                Copied!
              </span>
            </Transition>
          </div>
          <button type="button" class="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-cyan-300 disabled:opacity-40" :disabled="!shareUrl" @click="copy('link')">
            <Link2 class="h-3 w-3" /> Copy invite link
          </button>
        </div>
      </div>

      <p v-if="isLocalhost && room.status !== 'error'" class="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
        This page is on <span class="font-mono">localhost</span>, so the QR only works on this computer. Run
        <span class="font-mono">npm run dev:lan</span> and open the Network URL to pair phones and other devices.
      </p>

      <!-- Join by code -->
      <form class="mt-4 flex gap-2 border-t border-white/[0.06] pt-4" @submit.prevent="submitJoin">
        <input
          v-model="joinCode"
          inputmode="numeric"
          autocomplete="off"
          maxlength="7"
          placeholder="Have a code? 123-456"
          aria-label="Room code to join"
          class="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 font-mono text-sm tracking-wider text-zinc-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-600 focus:border-violet-glow/60 focus:outline-none"
        />
        <button type="submit" class="btn-ghost h-9" :disabled="joining || joinCode.replace(/\D/g, '').length !== 6">
          <Loader2 v-if="joining" class="h-3.5 w-3.5 animate-spin" />
          <LogIn v-else class="h-3.5 w-3.5" /> Join
        </button>
      </form>
    </section>

    <!-- Devices in this room -->
    <section class="glass rounded-2xl p-4">
      <div class="mb-3 flex items-center gap-2">
        <div class="radar relative grid h-6 w-6 place-items-center rounded-full border border-cyan-glow/30">
          <Users class="h-3 w-3 text-cyan-300" />
        </div>
        <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Devices in this room</p>
        <span class="ml-auto font-mono text-[10px] text-zinc-600">{{ peers.length }} joined</span>
      </div>

      <p v-if="!peers.length" class="rounded-xl border border-dashed border-white/[0.08] px-3 py-5 text-center text-xs leading-relaxed text-zinc-500">
        No other devices yet.<br />Scan the QR code or enter the room code on another device.
      </p>

      <ul v-else class="space-y-2">
        <li
          v-for="peer in peers"
          :key="peer.id"
          class="rounded-xl border p-2.5 transition"
          :class="{
            'border-emerald-glow/20 bg-emerald-glow/[0.04]': peer.state === 'secure' && peer.verified,
            'border-amber-400/20 bg-amber-400/[0.03]': peer.state === 'secure' && !peer.verified,
            'border-rose-500/25 bg-rose-500/[0.04]': peer.state === 'failed',
            'border-white/[0.06] bg-white/[0.02]': peer.state === 'connecting' || peer.state === 'securing',
          }"
        >
          <div class="flex items-center gap-3">
            <div class="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-black/30">
              <component :is="kindIcon[peer.kind]" class="h-4 w-4" :class="peer.state === 'secure' ? 'text-emerald-300' : 'text-zinc-400'" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-100">{{ peer.name }}</p>
              <p class="truncate text-[11px] text-zinc-500">{{ peer.device }}</p>
            </div>
            <span
              class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium"
              :class="{
                'border-emerald-glow/30 bg-emerald-glow/10 text-emerald-300': peer.state === 'secure' && peer.verified,
                'border-amber-400/30 bg-amber-400/10 text-amber-200': peer.state === 'secure' && !peer.verified,
                'border-rose-500/30 bg-rose-500/10 text-rose-300': peer.state === 'failed',
                'border-violet-glow/30 text-violet-300': peer.state === 'connecting' || peer.state === 'securing',
              }"
            >
              <template v-if="peer.state === 'secure' && peer.verified"><ShieldCheck class="h-3 w-3" /> Verified</template>
              <template v-else-if="peer.state === 'secure'"><ShieldAlert class="h-3 w-3" /> Encrypted</template>
              <template v-else-if="peer.state === 'failed'"><AlertTriangle class="h-3 w-3" /> Failed</template>
              <template v-else><Loader2 class="h-3 w-3 animate-spin" /> {{ peer.state === 'securing' ? 'Securing…' : 'Connecting…' }}</template>
            </span>
          </div>

          <div v-if="peer.state === 'secure' && !peer.verified" class="mt-2.5 rounded-lg border border-amber-400/15 bg-black/30 px-3 py-2">
            <p class="flex items-center justify-between gap-2">
              <span class="text-[11px] text-amber-200/80">Safety code</span>
              <span class="text-lg tracking-[0.2em]" :aria-label="`Safety code ${peer.sas.join(' ')}`">{{ peer.sas.join('') }}</span>
            </p>
            <p class="mt-1 text-[10.5px] leading-snug text-zinc-500">Joined by code, so check this matches on {{ peer.name }}. If it doesn't, someone may be intercepting — leave the room.</p>
          </div>
          <p v-if="peer.state === 'failed' && peer.error" class="mt-2 text-[11px] text-rose-300/80">{{ peer.error }}</p>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: rgb(139 92 246 / 0.8);
  filter: drop-shadow(0 0 6px rgb(139 92 246 / 0.6));
}

.scan-line {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 30%;
  background: linear-gradient(to bottom, transparent, rgb(6 182 212 / 0.12) 85%, rgb(6 182 212 / 0.45));
  border-bottom: 1px solid rgb(6 182 212 / 0.7);
  animation: scan 3.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  pointer-events: none;
}

@keyframes scan {
  0% {
    transform: translateY(-110%);
    opacity: 0;
  }
  15%,
  85% {
    opacity: 1;
  }
  100% {
    transform: translateY(340%);
    opacity: 0;
  }
}

.radar::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9999px;
  border: 1px solid rgb(6 182 212 / 0.6);
  animation: radar 2.4s ease-out infinite;
}

@keyframes radar {
  from {
    transform: scale(1);
    opacity: 0.8;
  }
  to {
    transform: scale(2.2);
    opacity: 0;
  }
}

.badge-enter-active,
.badge-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-enter-from,
.badge-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.85);
}
</style>
