import MuiIconButton, { type IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { m3 } from '../theme/theme';

export interface IconButtonProps extends Omit<MuiIconButtonProps, 'aria-label' | 'color' | 'size'> {
  /** Required: the accessible name and the tooltip (03 sec. 4), because an icon alone has no text. */
  label: string;
  tonal?: boolean;
}

// A 48 x 48 touch target (03 sec. 4 and sec. 5). The tooltip also shows on keyboard focus.
export function IconButton({ label, tonal = false, sx, children, ...rest }: IconButtonProps) {
  return (
    <Tooltip title={label}>
      <MuiIconButton
        aria-label={label}
        sx={[
          (theme) => ({
            width: 48,
            height: 48,
            color: m3(theme).onSurfaceVariant,
            ...(tonal ? { backgroundColor: m3(theme).secondaryContainer, color: m3(theme).onSecondaryContainer } : {}),
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...rest}
      >
        {children}
      </MuiIconButton>
    </Tooltip>
  );
}
