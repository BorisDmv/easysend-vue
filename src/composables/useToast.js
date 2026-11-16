import { ref } from 'vue'

const toasts = ref([])
let seq = 0

export function useToast() {
  function notify(message, tone = 'violet', duration = 2200) {
    const id = ++seq
    toasts.value.push({ id, message, tone })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration)
  }
  return { toasts, notify }
}
