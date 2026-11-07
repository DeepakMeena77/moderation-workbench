import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { m3 } from '../theme/theme';

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

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
  info: <InfoRounded />,
  success: <CheckCircleRounded />,
  warning: <WarningRounded />,
  error: <ErrorOutlineRounded />,
};

function colours(theme: Theme, tone: BannerTone) {
  const p = m3(theme);
  switch (tone) {
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
// optional action. "AI review unavailable", "Read-only oversight", the 409 "Reload" message.
export function Banner({ tone = 'info', icon, title, children, action, role = 'note' }: BannerProps) {
  return (
    <Box
      role={role}
      sx={(theme) => ({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 3,
        px: 4,
        py: 3,
        borderRadius: '12px',
        ...colours(theme, tone),
      })}
    >
      {cloneElement(icon ?? ICONS[tone], { 'aria-hidden': true, sx: { fontSize: 20, flexShrink: 0 } })}
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        {title ? (
          <Typography variant="h4" component="p">
            {title}
          </Typography>
        ) : null}
        <Typography variant="body2" component="div" sx={{ overflowWrap: 'anywhere' }}>
          {children}
        </Typography>
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}
