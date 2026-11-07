import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach } from 'vitest';

// Integration tests run against a real database and empty every table before each test. They load only
// .env.test (never .env) and refuse to run unless TEST_DATABASE=true, so a mis-pointed URL can never wipe
// the dev or production database (docs/05-test-plan.md sec. 3). In CI the variables come from the workflow
// instead of a file. Variables already set in the environment take precedence over the file.
const envFile = resolve(process.cwd(), '.env.test');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

if (process.env.TEST_DATABASE !== 'true') {
  throw new Error(
    'Refusing to run integration tests: TEST_DATABASE is not "true". Point .env.test at the Neon test branch ' +
      'and set TEST_DATABASE=true there (see .env.example and docs/05-test-plan.md sec. 3).',
  );
}

// Imported only now: loading @prisma/client also loads .env into process.env, and a static import here would
// run before .env.test is applied and point the tests at the dev database.
const { getDb } = await import('@/server/db');

beforeEach(async () => {
  const db = getDb();
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await getDb().$disconnect();
});
