import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [react(), mkcert()],
  server: {
    allowedHosts: ['brendan-nonspheric-lenora.ngrok-free.dev', 'localhost'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    port: 5173,
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => console.log('Proxy error:', err))
          proxy.on('proxyReq', (_, req) => console.log('Proxy req:', req.method, req.url))
          proxy.on('proxyRes', (res, req) => {
            if (res.statusCode >= 400) console.log('Proxy res error:', res.statusCode, req.url)
          })
        }
      }
    }
  },
  define: {
    global: 'globalThis',
  }
})
