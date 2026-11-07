import { getConfig } from '../config';
import { getDb } from '../db';
import { getLogger } from '../logger';

// System checks for /status and /api/health (docs/02-system-design.md sec. 11). S0 covers the app and the
// database; S7 adds the LLM, jobs, re-evaluation, policy and AI usage checks.

export type CheckState = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  check: 'app' | 'database';
  state: CheckState;
  detail: Record<string, string | number | null>;
}

export interface StatusReport {
  overall: CheckState;
  checkedAt: string;
  checks: CheckResult[];
}

export interface Health {
  ok: boolean;
  db: 'connected' | 'unreachable';
  version: string;
}

export type DatabaseProbe = () => Promise<unknown>;

// Each check has its own timeout, so one slow dependency cannot hang the status page.
export const CHECK_TIMEOUT_MS = 2000;

const defaultProbe: DatabaseProbe = () => getDb().$queryRaw`SELECT 1`;

class CheckTimeout extends Error {}

export async function checkDatabase(
  probe: DatabaseProbe = defaultProbe,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new CheckTimeout()), timeoutMs);
      }),
    ]);
    return { check: 'database', state: 'ok', detail: { latencyMs: Math.round(performance.now() - started) } };
  } catch (error) {
    const reason = error instanceof CheckTimeout ? 'timeout' : 'unreachable';
    getLogger().warn({
      event: 'status.db_check_failed',
      reason,
      err: error instanceof CheckTimeout ? undefined : error,
    });
    return { check: 'database', state: 'fail', detail: { latencyMs: null, reason } };
  } finally {
    clearTimeout(timer);
  }
}

export function checkApp(): CheckResult {
  const { release } = getConfig();
  return {
    check: 'app',
    state: 'ok',
    detail: {
      release: release.commitSha ?? 'local',
      buildTime: release.buildTime,
      uptimeS: Math.round(process.uptime()),
    },
  };
}

function worst(states: CheckState[]): CheckState {
  if (states.includes('fail')) return 'fail';
  if (states.includes('warn')) return 'warn';
  return 'ok';
}

export async function getStatusReport(probe?: DatabaseProbe): Promise<StatusReport> {
  const checks = [checkApp(), await checkDatabase(probe)];
  return { overall: worst(checks.map((c) => c.state)), checkedAt: new Date().toISOString(), checks };
}

export async function getHealth(probe?: DatabaseProbe): Promise<Health> {
  const database = await checkDatabase(probe);
  const ok = database.state === 'ok';
  return { ok, db: ok ? 'connected' : 'unreachable', version: getConfig().release.commitSha ?? 'local' };
}
