/// <reference types="vitest/config" />
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
  test: {
    // Tests run against the mock transport, so a test can call api.ts the way a
    // component does and the real request builder, error unwrapping and SSE
    // parsing stay on the tested path. Without this the client falls through to
    // a network fetch and every test fails on a relative URL.
    env: { VITE_MOCK: '1' },
    // Node has no localStorage; without this every persistence path in the app
    // silently no-ops in tests and is never actually covered.
    setupFiles: ['./src/test-setup.ts'],
  },
})
