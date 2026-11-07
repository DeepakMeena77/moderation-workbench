import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { layout, m3 } from '../theme/theme';

export type BannerTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface BannerProps {
  tone?: BannerTone;
  /** Defaults to the tone's icon; the message carries the meaning, the icon is decorative. */
  icon?: ReactElement<SvgIconProps>;
  title?: string;
  children: ReactNode;
  /** Usually a text or tonal Button: "Reload", "Re-analyse". */
  action?: ReactNode;
  /** alert for errors that need attention now, status for progress, note for standing information. */
  role?: 'alert' | 'status' | 'note';
}

const ICONS: Record<BannerTone, ReactElement<SvgIconProps>> = {
  neutral: <InfoRounded />,
  info: <InfoRounded />,
  success: <CheckCircleRounded />,
  warning: <WarningRounded />,
  error: <ErrorOutlineRounded />,
};

function colours(theme: Theme, tone: BannerTone) {
  const p = m3(theme);
  switch (tone) {
    case 'neutral':
      return { backgroundColor: p.cardNested, color: p.onSurface };
    case 'info':
      return { backgroundColor: p.secondaryContainer, color: p.onSecondaryContainer };
    case 'success':
      return { backgroundColor: p.successContainer, color: p.onSuccessContainer };
    case 'warning':
      return { backgroundColor: p.warningContainer, color: p.onWarningContainer };
    case 'error':
      return { backgroundColor: p.errorContainer, color: p.onErrorContainer };
  }
}

// Inline banner (03 sec. 4): a nested section in the semantic container colour with an icon, a message and an
// optional action on one row, centred vertically. When the banner is narrower than 480 px the action moves
// under the message and lines up with its text (a container query, so it works inside panes and cards too).
// "AI review unavailable", "Read-only oversight", the 409 "Reload" message, a limited post.
export function Banner({ tone = 'info', icon, title, children, action, role = 'note' }: BannerProps) {
  return (
    <Box sx={{ containerType: 'inline-size', minWidth: 0 }}>
      <Box
        role={role}
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: action ? 'auto minmax(0, 1fr) auto' : 'auto minmax(0, 1fr)',
          alignItems: 'center',
          columnGap: 3,
          rowGap: 1,
          minHeight: 48,
          px: 4,
          py: 2,
          borderRadius: `${layout.nestedRadius}px`,
          ...colours(theme, tone),
          '@container (max-width: 480px)': {
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'start',
            '& > svg': { mt: 1 },
            '& .banner-action': { gridColumn: 2, justifySelf: 'start', ml: -3 },
          },
        })}
      >
        {cloneElement(icon ?? ICONS[tone], { 'aria-hidden': true, sx: { fontSize: 20, display: 'block' } })}
        <Box sx={{ minWidth: 0, py: 1 }}>
          {title ? (
            <Typography variant="h4" component="p">
              {title}
            </Typography>
          ) : null}
          <Typography variant="body2" component="div" sx={{ overflowWrap: 'anywhere' }}>
            {children}
          </Typography>
        </Box>
        {action ? (
          <Box className="banner-action" sx={{ my: -1, mr: -2 }}>
            {action}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
