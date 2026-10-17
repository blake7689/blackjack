import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5166',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/_tests_/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/**/_tests_/**', 'src/**/*.test.{js,jsx}'],
      // Blake's decision: 100% lines and branches; only the main.jsx bootstrap is excluded.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
