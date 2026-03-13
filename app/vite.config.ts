import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,webmanifest,woff2}'],
        // Tile caching is handled by the app itself, not workbox
        runtimeCaching: []
      },
      manifest: {
        name: 'Field Mapper',
        short_name: 'FieldMapper',
        description: 'Offline-friendly field mapping app.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f2f5fb',
        theme_color: '#1f2d3a',
        orientation: 'portrait',
        icons: [
          {
            src: './icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: './icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
