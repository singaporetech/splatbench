import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// reuse the app's define block so tests see the same build provenance constants
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/lib/**/*.ts'],
        exclude: ['src/lib/export/**', 'src/lib/profiling/**'],
      },
    },
  }),
);
