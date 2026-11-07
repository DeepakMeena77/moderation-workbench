import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { cloneElement, type ReactElement } from 'react';
import { m3 } from '../theme/theme';

export type TagTone = 'neutral' | 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';

export interface TagProps {
  label: string;
  tone?: TagTone;
  /** A Material icon element; it is decorative because the label carries the meaning. */
  icon?: ReactElement<SvgIconProps>;
  title?: string;
}

function toneColours(theme: Theme, tone: TagTone): { bg: string; fg: string } {
  const p = m3(theme);
  switch (tone) {
    case 'primary':
      return { bg: p.primaryContainer, fg: p.onPrimaryContainer };
    case 'secondary':
      return { bg: p.secondaryContainer, fg: p.onSecondaryContainer };
    case 'tertiary':
      return { bg: p.tertiaryContainer, fg: p.onTertiaryContainer };
    case 'success':
      return { bg: p.successContainer, fg: p.onSuccessContainer };
    case 'warning':
      return { bg: p.warningContainer, fg: p.onWarningContainer };
    case 'error':
      return { bg: p.errorContainer, fg: p.onErrorContainer };
    case 'neutral':
      return { bg: p.surfaceContainerHighest, fg: p.onSurface };
  }
}

// A non-interactive label: radius 6 and height 24, smaller than a chip so it does not look clickable
// (03 sec. 4). Always text plus an optional icon, never colour alone.
export function Tag({ label, tone = 'neutral', icon, title }: TagProps) {
  return (
    <Box
      component="span"
      data-ui="tag"
      title={title}
      sx={(theme) => {
        const { bg, fg } = toneColours(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          height: 24,
          px: 2,
          borderRadius: '6px',
          backgroundColor: bg,
          color: fg,
          ...theme.typography.overline,
          whiteSpace: 'nowrap',
        };
      }}
    >
      {icon ? cloneElement(icon, { 'aria-hidden': true, sx: { fontSize: 16 } }) : null}
      {label}
    </Box>
  );
}
