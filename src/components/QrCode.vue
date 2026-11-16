<script setup>
import { computed } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  value: { type: String, required: true },
})

const qr = computed(() => {
  const { modules } = QRCode.create(props.value, { errorCorrectionLevel: 'M' })
  let d = ''
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`
    }
  }
  return { size: modules.size, d }
})
</script>

<template>
  <svg
    :viewBox="`-2 -2 ${qr.size + 4} ${qr.size + 4}`"
    class="block h-full w-full rounded-md bg-zinc-100"
    shape-rendering="crispEdges"
    role="img"
    aria-label="QR code to join this room"
  >
    <path :d="qr.d" fill="#0a0a0c" />
  </svg>
</template>
