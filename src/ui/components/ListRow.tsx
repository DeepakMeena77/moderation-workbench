import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { m3 } from '../theme/theme';

/** The colour of the 4 dp bar at the start of a row: a severity, or none. */
export type RowAccent = 'error' | 'warning' | 'primary' | 'neutral' | null;

export interface ListRowProps {
  href: string;
  selected: boolean;
  /** Up to two lines, clamped. */
  headline: string;
  supporting: string;
  /** Right column: a tag and the age, for example. */
  trailing?: ReactNode;
  /** Decorative: the supporting text names the same thing in words, so colour is never the only signal. */
  accent?: RowAccent;
}

function accentColour(theme: Theme, accent: RowAccent): string {
  const p = m3(theme);
  if (accent === 'error') return p.error;
  if (accent === 'warning') return p.warning;
  if (accent === 'primary') return p.primary;
  if (accent === 'neutral') return p.outline;
  return 'transparent';
}

// A selectable row inside a RowList (03 sec. 4): min height 64, a hover state layer, selected = secondaryContainer
// with aria-current="page". The 4 dp accent bar is a filled box at the row's start, not a border.
export function ListRow({ href, selected, headline, supporting, trailing, accent = null }: ListRowProps) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        component={NextLink}
        href={href}
        scroll={false}
        aria-current={selected ? 'page' : undefined}
        data-ui="section"
        sx={(t) => {
          const bg = selected ? m3(t).selected : m3(t).card;
          return {
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            minHeight: 64,
            px: 4,
            py: 2,
            backgroundColor: bg,
            color: m3(t).onSurface,
            textDecoration: 'none',
            '&:hover': { backgroundColor: `color-mix(in srgb, ${m3(t).onSurface} 8%, ${bg})` },
            '&:focus-visible': { outlineOffset: -3 },
          };
        }}
      >
        {accent ? (
          <Box
            aria-hidden
            sx={(t) => ({
              position: 'absolute',
              insetBlock: 0,
              insetInlineStart: 0,
              width: 4,
              backgroundColor: accentColour(t, accent),
            })}
          />
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            component="p"
            sx={{
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {headline}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
            {supporting}
          </Typography>
        </Box>
        {trailing ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
            {trailing}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
