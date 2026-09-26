import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['katavti.local'],
    watch: { usePolling: true },
    hmr: { host: 'katavti.local', clientPort: 80 },
    proxy: { '/api': { target: 'http://localhost:3030' } },
  },
})
