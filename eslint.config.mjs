import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Layer rules from docs/02-system-design.md sec. 2: the UI never reaches into server code, and the
// moderation core never reaches the code that changes visibility or resolves cases and appeals (HUM-1).
const serverFromUi = {
  group: ['@/server', '@/server/*', '**/server/*'],
  message: 'Pages and UI call /api through src/ui/api hooks; they never import src/server.',
};
const humanOnlyServices = {
  group: [
    '@/server/services/visibility',
    '@/server/services/decisions',
    '@/server/services/appeals',
    '**/services/visibility',
    '**/services/decisions',
    '**/services/appeals',
  ],
  message: 'HUM-1: AI, rules, moderation and jobs code must never import visibility, decisions or appeals.',
};

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/api/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [serverFromUi] }],
    },
  },
  {
    // The one exception (docs/02-system-design.md sec. 2): layouts and pages check the session and role on
    // the server before they render (SEC-1), through @/server/auth/guards and nothing else.
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    ignores: ['src/app/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:@|\\.\\.?(?:/\\.\\.)*)/server(?:/(?!auth/guards$).*)?$',
              message: 'Layouts and pages may import only @/server/auth/guards from src/server.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/server/ai/**/*.ts',
      'src/server/rules/**/*.ts',
      'src/server/moderation/**/*.ts',
      'src/server/jobs/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [humanOnlyServices] }],
    },
  },
  {
    // scripts/ holds the repository guards: plain Node scripts maintained outside the app's lint setup.
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
