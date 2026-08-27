import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      proxy: {
        // Forward /api/* to the backend. Backend routes are served WITHOUT the
        // `/api` prefix (e.g. `/forms`, `/auth/login`) — the prefix exists
        // only at the app/proxy layer — so we strip it before forwarding.
        // Target defaults to a local SAM API; override with the deployed AWS
        // API via VITE_API_BASE (see .env.example and local/.env).
        '/api': {
          target: env.VITE_API_BASE || 'http://127.0.0.1:3000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      }
    },
  }
})
