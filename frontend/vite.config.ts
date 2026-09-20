import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev` /api and /ws are proxied to the Fastify backend.
// In production the backend serves the built assets from dist/.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          grid: ['react-grid-layout']
        }
      }
    }
  }
});
