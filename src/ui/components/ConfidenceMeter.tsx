import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { m3 } from '../theme/theme';

// ConfidenceMeter (03 sec. 4): a text label ("0.72, Likely"), a 4 px bar on a hairline-coloured track (max 240
// wide; grey fill per finding, accent for the recommendation's overall confidence) and the reason. The bar is
// decorative; the label carries the value.

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'Explicit';
  if (value >= 0.7) return 'Likely';
  if (value >= 0.4) return 'Depends on context';
  return 'Speculative';
}

export interface ConfidenceMeterProps {
  value: number | null;
  reason?: string | null;
  /** Shown instead of a value when there is none (AI unavailable). */
  emptyLabel?: string;
  /** main = the recommendation's overall confidence, filled with the accent; detail = per finding, in grey. */
  emphasis?: 'main' | 'detail';
}

export function ConfidenceMeter({
  value,
  reason,
  emptyLabel = 'No AI confidence',
  emphasis = 'detail',
}: ConfidenceMeterProps) {
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
          maxWidth: 240,
          borderRadius: '2px',
          backgroundColor: m3(t).border,
          overflow: 'hidden',
        })}
      >
        {clamped === null ? null : (
          <Box
            sx={(t) => ({
              height: '100%',
              width: `${Math.round(clamped * 100)}%`,
              backgroundColor: emphasis === 'main' ? m3(t).primary : m3(t).onSurfaceVariant,
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
