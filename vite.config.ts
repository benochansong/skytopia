import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  test: { include: ['src/tests/**/*.test.ts'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], scene: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
