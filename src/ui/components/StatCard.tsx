import Typography from '@mui/material/Typography';
import { m3 } from '../theme/theme';
import { Card } from './Card';

export interface StatCardProps {
  title: string;
  value: string;
  /** One line of context: the window, the counts behind a rate, a trend. */
  detail?: string;
}

// StatCard (03 sec. 4): a plain bordered panel with a muted label, a large number and one line of detail.
export function StatCard({ title, value, detail }: StatCardProps) {
  return (
    <Card component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Typography variant="caption" component="h2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="display" component="p" sx={{ overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      {detail ? (
        <Typography variant="caption" component="p" sx={(t) => ({ color: m3(t).textTertiary })}>
          {detail}
        </Typography>
      ) : null}
    </Card>
  );
}
