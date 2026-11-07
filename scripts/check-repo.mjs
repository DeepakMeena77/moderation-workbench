#!/usr/bin/env node
// Repository guard: only intended files may be tracked, and private terms may not appear in them.
//   node scripts/check-repo.mjs            check every tracked file (CI, pre-push)
//   node scripts/check-repo.mjs --staged   check only staged files (pre-commit)
// Private terms (one per line) can be listed in .repo-guard.local, which is git-ignored and never committed.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const staged = process.argv.includes('--staged');
const MAX_BYTES = 1_000_000;

// Every tracked path must match one of these. Anything else is a mistake until this list is changed on purpose.
const ALLOWED = [
  /^(README|AGENT_USAGE|AI_NOTES|PROMPTS_USED|ABOUTME|CLAUDE)\.md$/,
  /^\.env\.example$/,
  /^\.(gitignore|gitattributes|prettierrc(\.json)?|prettierignore|editorconfig|nvmrc|node-version)$/,
  /^\.githooks\/(pre-commit|pre-push)$/,
  /^\.github\/workflows\/[\w.-]+\.ya?ml$/,
  /^\.claude\/settings\.json$/,
  /^\.vscode\/extensions\.json$/,
  /^docs\/(0[0-5]-[a-z0-9-]+|trace|RELEASE_NOTES)\.md$/,
  /^docs\/screenshots\/[\w.-]+\.png$/,
  /^scripts\/[\w.-]+\.(mjs|ts)$/,
  /^src\/.+\.(ts|tsx|css|json|svg|ico|png)$/,
  /^public\/.+\.(svg|png|ico|webmanifest|txt|xml)$/,
  /^prisma\/(schema\.prisma|seed\.ts|migrations\/migration_lock\.toml|migrations\/[\w-]+\/migration\.sql)$/,
  /^policies\/policy\.v\d+\.json$/,
  /^prompts\/[a-z-]+\.v\d+\.md$/,
  /^evals\/(cases\.json|run\.ts|lib\/[\w.-]+\.ts|results\/[\w.-]+\.md)$/,
  /^tests\/.+\.(ts|tsx|json)$/,
  /^(package\.json|package-lock\.json|tsconfig\.json|next\.config\.(ts|mjs|js)|eslint\.config\.(mjs|js)|vitest\.config\.(ts|mts)|vitest\.workspace\.ts|playwright\.config\.ts|vercel\.json|postcss\.config\.(mjs|js))$/,
];

// Always wrong, even if a pattern above would match.
const FORBIDDEN_PATHS = [
  { re: /(^|\/)\.env($|\.(?!example$))/, why: 'environment file with real values' },
  { re: /\.(pdf|docx?|pptx?|xlsx?|jsonl|log|zip|sqlite|db)$/i, why: 'binary, export, log or database file' },
  { re: /(^|\/)(node_modules|\.next|coverage|playwright-report|test-results|_scaffold|scratch)\//, why: 'generated or scratch folder' },
  { re: /(PLAYBOOK|ANALYSIS|NOTES_PRIVATE|TODO_PRIVATE)/i, why: 'private planning document' },
  { re: /^\.repo-guard\.local$/, why: 'private guard terms file' },
  { re: /^\.claude\/settings\.local\.json$/, why: 'local agent settings' },
];

// Generic content that must never be committed.
const FORBIDDEN_CONTENT = [
  { re: /recruitment\.[a-z]+\.[a-z]+\/hiring/i, why: 'assessment portal link' },
  { re: /async-task\?token=/i, why: 'assessment token' },
  { re: /C:\\Users\\|\/Users\/[A-Za-z]|F:\\Aggroso/i, why: 'local machine path' },
];

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function privateTerms() {
  const file = join(root, '.repo-guard.local');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((term) => ({ term, re: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
}

let files;
try {
  files = (staged
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    : git(['ls-files', '-z'])
  ).split('\0').filter(Boolean);
} catch {
  console.error('check-repo: not a git repository.');
  process.exit(1);
}

const terms = privateTerms();
const problems = [];

for (const file of files) {
  const forbidden = FORBIDDEN_PATHS.find((f) => f.re.test(file));
  if (forbidden) {
    problems.push(`${file}: not allowed in the repository (${forbidden.why})`);
    continue;
  }
  if (!ALLOWED.some((re) => re.test(file))) {
    problems.push(`${file}: path is not in the allowlist (scripts/check-repo.mjs). Add it on purpose or remove it.`);
    continue;
  }
  const full = join(root, file);
  if (!existsSync(full)) continue;
  const size = statSync(full).size;
  if (size > MAX_BYTES && file !== 'package-lock.json') {
    problems.push(`${file}: ${size} bytes is larger than ${MAX_BYTES}`);
    continue;
  }
  if (/\.(png|ico)$/i.test(file) || file === 'scripts/check-repo.mjs') continue;
  const text = staged ? git(['show', `:${file}`]) : readFileSync(full, 'utf8');
  for (const rule of FORBIDDEN_CONTENT) {
    if (rule.re.test(text)) problems.push(`${file}: contains ${rule.why}`);
  }
  for (const { term, re } of terms) {
    if (re.test(text)) problems.push(`${file}: contains a private term from .repo-guard.local ("${term.slice(0, 3)}...")`);
  }
}

// Untracked files that are not ignored are a warning: they are one "git add ." away from being committed.
if (!staged) {
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of untracked) console.warn(`warning: untracked and not ignored: ${file}`);
}

if (problems.length > 0) {
  for (const p of problems) console.log(p);
  console.error(`\ncheck-repo: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`check-repo: OK (${files.length} ${staged ? 'staged' : 'tracked'} files)`);
