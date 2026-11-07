import MuiIconButton, { type IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { layer, m3 } from '../theme/theme';

export interface IconButtonProps extends Omit<MuiIconButtonProps, 'aria-label' | 'color' | 'size'> {
  /** Required: the accessible name and the tooltip (03 sec. 4), because an icon alone has no text. */
  label: string;
}

// An icon button (03 sec. 4): 32 x 32, radius 6, an 18 px monochrome icon, a flat hover layer. On phones the theme
// extends the hit area to 44 px. The tooltip also shows on keyboard focus.
export function IconButton({ label, sx, children, ...rest }: IconButtonProps) {
  return (
    <Tooltip title={label}>
      <MuiIconButton
        aria-label={label}
        sx={[
          (theme) => ({
            width: 32,
            height: 32,
            color: m3(theme).onSurfaceVariant,
            '& svg': { fontSize: 18 },
            '&:hover': { backgroundColor: layer(m3(theme).onSurface, 'transparent', 6) },
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
