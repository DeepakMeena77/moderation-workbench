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
  /** Usually a ghost or secondary Button: "Reload", "Show anyway". */
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

/** Background, text, border and icon colour per tone: a neutral or soft semantic panel (03 sec. 4). */
function colours(theme: Theme, tone: BannerTone) {
  const p = m3(theme);
  switch (tone) {
    case 'neutral':
      return { bg: p.cardNested, fg: p.onSurface, border: p.border, icon: p.onSurfaceVariant };
    case 'info':
      return { bg: p.primaryContainer, fg: p.onPrimaryContainer, border: p.infoBorder, icon: p.primary };
    case 'success':
      return { bg: p.successContainer, fg: p.onSuccessContainer, border: p.successBorder, icon: p.success };
    case 'warning':
      return { bg: p.warningContainer, fg: p.onWarningContainer, border: p.warningBorder, icon: p.warning };
    case 'error':
      return { bg: p.errorContainer, fg: p.onErrorContainer, border: p.errorBorder, icon: p.error };
  }
}

// Inline banner (03 sec. 4): a neutral or soft semantic panel with a 1 px border in its hue, radius 6, and an
// 18 px icon, the message and an optional action on one row, centred vertically. When the banner is narrower than
// 480 px the action moves under the message and lines up with its text (a container query, so it works inside panes
// and cards too). "AI review unavailable", "Read-only oversight", the 409 "Reload" message, a limited post.
export function Banner({ tone = 'neutral', icon, title, children, action, role = 'note' }: BannerProps) {
  return (
    <Box sx={{ containerType: 'inline-size', minWidth: 0 }}>
      <Box
        role={role}
        sx={(theme) => {
          const c = colours(theme, tone);
          return {
            display: 'grid',
            gridTemplateColumns: action ? 'auto minmax(0, 1fr) auto' : 'auto minmax(0, 1fr)',
            alignItems: 'center',
            columnGap: 3,
            rowGap: 1,
            minHeight: 40,
            px: 3,
            py: 1,
            borderRadius: `${layout.controlRadius}px`,
            border: `1px solid ${c.border}`,
            backgroundColor: c.bg,
            color: c.fg,
            '& > svg': { color: c.icon },
            '@container (max-width: 480px)': {
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              alignItems: 'start',
              '& > svg': { color: c.icon, mt: 2 },
              '& .banner-action': { gridColumn: 2, justifySelf: 'start', ml: -3 },
            },
          };
        }}
      >
        {cloneElement(icon ?? ICONS[tone], { 'aria-hidden': true, sx: { fontSize: 18, display: 'block' } })}
        <Box sx={{ minWidth: 0, py: 2 }}>
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
