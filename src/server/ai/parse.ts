// Parse ladder (docs/02-system-design.md sec. 5.4, AI-9): direct -> fenced -> embedded -> repaired. It only turns
// text into JSON. Valid JSON that fails the Zod contract is not sent down the ladder again; it goes to repair.

export type ParseStrategy = 'direct' | 'fenced' | 'embedded' | 'repaired';

export interface StrategyFailure {
  strategy: ParseStrategy;
  error: string;
}

export class ParseError extends Error {
  constructor(
    readonly stage: 'empty' | 'json',
    readonly failures: StrategyFailure[],
  ) {
    super(
      stage === 'empty'
        ? 'Model output is empty'
        : `Model output is not valid JSON (${failures.map((f) => `${f.strategy}: ${f.error}`).join('; ')})`,
    );
    this.name = 'ParseError';
  }
}

export type ParseOutcome = { ok: true; value: unknown; strategy: ParseStrategy } | { ok: false; error: ParseError };

const FENCE_RE = /```(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/;

function tryJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    // JSON.parse messages quote the text they failed on, which may be content. Keep only the position.
    const message = error instanceof Error ? error.message : '';
    const position = /position (\d+)/.exec(message);
    if (position) return { ok: false, error: `invalid JSON at position ${position[1]}` };
    return { ok: false, error: /end of JSON/i.test(message) ? 'unexpected end of JSON' : 'invalid JSON' };
  }
}

/** The first balanced {...} in the text. Braces inside JSON strings (and escaped quotes) are skipped. */
export function findBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Removes a comma that directly precedes } or ], outside strings. */
function removeTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ',') {
      const next = text.slice(i + 1).match(/^\s*([}\]])/);
      if (next) continue;
    }
    out += ch;
  }
  return out;
}

/** Conservative fixes only: BOM, curly double quotes, trailing commas. Truncated JSON is not completed. */
export function conservativeFix(text: string): string {
  const unquoted = text.replace(/^\uFEFF/, '').replace(/[\u201C\u201D]/g, '"');
  return removeTrailingCommas(unquoted);
}

export function parseModelJson(raw: string): ParseOutcome {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (text === '') return { ok: false, error: new ParseError('empty', []) };

  const failures: StrategyFailure[] = [];

  const direct = tryJson(text);
  if (direct.ok) return { ok: true, value: direct.value, strategy: 'direct' };
  failures.push({ strategy: 'direct', error: direct.error });

  const fence = FENCE_RE.exec(text);
  if (fence) {
    const fenced = tryJson((fence[1] ?? '').trim());
    if (fenced.ok) return { ok: true, value: fenced.value, strategy: 'fenced' };
    failures.push({ strategy: 'fenced', error: fenced.error });
  } else {
    failures.push({ strategy: 'fenced', error: 'no fenced block' });
  }

  const candidate = findBalancedObject(text);
  if (candidate) {
    const embedded = tryJson(candidate);
    if (embedded.ok) return { ok: true, value: embedded.value, strategy: 'embedded' };
    failures.push({ strategy: 'embedded', error: embedded.error });
  } else {
    failures.push({ strategy: 'embedded', error: 'no balanced object' });
  }

  // Fix first, then look for the object again: curly quotes hide string boundaries from the brace scan.
  const fixedText = conservativeFix(text);
  const repairedCandidate = findBalancedObject(fixedText);
  if (repairedCandidate) {
    const repaired = tryJson(repairedCandidate);
    if (repaired.ok) return { ok: true, value: repaired.value, strategy: 'repaired' };
    failures.push({ strategy: 'repaired', error: repaired.error });
  } else {
    failures.push({ strategy: 'repaired', error: 'no balanced object after fixes' });
  }

  return { ok: false, error: new ParseError('json', failures) };
}
