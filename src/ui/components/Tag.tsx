import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { layout, m3, monoSx } from '../theme/theme';

/** Neutral for facts (actions, versions, codes); a hue only where it carries meaning (03 sec. 2.2). */
export type TagTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface TagProps {
  label: string;
  tone?: TagTone;
  /** Clause codes and IDs: system monospace. */
  mono?: boolean;
  title?: string;
}

function toneColours(theme: Theme, tone: TagTone): { bg: string; fg: string; border: string } {
  const p = m3(theme);
  switch (tone) {
    case 'info':
      return { bg: p.primaryContainer, fg: p.onPrimaryContainer, border: p.infoBorder };
    case 'success':
      return { bg: p.successContainer, fg: p.onSuccessContainer, border: p.successBorder };
    case 'warning':
      return { bg: p.warningContainer, fg: p.onWarningContainer, border: p.warningBorder };
    case 'error':
      return { bg: p.errorContainer, fg: p.onErrorContainer, border: p.errorBorder };
    case 'neutral':
      return { bg: p.tertiaryContainer, fg: p.onTertiaryContainer, border: p.border };
  }
}

// A badge (03 sec. 4): not interactive, 20 high, radius 4, a soft tint with darker text and a 1 px border in the
// same hue. Text only: badges carry no icons.
export function Tag({ label, tone = 'neutral', mono = false, title }: TagProps) {
  return (
    <Box
      component="span"
      data-ui="tag"
      title={title}
      sx={(theme) => {
        const { bg, fg, border } = toneColours(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          height: layout.badgeHeight,
          px: 2,
          borderRadius: `${layout.badgeRadius}px`,
          border: `1px solid ${border}`,
          backgroundColor: bg,
          color: fg,
          ...theme.typography.overline,
          ...(mono ? monoSx : {}),
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        };
      }}
    >
      {label}
    </Box>
  );
}

/** A semantic dot: severity (high, medium, low) or a check state (ok, warn, fail). */
export type DotTone = 'high' | 'medium' | 'low' | 'ok' | 'warn' | 'fail' | 'info';

function dotColour(theme: Theme, tone: DotTone): string {
  const p = m3(theme);
  switch (tone) {
    case 'high':
    case 'fail':
      return p.dotHigh;
    case 'medium':
    case 'warn':
      return p.dotMedium;
    case 'ok':
      return p.success;
    case 'info':
      return p.primary;
    case 'low':
      return p.dotLow;
  }
}

/** An 8 px dot. Decorative: the word beside it carries the meaning. */
export function Dot({ tone }: { tone: DotTone }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={(theme) => ({
        display: 'inline-block',
        flexShrink: 0,
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: dotColour(theme, tone),
      })}
    />
  );
}

/** A dot followed by plain text, for severity and check states (03 sec. 2.2). */
export function DotLabel({
  tone,
  children,
  size = 'small',
}: {
  tone: DotTone;
  children: ReactNode;
  /** small = 12/16 beside badges; body = 14/20 in definition lists and text. */
  size?: 'small' | 'body';
}) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        color: m3(theme).onSurface,
        whiteSpace: 'nowrap',
        ...(size === 'small' ? theme.typography.overline : theme.typography.body2),
      })}
    >
      <Dot tone={tone} />
      {children}
    </Box>
  );
}
