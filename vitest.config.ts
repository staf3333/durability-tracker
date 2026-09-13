import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // the API is a separate package with its own runner and Node environment
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['api/**', 'node_modules/**', 'dist/**'],
  },
});
