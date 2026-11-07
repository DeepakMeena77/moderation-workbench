import type { AppealRequest } from '../../api/hooks';

// The appeal form's rules (APP-1), mirrored from src/server/services/appeals.ts so the author sees a problem before
// sending. The server checks everything again; these are pure functions for tests.

export const MIN_STATEMENT_CHARS = 20;
export const MAX_STATEMENT_CHARS = 2000;
export const MAX_LINKS = 3;
export const MAX_LINK_CHARS = 500;
export const MAX_NOTE_CHARS = 1000;

export interface AppealDraft {
  statement: string;
  links: string[];
  /** The link being typed, not yet added as a chip. */
  linkInput: string;
  note: string;
}

export type AppealField = 'statement' | 'links' | 'note';
export type AppealErrors = Partial<Record<AppealField, string>>;

/** Field order, so focus moves to the first invalid one (03 sec. 8). */
export const APPEAL_FIELDS: readonly AppealField[] = ['statement', 'links', 'note'];

export const EMPTY_APPEAL: AppealDraft = { statement: '', links: [], linkInput: '', note: '' };

const thousands = (n: number) => n.toLocaleString('en-US');

/** Why a typed link cannot be added, or null. Only http(s): links become clickable anchors for staff. */
export function linkError(value: string, existing: readonly string[]): string | null {
  const link = value.trim();
  let ok = false;
  try {
    const url = new URL(link);
    ok = (url.protocol === 'https:' || url.protocol === 'http:') && link.length <= MAX_LINK_CHARS;
  } catch {
    ok = false;
  }
  if (!ok) return 'Enter a full link that starts with https:// or http://.';
  if (existing.includes(link)) return 'You already added this link.';
  if (existing.length >= MAX_LINKS) return `Add at most ${MAX_LINKS} links.`;
  return null;
}

/** The links that will be sent: the chips plus a valid link still in the field, so nothing typed is dropped. */
export function linksToSend(draft: AppealDraft): string[] {
  const pending = draft.linkInput.trim();
  if (pending && linkError(pending, draft.links) === null) return [...draft.links, pending];
  return draft.links;
}

export function validateAppeal(draft: AppealDraft): AppealErrors {
  const errors: AppealErrors = {};
  const statement = draft.statement.trim();
  if (statement.length < MIN_STATEMENT_CHARS) {
    errors.statement = `Explain your appeal in at least ${MIN_STATEMENT_CHARS} characters.`;
  } else if (statement.length > MAX_STATEMENT_CHARS) {
    errors.statement = `Keep it under ${thousands(MAX_STATEMENT_CHARS)} characters (${thousands(statement.length)}).`;
  }
  const pending = draft.linkInput.trim();
  if (pending) {
    const problem = linkError(pending, draft.links);
    if (problem) errors.links = problem;
  }
  if (draft.note.trim().length > MAX_NOTE_CHARS) {
    errors.note = `Keep the note under ${thousands(MAX_NOTE_CHARS)} characters.`;
  }
  return errors;
}

export function toAppealRequest(draft: AppealDraft): AppealRequest {
  const note = draft.note.trim();
  return {
    statement: draft.statement.trim(),
    evidenceLinks: linksToSend(draft),
    ...(note ? { evidenceNote: note } : {}),
  };
}
