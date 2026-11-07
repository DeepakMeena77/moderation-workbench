// The six seeded demo accounts (docs/01-requirements.md sec. 2). Shared by prisma/seed.ts, the demo sign-in
// service and the sign-in page cards, so the three can never disagree. No imports: the seed runs it with tsx.

export const DEMO_ACCOUNTS = [
  {
    key: 'author',
    email: 'author@example.com',
    name: 'Asha Rao',
    role: 'author',
    hint: 'write a post, then appeal a decision',
  },
  {
    key: 'author2',
    email: 'author2@example.com',
    name: 'Ben Ortiz',
    role: 'author',
    hint: "report another author's post",
  },
  {
    key: 'moderator',
    email: 'moderator@example.com',
    name: 'Chen Wei',
    role: 'moderator',
    hint: 'decide the top case',
  },
  {
    key: 'senior',
    email: 'senior@example.com',
    name: 'Dana Okafor',
    role: 'senior_moderator',
    hint: 'decide cases and review appeals',
  },
  {
    key: 'senior2',
    email: 'senior2@example.com',
    name: 'Elif Demir',
    role: 'senior_moderator',
    hint: "review an appeal of another senior's decision",
  },
  {
    key: 'admin',
    email: 'admin@example.com',
    name: 'Femi Adeyemi',
    role: 'admin',
    hint: 'publish a policy version',
  },
] as const;

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
export type DemoAccountKey = DemoAccount['key'];

export const DEMO_ACCOUNT_KEYS = DEMO_ACCOUNTS.map((account) => account.key) as [DemoAccountKey, ...DemoAccountKey[]];
