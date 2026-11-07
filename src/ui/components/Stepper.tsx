import CheckRounded from '@mui/icons-material/CheckRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { m3 } from '../theme/theme';

export interface StepperProps {
  /** Names the list for assistive technology, e.g. "Publish steps". */
  label: string;
  steps: readonly string[];
  /** The current step, 1-based. Earlier steps show as done. */
  current: number;
}

// Stepper (03 sec. 4): numbered 24 dp markers joined by a 1 dp line, the current step in primary with its label at
// weight 500, done steps with a check. An ordered list; the current label carries aria-current="step". Below
// 600 px of container width the steps stack; above it, long labels wrap instead of running into the next step.
export function Stepper({ label, steps, current }: StepperProps) {
  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Box
        component="ol"
        aria-label={label}
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          '@container (max-width: 600px)': {
            flexDirection: 'column',
            alignItems: 'flex-start',
            '& .step-line': { display: 'none' },
          },
        }}
      >
        {steps.map((step, index) => {
          const number = index + 1;
          const done = number < current;
          const active = number === current;
          return (
            <Box
              component="li"
              key={step}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                minWidth: 0,
                flex: index < steps.length - 1 ? '1 1 0' : '0 1 auto',
              }}
            >
              <Box
                aria-hidden
                sx={(t) => ({
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...t.typography.overline,
                  backgroundColor: active || done ? m3(t).primary : m3(t).surfaceContainerHighest,
                  color: active || done ? m3(t).onPrimary : m3(t).onSurfaceVariant,
                })}
              >
                {done ? <CheckRounded sx={{ fontSize: 16 }} /> : number}
              </Box>
              <Typography
                variant="body2"
                component="span"
                aria-current={active ? 'step' : undefined}
                sx={(t) => ({
                  fontWeight: active ? 500 : 400,
                  color: active ? m3(t).onSurface : m3(t).onSurfaceVariant,
                  minWidth: 0,
                  overflowWrap: 'break-word',
                })}
              >
                <Box component="span" sx={visuallyHidden}>
                  {`Step ${number}${done ? ', done' : ''}: `}
                </Box>
                {step}
              </Typography>
              {index < steps.length - 1 ? (
                <Box
                  aria-hidden
                  className="step-line"
                  sx={(t) => ({ flex: 1, minWidth: 16, height: 1, backgroundColor: m3(t).outlineVariant })}
                />
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
