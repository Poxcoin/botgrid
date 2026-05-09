import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Post-build plugin: strips crossorigin attributes from index.html.
// Vite adds crossorigin by default; with Cloudflare proxy the Origin header
// is stripped, so Firefox CORS-checks fail and the JS bundle is blocked.
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    closeBundle() {
      const file = path.resolve(__dirname, '../static/index.html')
      if (!fs.existsSync(file)) return
      const html = fs.readFileSync(file, 'utf8').replace(/ crossorigin/g, '')
      fs.writeFileSync(file, html)
    },
  }
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  build: {
    outDir: '../static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'recharts-lib': ['recharts'],
          'datefns-lib': ['date-fns'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
