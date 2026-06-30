import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/beacon/',
  server: {
    proxy: {
      '/suggest': 'http://localhost:8787',
    },
  },
})
