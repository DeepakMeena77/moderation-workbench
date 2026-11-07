import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// SEC-1: every API route requires a session except sign-in, status and health, and /api/jobs/tick, which
// checks its x-cron-secret header instead (tests/integration/jobs.test.ts). The type system already makes `auth` a required option of handle(); this test
// pins the list of public routes so a new public route is a visible, reviewed change.

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

const PUBLIC_ROUTES = [
  'GET /api/health',
  'GET /api/status',
  'GET /api/jobs/tick',
  'POST /api/auth/demo',
  'POST /api/auth/sign-in',
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

interface Declaration {
  file: string;
  route: string | null;
  auth: string | null;
}

function declarations(): Declaration[] {
  return routeFiles(API_DIR).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const calls = [...source.matchAll(/handle\(\s*\{([^}]*)\}/g)].map((match) => match[1] ?? '');
    if (calls.length === 0) return [{ file: relative(process.cwd(), file), route: null, auth: null }];
    return calls.map((options) => ({
      file: relative(process.cwd(), file),
      route: /route:\s*'([^']+)'/.exec(options)?.[1] ?? null,
      auth: /auth:\s*('[^']+'|\[[^\]]*\]|[A-Za-z_.]+)/.exec(options)?.[1] ?? null,
    }));
  });
}

describe('API route authentication', () => {
  it('[SEC-1] every route handler goes through handle() with a declared auth requirement', () => {
    const all = declarations();
    expect(all.length).toBeGreaterThan(0);
    for (const declaration of all) {
      expect(declaration.route, declaration.file).not.toBeNull();
      expect(declaration.auth, `${declaration.file} declares no auth`).not.toBeNull();
    }
  });

  it('[SEC-1] only sign-in, demo sign-in, status, health and the secret-checked cron tick are public', () => {
    const publicRoutes = declarations()
      .filter((declaration) => declaration.auth === "'public'")
      .map((declaration) => declaration.route)
      .sort();
    expect(publicRoutes).toEqual([...PUBLIC_ROUTES].sort());
  });
});
