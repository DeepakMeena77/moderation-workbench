import Typography from '@mui/material/Typography';
import { Card } from './Card';

export interface StatCardProps {
  title: string;
  value: string;
  /** One line of context: the window, the counts behind a rate, a trend. */
  detail?: string;
}

// StatCard (03 sec. 4): a card with a labelMedium title, a displaySmall value and a bodySmall detail.
export function StatCard({ title, value, detail }: StatCardProps) {
  return (
    <Card component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Typography variant="overline" component="h2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="display" component="p" sx={{ overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      {detail ? (
        <Typography variant="caption" color="text.secondary" component="p">
          {detail}
        </Typography>
      ) : null}
    </Card>
  );
}
