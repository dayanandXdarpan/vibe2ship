import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Prastab',
        short_name: 'Prastab',
        description: 'Civic Empowerment System — One step today, shapes a better tomorrow.',
        theme_color: '#6C63FF',
        background_color: '#0D1117',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        categories: ['utilities', 'social', 'government'],
        shortcuts: [
          {
            name: 'Propose Issue',
            short_name: 'Propose',
            description: 'Propose a new civic issue',
            url: '/report',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-maps-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'gcp-api-cache' }
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'backend-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 300 }
            }
          }
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase/app') || id.includes('firebase/auth')) return 'firebase-core'
          if (id.includes('firebase/firestore') || id.includes('firebase/storage')) return 'firebase-db'
          if (id.includes('firebase/messaging')) return 'firebase-msg'
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'chart'
          if (id.includes('node_modules/leaflet') || id.includes('react-leaflet')) return 'leaflet'
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-ui'
          if (id.includes('react-router-dom') || id.includes('react-router')) return 'vendor-router'
          if (id.includes('zustand')) return 'vendor-store'
          if (id.includes('date-fns')) return 'date'
          if (id.includes('lucide-react')) return 'icons'
        }
      }
    }
  }
})
