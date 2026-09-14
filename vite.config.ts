import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { version as appVersion } from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './', // Important for NW.js to find assets relative to the file
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // sshpk must load via NW require() — bundling breaks util.inherits/crypto.
      external: ['sshpk'],
    },
  },
});
