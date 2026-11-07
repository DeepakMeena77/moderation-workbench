import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { m3 } from '../theme/theme';

// ConfidenceMeter (03 sec. 4 and sec. 2.3): a 4 dp bar plus a text label ("0.72, Likely") and the reason. The
// bar is decorative; the label carries the value, so colour is never the only signal.

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'Explicit';
  if (value >= 0.7) return 'Likely';
  if (value >= 0.4) return 'Depends on context';
  return 'Speculative';
}

function barColour(theme: Theme, value: number): string {
  const p = m3(theme);
  if (value >= 0.9) return p.success;
  if (value >= 0.7) return p.primary;
  if (value >= 0.4) return p.warning;
  return p.error;
}

export interface ConfidenceMeterProps {
  value: number | null;
  reason?: string | null;
  /** Shown instead of a value when there is none (AI unavailable). */
  emptyLabel?: string;
}

export function ConfidenceMeter({ value, reason, emptyLabel = 'No AI confidence' }: ConfidenceMeterProps) {
  const clamped = value === null ? null : Math.min(1, Math.max(0, value));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Typography variant="body2">
        <Box component="span" sx={{ fontWeight: 500 }}>
          Confidence:{' '}
        </Box>
        {clamped === null ? emptyLabel : `${clamped.toFixed(2)}, ${confidenceLabel(clamped)}`}
      </Typography>
      <Box
        aria-hidden
        sx={(t) => ({
          height: 4,
          borderRadius: 9999,
          backgroundColor: m3(t).surfaceContainerHighest,
          overflow: 'hidden',
        })}
      >
        {clamped === null ? null : (
          <Box
            sx={(t) => ({
              height: '100%',
              width: `${Math.round(clamped * 100)}%`,
              backgroundColor: barColour(t, clamped),
            })}
          />
        )}
      </Box>
      {reason ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
          {reason}
        </Typography>
      ) : null}
    </Box>
  );
}
