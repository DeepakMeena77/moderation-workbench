import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test levels: docs/05-test-plan.md sec. 3. The component project (jsdom) joins in S1.
// The "@/" alias mirrors tsconfig.json paths; it is set here directly so no extra plugin is needed.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          // Unit tests never connect to a database; the URL only satisfies config validation.
          env: { DATABASE_URL: 'postgresql://user:password@localhost:5432/unit', LOG_LEVEL: 'silent' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // One process, so files run one at a time: integration tests share one real database.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
