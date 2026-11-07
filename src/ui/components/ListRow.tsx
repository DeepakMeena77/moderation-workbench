import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { layer, m3 } from '../theme/theme';
import { Dot, type DotTone } from './Tag';

export interface ListRowProps {
  href: string;
  selected: boolean;
  /** Up to two lines, clamped. */
  headline: string;
  supporting: string;
  /** Right column: a badge and the age, for example. */
  trailing?: ReactNode;
  /** A severity dot before the supporting text, which starts with the severity in words. */
  dot?: DotTone | null;
}

// A selectable row inside a RowList (03 sec. 4): min height 56, a flat hover layer, selected = the neutral selected
// fill with a 2 px accent marker at the start and aria-current="page". The marker is a filled box, not a border.
export function ListRow({ href, selected, headline, supporting, trailing, dot = null }: ListRowProps) {
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
            minHeight: 56,
            px: 4,
            py: 3,
            backgroundColor: bg,
            color: m3(t).onSurface,
            textDecoration: 'none',
            '&:hover': { backgroundColor: layer(m3(t).onSurface, bg, 4) },
            '&:focus-visible': { outlineOffset: -2 },
          };
        }}
      >
        {selected ? (
          <Box
            aria-hidden
            sx={(t) => ({
              position: 'absolute',
              insetBlock: 0,
              insetInlineStart: 0,
              width: 2,
              backgroundColor: m3(t).primary,
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
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, overflowWrap: 'anywhere' }}
          >
            {dot ? <Dot tone={dot} /> : null}
            <span>{supporting}</span>
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
