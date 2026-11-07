import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { layout } from '../theme/theme';

// Placeholders shaped like the final content (03 sec. 4). The shimmer stops under prefers-reduced-motion
// through the global rule in the theme.

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={64} sx={{ borderRadius: `${layout.cardRadius}px` }} />
      ))}
    </Box>
  );
}

export function CardSkeleton({ height = 160 }: { height?: number }) {
  return <Skeleton variant="rounded" height={height} sx={{ borderRadius: `${layout.cardRadius}px` }} />;
}
