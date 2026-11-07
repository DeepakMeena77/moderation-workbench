#!/usr/bin/env node
// Secret scanner.
//   node scripts/check-secrets.mjs            scan every tracked file
//   node scripts/check-secrets.mjs --staged   scan staged content (pre-commit)
//   node scripts/check-secrets.mjs --history  scan the full git history (pre-push, before submitting)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const mode = process.argv.includes('--history') ? 'history' : process.argv.includes('--staged') ? 'staged' : 'tracked';
const SELF = 'scripts/check-secrets.mjs';

const PLACEHOLDER = /^(<[^>]*>|\$\{?[A-Z_]+\}?|PASSWORD|password|pass|USER|user|x+|\*+|changeme|change-me.*)$/;

const RULES = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Neon password', re: /npg_[A-Za-z0-9]{10,}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: 'Database URL with password',
    re: /postgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]+)@/g,
    keep: (m) => !PLACEHOLDER.test(m[1]),
  },
  {
    name: 'Secret assignment',
    re: /^\s*(SESSION_SECRET|CRON_SECRET|GEMINI_API_KEY|DATABASE_URL|DIRECT_URL|DEMO_PASSWORD)\s*=\s*['"]?([^'"\s#]+)/gm,
    keep: (m) => !PLACEHOLDER.test(m[2]),
  },
];

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function scan(label, text, out) {
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      if (rule.keep && !rule.keep(m)) continue;
      const shown = m[0].slice(0, 12);
      out.push(`${label}: ${rule.name} (${shown}...)`);
    }
  }
}

const findings = [];
try {
  if (mode === 'history') {
    scan('history', git(['log', '-p', '--all', '--no-color', '--', '.', `:(exclude)${SELF}`]), findings);
  } else {
    const files = (mode === 'staged'
      ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
      : git(['ls-files', '-z'])
    ).split('\0').filter((f) => f && f !== SELF && !/\.(png|ico|pdf|woff2?)$/i.test(f));
    for (const file of files) {
      let text;
      try {
        text = mode === 'staged' ? git(['show', `:${file}`]) : readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      scan(file, text, findings);
    }
  }
} catch (err) {
  console.error(`check-secrets: git failed (${err.message.split('\n')[0]})`);
  process.exit(1);
}

if (findings.length > 0) {
  for (const f of findings) console.log(f);
  console.error(`\ncheck-secrets: ${findings.length} possible secret(s) in ${mode} content. Remove them and rotate the keys.`);
  process.exit(1);
}
console.log(`check-secrets: OK (${mode})`);
