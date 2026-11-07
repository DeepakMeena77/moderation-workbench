import MuiCard, { type CardProps as MuiCardProps } from '@mui/material/Card';
import { layout, m3 } from '../theme/theme';

export type CardProps = Omit<MuiCardProps, 'variant' | 'elevation' | 'raised'>;

// A tonal card: white (light) or surfaceContainer (dark) on the canvas, radius 8, padding 12 / 16, no border and
// no shadow (03 sec. 4).
export function Card({ sx, children, ...rest }: CardProps) {
  return (
    <MuiCard
      data-ui="card"
      elevation={0}
      sx={[
        (theme) => ({
          borderRadius: `${layout.cardRadius}px`,
          border: 0,
          boxShadow: 'none',
          backgroundColor: m3(theme).card,
          p: layout.cardPadding,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </MuiCard>
  );
}
