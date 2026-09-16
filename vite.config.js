import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['framer-motion', 'gsap', 'lenis'],
        },
      },
    },
  },
})
