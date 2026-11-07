import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Integration tests run against a real database and, from S1 on, empty every table before each test. They
// load only .env.test (never .env) and refuse to run unless TEST_DATABASE=true, so a mis-pointed URL can
// never wipe the dev or production database (docs/05-test-plan.md sec. 3). In CI the variables come from
// the workflow instead of a file. Variables already set in the environment take precedence over the file.
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
