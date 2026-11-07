import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test levels: docs/05-test-plan.md sec. 3: unit, integration and component (jsdom).
// The "@/" alias mirrors tsconfig.json paths; it is set here directly so no extra plugin is needed.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig.json keeps JSX for Next.js ("preserve"); tests need it compiled with the React 17+ runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          // Unit tests never connect to a database; the URL and the secret only satisfy config validation.
          env: {
            DATABASE_URL: 'postgresql://user:password@localhost:5432/unit',
            SESSION_SECRET: 'unit-test-session-secret-placeholder-000',
            LOG_LEVEL: 'silent',
          },
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
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['tests/components/setup.ts'],
          // jsdom user-event flows can exceed the 5 s default when the machine runs other suites in parallel.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
