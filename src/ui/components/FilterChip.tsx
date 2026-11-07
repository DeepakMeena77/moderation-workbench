import CheckRounded from '@mui/icons-material/CheckRounded';
import Chip, { type ChipProps } from '@mui/material/Chip';
import { forwardRef } from 'react';
import { m3 } from '../theme/theme';

export interface FilterChipProps extends Omit<ChipProps, 'variant' | 'color' | 'icon' | 'onDelete'> {
  selected: boolean;
}

// Filter chip (03 sec. 4): height 32, radius 8, labelLarge. Unselected uses the field fill with no outline;
// selected uses secondaryContainer with a leading check icon. The caller sets the ARIA role and state
// (aria-pressed for toggles, role="radio" / "checkbox" inside a group).
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
        (t) => ({
          ...t.typography.button,
          flexShrink: 0,
          backgroundColor: selected ? m3(t).secondaryContainer : m3(t).field,
          color: selected ? m3(t).onSecondaryContainer : m3(t).onSurfaceVariant,
          '& .MuiChip-icon': { color: 'inherit', fontSize: 20 },
          '&:hover': {
            backgroundColor: `color-mix(in srgb, ${m3(t).onSurface} 8%, ${selected ? m3(t).secondaryContainer : m3(t).field})`,
          },
          '&.Mui-disabled': { opacity: 0.38 },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
});
