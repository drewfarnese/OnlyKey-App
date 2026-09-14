import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { version as appVersion } from './package.json';

// Content Security Policy for the packaged renderer. Only applied to the
// production build: the Vite dev server relies on inline scripts and HMR.
// connect-src covers the GitHub hosts used by the app and firmware update
// checks (release assets redirect to *.githubusercontent.com).
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com https://github.com https://*.githubusercontent.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'onlykey-production-csp',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP },
            injectTo: 'head-prepend',
          },
        ],
      },
    },
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
  base: './', // Assets are loaded from file:// by the Electron shell
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // sshpk is required in the Electron preload (Node context); bundling it
      // for the renderer breaks util.inherits/crypto.
      external: ['sshpk'],
    },
  },
});
