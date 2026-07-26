import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The precedent search that used to live here as dev middleware has moved to
// the real backend (server/). For local dev, run the server (`npm run dev` in
// server/) and Vite proxies /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
