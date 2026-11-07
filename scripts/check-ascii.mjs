#!/usr/bin/env node
// Fails when a tracked text file contains a character outside 7-bit ASCII.
// Usage: node scripts/check-ascii.mjs [file ...]
// Non-ASCII test data must be written as \u escapes so the source file itself stays ASCII.
// Paths listed (one prefix per line) in .ascii-allow are skipped.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.pdf',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz', '.tgz', '.mp4', '.webm', '.mp3',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.vercel', 'dist', 'coverage', 'playwright-report', 'test-results',
]);
const HINTS = {
  0x00a0: 'normal space', 0x00a7: 'sec.', 0x00b7: ',', 0x00d7: 'x', 0x00f7: '/', 0x00e9: 'e',
  0x2010: '-', 0x2011: '-', 0x2013: '-', 0x2014: '-', 0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"',
  0x2022: '-', 0x2026: '...', 0x2190: '<-', 0x2192: '->', 0x21d2: '=>', 0x2260: '!=', 0x2264: '<=',
  0x2265: '>=', 0x2713: 'an icon or the word', 0x2715: 'x', 0xfeff: 'remove the BOM',
};
const MAX_REPORTED = 200;

const root = process.cwd();

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(relative(root, full).split(sep).join('/'));
  }
  return files;
}

function listFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = out.split('\0').filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // Not a git repository yet: fall back to a directory walk.
  }
  return walk(root);
}

function allowList() {
  const file = join(root, '.ascii-allow');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const allowed = allowList();
const args = process.argv.slice(2);
const files = (args.length > 0 ? args : listFiles())
  .filter((file) => !BINARY_EXT.has(extname(file).toLowerCase()))
  .filter((file) => !allowed.some((prefix) => file.startsWith(prefix)));

let count = 0;
let filesWithProblems = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  let found = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let col = 0; col < line.length; col++) {
      const cp = line.codePointAt(col);
      if (cp === undefined || cp <= 0x7f) continue;
      found = true;
      count++;
      if (count <= MAX_REPORTED) {
        const hex = cp.toString(16).toUpperCase().padStart(4, '0');
        const hint = HINTS[cp] ? `  (use "${HINTS[cp]}")` : '';
        console.log(`${file}:${i + 1}:${col + 1}  U+${hex}${hint}`);
      }
      if (cp > 0xffff) col++;
    }
  }
  if (found) filesWithProblems++;
}

if (count > 0) {
  if (count > MAX_REPORTED) console.log(`... and ${count - MAX_REPORTED} more`);
  console.error(`\ncheck-ascii: ${count} non-ASCII character(s) in ${filesWithProblems} file(s).`);
  console.error('Replace them with ASCII, or write test data as \\u escapes.');
  process.exit(1);
}
console.log(`check-ascii: OK (${files.length} files checked)`);
