import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HighlightedText, segmentText } from '@/ui/components/HighlightedText';
import { theme } from '@/ui/theme/theme';

// HighlightedText (03 sec. 4, AI-3, SEC-3): plain text with evidence marks, never parsed as HTML.

const renderText = (text: string, highlights = [] as Parameters<typeof segmentText>[1]) =>
  render(
    <ThemeProvider theme={theme}>
      <HighlightedText text={text} highlights={highlights} />
    </ThemeProvider>,
  );

describe('HighlightedText', () => {
  it('[SEC-3] renders <script> and other markup as text, never as HTML', () => {
    const text = '<script>alert(1)</script> <img src=x onerror=alert(2)> you idiot';
    const start = text.indexOf('idiot');
    const { container } = renderText(text, [{ start, end: start + 5, code: 'HAR-1', title: 'HAR-1 - Harassment' }]);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe(text);
    expect(screen.getByText('idiot').tagName).toBe('MARK');
  });

  it('[AI-3] wraps each evidence span in a focusable mark named after its clause', () => {
    renderText('You are a worthless idiot', [
      { start: 10, end: 19, code: 'HAR-1', title: 'HAR-1 - Harassment' },
      { start: 20, end: 25, code: 'HAR-1', title: 'HAR-1 - Harassment' },
    ]);
    const marks = screen.getAllByLabelText(/^Evidence for HAR-1/);
    expect(marks.map((m) => m.textContent)).toEqual(['worthless', 'idiot']);
    for (const mark of marks) expect(mark).toHaveAttribute('tabindex', '0');
  });

  it('[AI-3] merges overlapping spans and keeps every clause; ignores spans outside the text', () => {
    const segments = segmentText('abcdefghij', [
      { start: 2, end: 6, code: 'HAR-1', title: 'HAR-1' },
      { start: 4, end: 8, code: 'PII-1', title: 'PII-1' },
      { start: 9, end: 40, code: 'SPAM-1', title: 'SPAM-1' },
      { start: 5, end: 5, code: 'X-1', title: 'X-1' },
    ]);
    expect(segments.map((s) => [s.text, s.highlights.map((h) => h.code)])).toEqual([
      ['ab', []],
      ['cdefgh', ['HAR-1', 'PII-1']],
      ['ij', []],
    ]);
  });
});
