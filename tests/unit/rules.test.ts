import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { policyFileSchema, type ActivePolicy } from '@/server/policy/schema';
import { runRules, type RuleContext } from '@/server/rules';
import { contactRule } from '@/server/rules/contact';
import { keywordRule } from '@/server/rules/keyword';
import { linksRule } from '@/server/rules/links';
import { patternRule } from '@/server/rules/pattern';
import { repeatRule, wordOverlap } from '@/server/rules/repeat';

// Deterministic checks, one rule at a time (DET-1..4), against the real policy files.

function loadPolicy(version: 1 | 2): ActivePolicy {
  const file = policyFileSchema.parse(JSON.parse(readFileSync(`policies/policy.v${version}.json`, 'utf8')));
  return { version, clauses: file.clauses };
}

const v1 = loadPolicy(1);
const v2 = loadPolicy(2);
const NOW = new Date('2026-11-07T12:00:00Z');
const ctx = (recent: RuleContext['recentByAuthor'] = []): RuleContext => ({ createdAt: NOW, recentByAuthor: recent });

describe('keyword rule', () => {
  it('[DET-1] a keyword gives a confirmed finding with exact offsets and confidence 1', () => {
    const text = 'You are a worthless Idiot.';
    const [finding] = keywordRule(text, v1, ctx());
    expect(finding).toMatchObject({
      ruleId: 'keyword',
      clauseCode: 'HAR-1',
      evidenceType: 'confirmed',
      confidence: 1,
      severity: 'medium',
    });
    expect(finding?.quotes).toEqual([
      { text: 'worthless', start: 10, end: 19 },
      { text: 'Idiot', start: 20, end: 25 },
    ]);
    for (const quote of finding?.quotes ?? []) expect(text.slice(quote.start, quote.end)).toBe(quote.text);
  });

  it('[DET-1] matches whole words only', () => {
    expect(keywordRule('That was an idiotic plan, but not worthlessly so.', v1, ctx())).toEqual([]);
  });

  it('[DET-1] offsets stay exact after non-ASCII text', () => {
    const text = 'Caf\u00e9 \u{1F600} idiot';
    const [finding] = keywordRule(text, v1, ctx());
    const quote = finding?.quotes[0];
    expect(quote && text.slice(quote.start, quote.end)).toBe('idiot');
  });
});

describe('pattern rule', () => {
  it('[DET-1] a policy regex gives a confirmed finding with offsets, case-insensitive', () => {
    const text = 'Honestly, KILL YOURSELF.';
    const [finding] = patternRule(text, v1, ctx());
    expect(finding).toMatchObject({ ruleId: 'pattern', clauseCode: 'HAR-1', confidence: 1 });
    expect(finding?.quotes).toEqual([{ text: 'KILL YOURSELF', start: 10, end: 23 }]);
  });

  it('[DET-1] a threat pattern hits the alwaysEscalate clause THR-1 with high severity', () => {
    const [finding] = patternRule("I'm going to hurt you", v1, ctx());
    expect(finding).toMatchObject({ clauseCode: 'THR-1', severity: 'high' });
  });

  it('[DET-1] clean text gives no findings from any rule', () => {
    expect(runRules('Lovely weather at the lake today, see you all on Sunday!', v1, ctx())).toEqual([]);
  });
});

describe('links rule', () => {
  const three = 'See https://a.example/x, www.b.example and http://c.example.';

  it('[DET-2] three links reach the v1 SPAM-1 threshold and every link is quoted', () => {
    const [finding] = linksRule(three, v1, ctx());
    expect(finding).toMatchObject({ ruleId: 'links', clauseCode: 'SPAM-1', severity: 'low' });
    expect(finding?.quotes.map((q) => q.text)).toEqual(['https://a.example/x', 'www.b.example', 'http://c.example']);
  });

  it('[DET-2] two links are below the v1 threshold but reach the v2 threshold', () => {
    const two = 'Read https://a.example and https://b.example';
    expect(linksRule(two, v1, ctx())).toEqual([]);
    expect(linksRule(two, v2, ctx())).toHaveLength(1);
  });
});

describe('contact rule', () => {
  it('[DET-3] an email address gives a PII-1 finding', () => {
    const [finding] = contactRule('Mail her at jane.doe@example.org now', v1, ctx());
    expect(finding).toMatchObject({ ruleId: 'contact', clauseCode: 'PII-1' });
    expect(finding?.quotes[0]?.text).toBe('jane.doe@example.org');
  });

  it('[DET-3] a phone number of 9 or more digits gives a PII-1 finding; a shorter number does not', () => {
    const [finding] = contactRule('Call +44 (20) 7946-0958 tonight', v1, ctx());
    expect(finding?.quotes[0]?.text).toBe('+44 (20) 7946-0958');
    expect(contactRule('Meet at 10.30, room 12345678', v1, ctx())).toEqual([]);
  });

  it('[DET-3] a street address is a PII-1 finding under v2 only', () => {
    const text = 'She lives at 221 Baker Street, go knock.';
    expect(contactRule(text, v1, ctx())).toEqual([]);
    const [finding] = contactRule(text, v2, ctx());
    expect(finding?.quotes[0]?.text).toBe('221 Baker Street');
  });
});

describe('repeat rule', () => {
  const text = 'Buy my handmade candles today at the market stall';

  it('[DET-4] near-duplicate text from the same author within 10 minutes gives SPAM-1', () => {
    const recent = [
      { body: 'Buy my handmade candles today at the market stall!', createdAt: new Date(NOW.getTime() - 5 * 60_000) },
    ];
    const [finding] = repeatRule(text, v1, ctx(recent));
    expect(finding).toMatchObject({ ruleId: 'repeat', clauseCode: 'SPAM-1', confidence: 1 });
    expect(finding?.quotes).toEqual([{ text, start: 0, end: text.length }]);
  });

  it('[DET-4] the same text more than 10 minutes earlier is not a repeat', () => {
    const recent = [{ body: text, createdAt: new Date(NOW.getTime() - 11 * 60_000) }];
    expect(repeatRule(text, v1, ctx(recent))).toEqual([]);
  });

  it('[DET-4] text with less than 90% word overlap is not a repeat', () => {
    const recent = [{ body: 'Buy my candles at the stall on Sunday morning', createdAt: NOW }];
    expect(wordOverlap(text, recent[0]!.body)).toBeLessThan(0.9);
    expect(repeatRule(text, v1, ctx(recent))).toEqual([]);
  });
});
