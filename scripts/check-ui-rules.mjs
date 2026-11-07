#!/usr/bin/env node
// Static checks for the design-system rules in docs/03-ui-ux.md:
// no elevation, no gradients, no hex colours outside tokens, no raw HTML injection, spacing through the theme,
// and borders only as 1 px hairlines.
// Usage: node scripts/check-ui-rules.mjs

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const SRC = join(root, 'src');
const EXT = new Set(['.ts', '.tsx', '.css']);

const THEME_DIR = 'src/ui/theme/';
const TOKENS_FILE = 'src/ui/theme/tokens.ts';
const isTheme = (file) => file.startsWith(THEME_DIR);

const RULES = [
  {
    id: 'hex-colour',
    message: 'Hex colour outside tokens.ts. Use theme.vars.palette.m3.* instead.',
    pattern: /['"`]#[0-9a-fA-F]{3,8}['"`]|:\s*#[0-9a-fA-F]{3,8}\b/,
    skip: (file) => file === TOKENS_FILE,
  },
  {
    id: 'elevation',
    message: 'Shadow or elevation found. The design uses tonal surfaces with elevation 0.',
    // Allowed values: none, or a lone 0. Anything else (e.g. "0 1px 2px") is a shadow.
    pattern: /boxShadow\s*:(?!\s*(['"`](none|0)['"`]|0\s*[,}\n]|0\s*$))|box-shadow\s*:(?!\s*(none|0)\s*(;|}|!|$))|elevation\s*[=:]\s*\{?\s*[1-9]/,
    skip: () => false,
  },
  {
    id: 'raw-html',
    message: 'dangerouslySetInnerHTML is not allowed. Render user and AI text as plain text.',
    pattern: /dangerouslySetInnerHTML/,
    skip: () => false,
  },
  {
    id: 'raw-spacing',
    message: 'Raw px spacing. Use theme spacing numbers (1 unit = 4 px).',
    pattern: /\b(m|p|mx|my|mt|mb|ml|mr|px|py|pt|pb|pl|pr|margin\w*|padding\w*|gap|rowGap|columnGap)\s*:\s*['"`]\d+(\.\d+)?px/,
    skip: (file) => isTheme(file),
  },
  {
    id: 'gradient',
    message: 'Gradients are not used. Surfaces are flat colours from the tokens.',
    pattern: /(linear|radial|conic)-gradient\s*\(/,
    skip: () => false,
  },
  {
    id: 'heavy-border',
    message: 'Borders are 1 px hairlines in a token colour. Thicker lines need a stated reason.',
    pattern: /\bborder(Top|Bottom|Left|Right)?(Width)?\s*:\s*['"`]?([2-9]|\d{2,})px|border(-(top|bottom|left|right))?\s*:\s*([2-9]|\d{2,})px\s+solid/,
    skip: (file) => isTheme(file),
  },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (EXT.has(extname(entry.name))) files.push(relative(root, full).split(sep).join('/'));
  }
  return files;
}

if (!existsSync(SRC)) {
  console.log('check-ui-rules: no src/ folder yet, nothing to check.');
  process.exit(0);
}

let problems = 0;
for (const file of walk(SRC)) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (/ui-rules-ignore/.test(line)) return;
    for (const rule of RULES) {
      if (rule.skip(file)) continue;
      if (rule.pattern.test(line)) {
        problems++;
        console.log(`${file}:${index + 1}  [${rule.id}] ${rule.message}`);
      }
    }
  });
}

if (problems > 0) {
  console.error(`\ncheck-ui-rules: ${problems} problem(s).`);
  console.error('A justified exception needs a "ui-rules-ignore: <reason>" comment on the same line.');
  process.exit(1);
}
console.log('check-ui-rules: OK');
