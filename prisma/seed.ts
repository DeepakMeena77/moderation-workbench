import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { DEMO_ACCOUNTS } from '../src/server/auth/demo';

// Seeds the six demo users (docs/04-build-plan.md S1). Idempotent: a re-run resets each account's name, role
// and password, so it also repairs a demo role that was changed by hand. Later slices add policy v1 and
// content. Variables already set in the environment win over .env, so
// `DATABASE_URL=<production url> npm run db:seed` seeds production (docs/02-system-design.md sec. 13).

const envSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  // Read only here, never by the app: the app stores and compares bcrypt hashes.
  DEMO_PASSWORD: z.string().min(12),
});

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(', ');
    throw new Error(
      `Seed needs ${names}: DATABASE_URL must be a postgres URL and DEMO_PASSWORD at least 12 characters. ` +
        'See .env.example.',
    );
  }
  const { DATABASE_URL, DEMO_PASSWORD } = parsed.data;
  const target = new URL(DATABASE_URL);
  console.log(`Seeding ${target.hostname}${target.pathname}`);

  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const account of DEMO_ACCOUNTS) {
      const data = { name: account.name, role: account.role, passwordHash };
      await prisma.user.upsert({
        where: { email: account.email },
        create: { email: account.email, ...data },
        update: data,
      });
      console.log(`  ${account.email} (${account.role})`);
    }
    console.log(`Seeded ${DEMO_ACCOUNTS.length} demo users.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
