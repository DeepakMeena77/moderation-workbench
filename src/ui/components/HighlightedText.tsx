import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import { m3 } from '../theme/theme';

// HighlightedText (03 sec. 4, AI-3, SEC-3): plain text with evidence spans wrapped in <mark tabindex=0>. Text is
// only ever passed to React as strings, so markup in the content ("<script>") is shown as text and never
// parsed. Overlapping or touching spans are merged and keep every clause they belong to. Spans outside the
// text (stale offsets) are ignored. Interpretations are not highlighted (03 sec. 2.3).

export interface Highlight {
  start: number;
  end: number;
  /** Clause code, e.g. "HAR-1". */
  code: string;
  /** Tooltip text, e.g. "HAR-1 - Harassment and insults". */
  title: string;
}

export interface Segment {
  text: string;
  start: number;
  /** Empty for plain text. */
  highlights: Highlight[];
}

/** Splits the text into plain and highlighted segments, merging overlapping spans. Pure, for tests. */
export function segmentText(text: string, highlights: readonly Highlight[]): Segment[] {
  const valid = highlights
    .filter((h) => Number.isInteger(h.start) && Number.isInteger(h.end) && h.start >= 0 && h.end <= text.length)
    .filter((h) => h.end > h.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Array<{ start: number; end: number; highlights: Highlight[] }> = [];
  for (const h of valid) {
    const last = merged.at(-1);
    if (last && h.start <= last.end) {
      last.end = Math.max(last.end, h.end);
      if (!last.highlights.some((x) => x.code === h.code)) last.highlights.push(h);
    } else {
      merged.push({ start: h.start, end: h.end, highlights: [h] });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), start: cursor, highlights: [] });
    segments.push({ text: text.slice(span.start, span.end), start: span.start, highlights: span.highlights });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), start: cursor, highlights: [] });
  return segments;
}

export interface HighlightedTextProps {
  text: string;
  highlights: readonly Highlight[];
  variant?: TypographyProps['variant'];
  /** Clause codes to pulse (the finding the moderator just selected). */
  activeCode?: string | null;
}

export function HighlightedText({ text, highlights, variant = 'body1', activeCode = null }: HighlightedTextProps) {
  return (
    <Typography variant={variant} component="p" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {segmentText(text, highlights).map((segment) => {
        if (segment.highlights.length === 0) return <span key={segment.start}>{segment.text}</span>;
        const codes = segment.highlights.map((h) => h.code).join(', ');
        const active = activeCode !== null && segment.highlights.some((h) => h.code === activeCode);
        return (
          <Tooltip key={segment.start} title={segment.highlights.map((h) => h.title).join('; ')}>
            <Box
              component="mark"
              tabIndex={0}
              aria-label={`Evidence for ${codes}: ${segment.text}`}
              data-codes={codes}
              sx={(t) => ({
                backgroundColor: m3(t).primaryContainer,
                color: m3(t).onPrimaryContainer,
                textDecorationLine: 'underline',
                textDecorationColor: m3(t).primary,
                textDecorationThickness: 2,
                textUnderlineOffset: 3,
                borderRadius: '4px',
                outline: active ? `2px solid ${m3(t).primary}` : 'none',
                '@media (prefers-reduced-motion: no-preference)': { transition: 'outline-color 200ms' },
              })}
            >
              {segment.text}
            </Box>
          </Tooltip>
        );
      })}
    </Typography>
  );
}
