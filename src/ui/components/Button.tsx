import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import { m3 } from '../theme/theme';

export type ButtonVariant = 'filled' | 'tonal' | 'text';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'color'> {
  /** filled = the one primary action per view; tonal = secondary actions; text = low emphasis. */
  variant?: ButtonVariant;
  /** Filled error button for destructive confirmations. */
  destructive?: boolean;
}

// Pill buttons only; there is no outlined variant (03 sec. 4). Shape and height come from the theme.
export function Button({ variant = 'filled', destructive = false, sx, ...rest }: ButtonProps) {
  const muiVariant = variant === 'text' ? 'text' : 'contained';
  return (
    <MuiButton
      data-ui="button"
      variant={muiVariant}
      color={destructive ? 'error' : 'primary'}
      disableElevation
      sx={[
        (theme) =>
          variant === 'tonal'
            ? {
                backgroundColor: m3(theme).secondaryContainer,
                color: m3(theme).onSecondaryContainer,
                '&:hover': {
                  backgroundColor: `color-mix(in srgb, ${m3(theme).onSecondaryContainer} 8%, ${m3(theme).secondaryContainer})`,
                },
              }
            : {},
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
}
