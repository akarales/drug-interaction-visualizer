import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: {
      // API_URL lets the e2e run point the dev/preview server at a test API
      '/api': { target: process.env.API_URL ?? 'http://localhost:8001', changeOrigin: true },
    },
  },
});
