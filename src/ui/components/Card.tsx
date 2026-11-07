import MuiCard, { type CardProps as MuiCardProps } from '@mui/material/Card';
import { layout, m3 } from '../theme/theme';

export type CardProps = Omit<MuiCardProps, 'variant' | 'elevation' | 'raised'>;

// A card or panel (03 sec. 4): the surface colour with a 1 px hairline, radius 8, padding 12 on phones and 16 from
// 840 px, no shadow.
export function Card({ sx, children, ...rest }: CardProps) {
  return (
    <MuiCard
      data-ui="card"
      elevation={0}
      sx={[
        (theme) => ({
          borderRadius: `${layout.cardRadius}px`,
          border: `1px solid ${m3(theme).border}`,
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
