import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { DEMO_ACCOUNTS } from '../src/server/auth/demo';
import { policyContentHash, policyFileSchema } from '../src/server/policy/schema';

// Seeds the six demo users (S1) and policy v1 as the active policy (S2). Idempotent: a re-run resets each
// account's name, role and password, so it also repairs a demo role that was changed by hand; policy v1 is
// installed only when no policy exists yet, so a re-run never touches published versions (they are
// immutable) or an active v2. Variables already set in the environment win over .env, so
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
    await seedInitialPolicy(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedInitialPolicy(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.policy.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true, status: true },
  });
  if (existing) {
    console.log(`Policy already installed (latest v${existing.version}, ${existing.status}); left unchanged.`);
    return;
  }
  const file = policyFileSchema.parse(JSON.parse(readFileSync('policies/policy.v1.json', 'utf8')));
  await prisma.policy.create({
    data: {
      version: 1,
      status: 'active',
      clauses: file.clauses,
      notes: file.notes ?? null,
      contentHash: policyContentHash(file.clauses),
    },
  });
  console.log(`Installed policy v1 as active (${file.clauses.length} clauses).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
