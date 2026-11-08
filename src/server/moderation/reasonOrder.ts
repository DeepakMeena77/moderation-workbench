// The order of "why a human must decide" reasons (AI-6, 03 sec. 6.5 and 6.6): the most specific first, so the first
// reason in the queue table says something the other columns do not. The generic "any action needs a human" reason
// goes last. The reasons are the plain-language strings moderation/combine.ts writes; ranking them when they are
// read also orders analyses stored before this order existed. Pure, so the same order holds everywhere.

const RANKS: ReadonlyArray<readonly [number, RegExp]> = [
  [1, /^Reported by /],
  [2, /instructions aimed at the AI/],
  [3, /^High severity finding|^Clause \S+ always goes to a human/],
  [4, /^Rules and AI disagree/],
  [5, /^Rules matched /],
  [6, /^AI made \d+ findings? |^AI proposed "|^AI cited clauses |^AI quotes not found /],
  // Before the "AI: " catch-all, which is the model asking for review.
  [9, /^AI: not enough context/],
  [7, /^AI: /],
  [8, /^AI confidence /],
  [11, /^AI result missing|^AI review unavailable/],
  [12, /^The recommended action is /],
];

/** A reason this order does not know is still specific: it goes before "AI unavailable" and the generic reason. */
const UNKNOWN_RANK = 10;

export function reasonRank(reason: string): number {
  return RANKS.find(([, pattern]) => pattern.test(reason))?.[0] ?? UNKNOWN_RANK;
}

/** The reasons, most specific first; reasons of the same rank keep their order. */
export function rankReasons(reasons: readonly string[]): string[] {
  return reasons
    .map((reason, index) => ({ reason, index, rank: reasonRank(reason) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.reason);
}
