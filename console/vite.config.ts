import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // api.ts calls /api so one build works everywhere; nginx proxies it in the
    // container. The dev server needs the same proxy or every call 404s.
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } },
  },
})
