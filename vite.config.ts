import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts'], maxWorkers: 2 },
});
