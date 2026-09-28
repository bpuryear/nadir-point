import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2022',
    // three.js with the WebGPU renderer is ~920 kB minified (~250 kB gzip) on its own.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        main: 'index.html',
        determinism: 'determinism.html',
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
