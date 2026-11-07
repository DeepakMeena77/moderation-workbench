import MuiCard, { type CardProps as MuiCardProps } from '@mui/material/Card';
import { m3 } from '../theme/theme';

export type CardProps = Omit<MuiCardProps, 'variant' | 'elevation' | 'raised'>;

// A tonal card: white (light) or surfaceContainer (dark) on the canvas, no border, no shadow (03 sec. 4).
export function Card({ sx, children, ...rest }: CardProps) {
  return (
    <MuiCard
      data-ui="card"
      elevation={0}
      sx={[
        (theme) => ({
          borderRadius: 1,
          border: 0,
          boxShadow: 'none',
          backgroundColor: m3(theme).card,
          p: { xs: 4, md: 6 },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </MuiCard>
  );
}
