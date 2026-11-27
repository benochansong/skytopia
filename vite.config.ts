import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/online': { target: 'http://127.0.0.1:8787', ws: true } } },
  test: {
    maxWorkers: process.platform === 'win32' ? 1 : 2,
    include: ['src/tests/**/*.test.ts', 'server/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], scene: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
