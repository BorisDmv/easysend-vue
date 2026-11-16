<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TopNav from './components/TopNav.vue'
import MagicBoxCanvas from './components/MagicBoxCanvas.vue'
import PairingDock from './components/PairingDock.vue'
import MobileActionDock from './components/MobileActionDock.vue'
import ToastStack from './components/ToastStack.vue'
import { useMagicBox } from './composables/useMagicBox'
import { useToast } from './composables/useToast'

const { items, now, incomingPulse, status, init, addText, addFiles, removeItem, clearBox } = useMagicBox()
const { notify } = useToast()

const pairingOpen = ref(false)
const fileInput = ref(null)

function pickFiles() {
  fileInput.value?.click()
}

function onFileChange(e) {
  addFiles(e.target.files)
  e.target.value = ''
}

function isEditable(el) {
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName))
}

// Global paste: anything pasted outside a text field becomes a card.
function onWindowPaste(e) {
  const cd = e.clipboardData
  if (!cd) return
  const files = Array.from(cd.files || [])
  if (files.length) {
    e.preventDefault()
    addFiles(files)
    return
  }
  const text = cd.getData('text/plain')
  if (!text?.trim()) return
  // Let single-line pastes land in a focused field; multi-line content (code) would be flattened by <input>.
  if (isEditable(e.target) && !text.includes('\n')) return
  e.preventDefault()
  addText(text)
}

// Stop the browser from navigating away when files are dropped outside the box.
function blockStrayDrop(e) {
  if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault()
}

async function tapPaste() {
  try {
    if (navigator.clipboard?.read) {
      const clipItems = await navigator.clipboard.read()
      for (const ci of clipItems) {
        const imageType = ci.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await ci.getType(imageType)
          const ext = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
          addFiles([new File([blob], `pasted-${Date.now()}.${ext}`, { type: imageType })])
          return
        }
      }
      for (const ci of clipItems) {
        if (ci.types.includes('text/plain')) {
          const text = await (await ci.getType('text/plain')).text()
          if (addText(text)) return
        }
      }
      return notify('Clipboard is empty', 'zinc')
    }
    const text = await navigator.clipboard.readText()
    if (!addText(text)) notify('Clipboard is empty', 'zinc')
  } catch {
    notify('Clipboard access denied — long-press the text field to paste', 'rose', 3200)
  }
}

onMounted(() => {
  init()
  window.addEventListener('paste', onWindowPaste)
  window.addEventListener('dragover', blockStrayDrop)
  window.addEventListener('drop', blockStrayDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onWindowPaste)
  window.removeEventListener('dragover', blockStrayDrop)
  window.removeEventListener('drop', blockStrayDrop)
})
</script>

<template>
  <div class="relative min-h-dvh overflow-x-clip bg-obsidian font-sans text-zinc-200">
    <!-- Ambient background -->
    <div class="pointer-events-none fixed inset-0 -z-0" aria-hidden="true">
      <div class="absolute left-1/2 top-[-20%] h-[50vh] w-[80vw] -translate-x-1/2 rounded-full bg-violet-deep/[0.08] blur-[120px]" />
      <div class="absolute bottom-[-20%] right-[-10%] h-[40vh] w-[40vw] rounded-full bg-cyan-glow/[0.05] blur-[120px]" />
    </div>

    <TopNav
      :status="status"
      :pairing-open="pairingOpen"
      @clear="clearBox"
      @toggle-pairing="pairingOpen = !pairingOpen"
    />

    <!-- Mobile collapsible QR / room code -->
    <Transition name="drawer">
      <div v-if="pairingOpen" class="relative z-30 px-4 pt-4 md:hidden">
        <PairingDock compact />
      </div>
    </Transition>

    <main class="relative mx-auto grid max-w-[1600px] gap-5 px-4 pb-40 pt-4 md:px-6 md:pb-8 md:pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)] lg:gap-6">
      <MagicBoxCanvas
        :items="items"
        :now="now"
        :pulse="incomingPulse"
        @files="addFiles"
        @text="addText"
        @remove="removeItem"
        @pick-files="pickFiles"
      />
      <div class="hidden md:block lg:sticky lg:top-[5.5rem] lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
        <PairingDock />
      </div>
    </main>

    <MobileActionDock @pick-files="pickFiles" @tap-paste="tapPaste" @text="addText" />

    <input ref="fileInput" type="file" multiple class="hidden" @change="onFileChange" />

    <ToastStack />
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
