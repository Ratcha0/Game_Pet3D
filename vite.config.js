import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
      },
      output: {
        manualChunks: {
          'three-vendor': ['three'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'model-viewer-vendor': ['@google/model-viewer']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  resolve: {
    dedupe: ['three']
  },
  server: {
    port: 5173,
    open: true,
    allowedHosts: [
        'unextirpated-margy-overaptly.ngrok-free.dev',
        '.ngrok-free.dev'
    ],
    strictPort: true
  }
});
