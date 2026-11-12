import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify('test'),
    __DEPLOY_ENV__: JSON.stringify('production'),
    __STAGING_HOST__: JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // the API is a separate package with its own runner and Node environment
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['api/**', 'node_modules/**', 'dist/**'],
  },
});
