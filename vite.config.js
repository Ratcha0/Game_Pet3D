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
    },
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

