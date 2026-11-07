import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// HUM-1: the moderation core (AI, rules, moderation, jobs) can never reach the code that changes visibility
// or resolves cases and appeals. Two proofs: the project's own ESLint config rejects such an import, and no
// file in those folders contains one today.

const CORE_DIRS = ['ai', 'rules', 'moderation', 'jobs'].map((dir) => join(process.cwd(), 'src', 'server', dir));
const FORBIDDEN = /from\s+['"][^'"]*services\/(visibility|decisions|appeals)['"]/;

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('HUM-1 import boundaries', () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  for (const [folder, source] of [
    ['ai', "import { setVisibility } from '@/server/services/visibility';"],
    ['jobs', "import { setVisibility } from '../services/visibility';"],
    ['moderation', "import { decide } from '../services/decisions';"],
    ['rules', "import { decide } from '@/server/services/decisions';"],
  ] as const) {
    it(`[HUM-1] lint blocks src/server/${folder} from importing visibility or decisions`, async () => {
      const [result] = await eslint.lintText(
        `${source}\nexport const used = typeof ${source.includes('decide') ? 'decide' : 'setVisibility'};\n`,
        {
          filePath: join(process.cwd(), 'src', 'server', folder, 'boundaryProbe.ts'),
        },
      );
      const messages = result?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
      expect(messages.length, JSON.stringify(result?.messages)).toBeGreaterThan(0);
      expect(messages[0]?.message).toMatch(/HUM-1/);
    }, 60_000);
  }

  it('[HUM-1] lint blocks src/server/jobs from importing appeals, but allows the brief writer', async () => {
    const lint = async (source: string) => {
      const [result] = await eslint.lintText(source, {
        filePath: join(process.cwd(), 'src', 'server', 'jobs', 'boundaryProbe.ts'),
      });
      return result?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
    };
    const blocked = await lint(
      "import { resolveAppeal } from '../services/appeals';\nexport const used = typeof resolveAppeal;\n",
    );
    expect(blocked[0]?.message).toMatch(/HUM-1/);
    // services/appealBriefs.ts writes only Appeal.brief and briefAiRunId (02 sec. 11), so the job may use it.
    const allowed = await lint(
      "import { recordAppealBrief } from '../services/appealBriefs';\nexport const used = typeof recordAppealBrief;\n",
    );
    expect(allowed).toEqual([]);
  }, 60_000);

  it('[HUM-1] lint allows the same import from a service', async () => {
    const [result] = await eslint.lintText(
      "import { setVisibility } from './visibility';\nexport const used = typeof setVisibility;\n",
      { filePath: join(process.cwd(), 'src', 'server', 'services', 'boundaryProbe.ts') },
    );
    expect(result?.messages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);
  }, 60_000);

  it('[HUM-1] no file in the moderation core imports visibility, decisions or appeals', () => {
    const offenders = CORE_DIRS.flatMap(files)
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
