// One plain line per audit event (03 sec. 6.10): what changed, read from the event's before and after summaries,
// so the table can be scanned without expanding each row. The full before and after stay in the expanded row.

type Json = Record<string, unknown> | null | undefined;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const words = (value: unknown): string | null => str(value)?.replaceAll('_', ' ') ?? null;
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => str(v)).filter((v): v is string => v !== null) : [];
const join = (...parts: Array<string | null | false | undefined>): string =>
  parts.filter((p): p is string => typeof p === 'string' && p !== '').join(', ');

/** Why access was refused, in words; the code itself stays in the expanded row. */
const DENIAL_WORDS: Record<string, string> = {
  FORBIDDEN: 'Not allowed',
  SAME_REVIEWER: 'Refused: they made the original decision',
  HUMAN_REQUIRED: 'Refused: only a human moderator can do this',
  UNAUTHENTICATED: 'Not signed in',
};

/** The last 7 characters of an id, as on the case page ("case 5tyqti7"); the full id goes in a tooltip. */
export function shortId(id: string): string {
  return id.length > 10 ? id.slice(-7) : id;
}

export function auditSummary(event: { action: string; before: unknown; after: unknown }): string {
  const b = obj(event.before as Json);
  const a = obj(event.after as Json);
  switch (event.action) {
    case 'visibility.changed':
      return `${str(b.visibility) ?? '?'} -> ${str(a.visibility) ?? '?'}`;
    case 'decision.created': {
      const codes = list(a.clauseCodes);
      return join(
        str(a.kind),
        str(a.finalAction) && `final action ${str(a.finalAction)}`,
        codes.length > 0 && codes.join(' '),
      );
    }
    case 'analysis.created':
      return join(
        str(a.action) && `recommends ${str(a.action)}`,
        str(a.priority) && `priority ${str(a.priority)}`,
        a.autoClear === true && 'auto-cleared',
        str(a.aiStatus) && str(a.aiStatus) !== 'ok' && `AI ${words(a.aiStatus)}`,
      );
    case 'case.opened':
      return str(a.trigger) === 'report' ? 'from a user report' : 'from new content';
    case 'case.reopened':
      return `${words(b.status) ?? '?'} -> ${words(a.status) ?? '?'}`;
    case 'content.created':
      return join(str(a.type), str(a.length) && `${str(a.length)} characters`, a.parentId ? 'a reply' : null);
    case 'report.created':
      return join(words(a.reason) && `reason: ${words(a.reason)}`, a.hasNote === true && 'with a note');
    case 'appeal.created':
      return join(
        str(a.statementLength) && `${str(a.statementLength)}-character statement`,
        str(a.evidenceLinks) && `${str(a.evidenceLinks)} links`,
      );
    case 'appeal.assigned':
      return a.assignedReviewerId ? 'to a senior moderator who did not decide' : 'no eligible senior moderator yet';
    case 'appeal.brief_created':
      return join(
        str(a.aiStatus) === 'ok' ? 'summary written' : `AI ${words(a.aiStatus) ?? 'unavailable'}`,
        str(a.newPoints) && `${str(a.newPoints)} new points`,
        str(a.disputedFindings) && `${str(a.disputedFindings)} disputed findings`,
      );
    case 'appeal.resolved':
      return join(str(a.outcome), str(a.finalAction) && `final action ${str(a.finalAction)}`);
    case 'access.denied': {
      const reason = DENIAL_WORDS[str(a.code) ?? ''] ?? 'Not allowed';
      const who = words(a.role);
      return `${reason}${who ? ` (${who})` : ''}`;
    }
    default: {
      // Other events: up to two plain fields, leaving out ids.
      const plain = Object.entries(a)
        .filter(([key, value]) => !/id$/i.test(key) && str(value) !== null)
        .slice(0, 2)
        .map(([key, value]) => `${key} ${words(value)}`);
      return plain.join(', ');
    }
  }
}
