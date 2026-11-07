import CheckRounded from '@mui/icons-material/CheckRounded';
import Chip, { type ChipProps } from '@mui/material/Chip';
import { forwardRef } from 'react';
import { layer, layout, m3 } from '../theme/theme';

export interface FilterChipProps extends Omit<ChipProps, 'variant' | 'color' | 'icon' | 'onDelete'> {
  selected: boolean;
}

// Filter chip (03 sec. 4): 28 high, radius 6, a 1 px hairline on the surface colour. Selected: the neutral selected
// fill, a firmer border, darker text and a 14 px check, so the state never rests on colour alone. The caller sets
// the ARIA role and state (aria-pressed for toggles, role="radio" / "checkbox" inside a group).
export const FilterChip = forwardRef<HTMLDivElement, FilterChipProps>(function FilterChip(
  { selected, sx, ...rest },
  ref,
) {
  return (
    <Chip
      ref={ref}
      data-ui="chip"
      icon={selected ? <CheckRounded /> : undefined}
      sx={[
        (t) => {
          const p = m3(t);
          const bg = selected ? p.selected : p.card;
          return {
            ...t.typography.body2,
            position: 'relative',
            flexShrink: 0,
            height: layout.chipHeight,
            borderRadius: `${layout.controlRadius}px`,
            border: `1px solid ${selected ? p.borderStrong : p.border}`,
            backgroundColor: bg,
            color: selected ? p.onSurface : p.onSurfaceVariant,
            '& .MuiChip-label': { px: 3 },
            '& .MuiChip-icon': { color: 'inherit', fontSize: 14, ml: 2, mr: -1 },
            '&:hover': { backgroundColor: layer(p.onSurface, bg, 5) },
            '&.Mui-disabled': { opacity: 0.45 },
            '@media (max-width: 599.95px)': {
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                height: layout.touchTarget,
                transform: 'translateY(-50%)',
              },
            },
          };
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
});
