import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import { layer, m3 } from '../theme/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'color'> {
  /** primary = the main action of a view (solid accent); secondary = white with a 1 px border; ghost = low emphasis. */
  variant?: ButtonVariant;
  /** Primary: a solid red button for destructive confirmations. Ghost: neutral at rest, red on hover and focus. */
  destructive?: boolean;
}

// Buttons (03 sec. 4): radius 6, 32 high, or 36 with size="large" for the main action of a page. Shape, height and
// the phone touch-target extension come from the theme; this sets the colours of each variant.
export function Button({ variant = 'primary', destructive = false, sx, ...rest }: ButtonProps) {
  return (
    <MuiButton
      data-ui="button"
      variant={variant === 'primary' ? 'contained' : 'text'}
      disableElevation
      sx={[
        (theme) => {
          const p = m3(theme);
          if (variant === 'primary') {
            const bg = destructive ? p.error : p.primary;
            const fg = destructive ? p.onError : p.onPrimary;
            return {
              backgroundColor: bg,
              color: fg,
              '&:hover': { backgroundColor: layer(p.onSurface, bg, 12) },
              '&.Mui-disabled': { backgroundColor: bg, color: fg, opacity: 0.5 },
            };
          }
          if (variant === 'secondary') {
            return {
              backgroundColor: p.card,
              color: p.onSurface,
              border: `1px solid ${p.borderStrong}`,
              '&:hover': { backgroundColor: layer(p.onSurface, p.card, 5), borderColor: p.borderHover },
              '&.Mui-disabled': { color: p.onSurface, opacity: 0.5 },
            };
          }
          // A transparent 1 px border, so a ghost button lines up with the bordered secondary button beside it.
          return {
            color: p.onSurface,
            border: '1px solid transparent',
            '&:hover': destructive
              ? { color: p.error, backgroundColor: layer(p.error, 'transparent', 8) }
              : { backgroundColor: layer(p.onSurface, 'transparent', 6) },
            ...(destructive ? { '&.Mui-focusVisible': { color: p.error } } : {}),
            '&.Mui-disabled': { color: p.onSurfaceVariant, opacity: 0.6 },
          };
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
}
