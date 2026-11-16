import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const backend = process.env.BACKEND_URL || 'http://localhost:8080'

// `npm run dev:lan` serves over HTTPS on the local network. Phones need HTTPS
// because browsers only expose the Web Crypto API on secure origins.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss(), mode === 'lan' && basicSsl()],
  server: {
    port: 5173,
    host: mode === 'lan' ? true : undefined,
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true },
    },
  },
}))
