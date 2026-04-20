import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:7071',
        changeOrigin: true,
      },
    },
    headers: {
      'Cache-Control': 'no-store',
    },
    // Pastas sincronizadas (OneDrive, etc.) muitas vezes não emitem eventos de ficheiro — o HMR fica “preso” no CSS/JS antigo.
    watch: {
      usePolling: true,
      interval: 800,
    },
  },
})
