# Prompts used

The prompts this product sends to the LLM at runtime, why they are written this way, and how they changed. The
prompts used to *build* the app with coding agents are in [AGENT_USAGE.md](AGENT_USAGE.md).

<!--
Working instructions (delete this comment before submitting):
- Prompts live in prompts/*.vN.md. Every AiRun stores promptVersion and promptHash.
- Each time you change a prompt, add an iteration entry the same day: the before text, the problem you observed
  (paste the bad output or the eval row), the after text, and the evidence that it improved.
- Only real iterations. Never invent before/after examples.
-->

## 1. Runtime prompts

| Prompt | Version | Model and settings | Output schema | Purpose |
| --- | --- | --- | --- | --- |
| [`classify`](prompts/classify.v1.md) | v1 | Gemini `<model>`, JSON mode + response schema, temperature `<t>`, max output 2048 | `ClassifyOutput` (`src/server/ai/output.ts`) | Findings with cited clauses, confirmed vs interpretation, action, severity, confidence, human-review reasons |
| [`appeal-brief`](prompts/appeal-brief.v1.md) | v1 | same | `AppealBrief` | Neutral summary of an appeal; never recommends an outcome |
| Repair message (inline in `src/server/ai/classify.ts`) | - | same, second call only | same as the first call | Fix invalid output using the exact validation errors |

## 2. Design choices for clarity and context

<!-- Fill in from the final prompt: role first; rules before tasks; rubrics instead of adjectives; literal JSON
     example; content is data; authority withheld (no decision fields); one job per prompt; context budget. -->

## 3. Iterations (before -> after)

### 3.1 <title>

- **Before:**
- **Observed problem** (output or eval row):
- **After:**
- **Evidence it improved:**

## 4. How malformed output is handled

<!-- Parse ladder (direct -> fenced -> embedded -> repaired), Zod validation, at most 1 repair, then stop and fall
     back to rule findings. Logging events and tests (file names). -->

## 5. Coding-agent prompts

See [AGENT_USAGE.md](AGENT_USAGE.md#representative-prompts).
