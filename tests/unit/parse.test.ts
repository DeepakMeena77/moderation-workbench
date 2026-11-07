import { describe, expect, it } from 'vitest';
import { findBalancedObject, parseModelJson, ParseError } from '@/server/ai/parse';

const OBJ = { a: 1, b: 'two' };

describe('parse ladder', () => {
  it('[AI-9] direct: plain JSON parses as is', () => {
    expect(parseModelJson(JSON.stringify(OBJ))).toEqual({ ok: true, value: OBJ, strategy: 'direct' });
  });

  it('[AI-9] fenced: the first ```json block, and a plain ``` block', () => {
    const json = parseModelJson('Result:\n```json\n{"a": 1, "b": "two"}\n```\nthanks');
    expect(json).toEqual({ ok: true, value: OBJ, strategy: 'fenced' });
    const plain = parseModelJson('```\n{"a": 1, "b": "two"}\n```');
    expect(plain).toEqual({ ok: true, value: OBJ, strategy: 'fenced' });
  });

  it('[AI-9] embedded: the first balanced object, with braces and escaped quotes inside strings', () => {
    const text = 'Here you go: {"s": "a } b { c \\" }", "n": {"x": [1, 2]}} and more text {"later": true}';
    const outcome = parseModelJson(text);
    expect(outcome).toEqual({ ok: true, value: { s: 'a } b { c " }', n: { x: [1, 2] } }, strategy: 'embedded' });
  });

  it('[AI-9] repaired: a trailing comma is removed', () => {
    expect(parseModelJson('{"a": 1, "b": "two",}')).toEqual({ ok: true, value: OBJ, strategy: 'repaired' });
    expect(parseModelJson('{"list": [1, 2, ], }')).toEqual({ ok: true, value: { list: [1, 2] }, strategy: 'repaired' });
  });

  it('[AI-9] repaired: curly double quotes (U+201C, U+201D) become straight quotes', () => {
    const text = '{\u201Ca\u201D: 1, \u201Cb\u201D: \u201Ctwo\u201D}';
    expect(parseModelJson(text)).toEqual({ ok: true, value: OBJ, strategy: 'repaired' });
  });

  it('[AI-9] a leading byte order mark is stripped', () => {
    expect(parseModelJson('\uFEFF{"a": 1, "b": "two"}')).toEqual({ ok: true, value: OBJ, strategy: 'direct' });
  });

  it('[AI-9] empty: empty or whitespace output fails at the empty stage', () => {
    for (const text of ['', '   \n ']) {
      const outcome = parseModelJson(text);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.stage).toBe('empty');
    }
  });

  it('[AI-9] json: invalid output reports the error of every strategy', () => {
    const outcome = parseModelJson('I cannot help with that.');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(ParseError);
    expect(outcome.error.stage).toBe('json');
    expect(outcome.error.failures.map((f) => f.strategy)).toEqual(['direct', 'fenced', 'embedded', 'repaired']);
  });

  it('[AI-9] truncated output (`{"` when thinking used the output budget) fails every strategy', () => {
    const outcome = parseModelJson('{"');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.stage).toBe('json');
    expect(outcome.error.failures).toHaveLength(4);
  });

  it('[AI-9] parse errors never echo the model text (it may quote the content)', () => {
    const outcome = parseModelJson('secret words {"quote": "secret words');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.message).not.toContain('secret');
  });

  it('[AI-9] the brace scan returns null when no object closes', () => {
    expect(findBalancedObject('{"a": {"b": 1}')).toBeNull();
    expect(findBalancedObject('no braces')).toBeNull();
  });
});
