import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Tag } from '../../components/Tag';
import { m3 } from '../../theme/theme';
import type { PolicyDiff } from './api';

// DiffView (03 sec. 6.9, POL-5): clauses added, removed and changed, the changed ones field by field with
// before and after. Values are shown as plain text (JSON for arrays and objects); never as HTML.

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(not set)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h4" component="h3">
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const nested = { borderRadius: '12px', p: 4, display: 'flex', flexDirection: 'column', gap: 2 } as const;

export function DiffView({ diff, fromLabel, toLabel }: { diff: PolicyDiff; fromLabel: string; toLabel: string }) {
  const empty = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {empty
          ? `No clause differences between ${fromLabel} and ${toLabel}.`
          : `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed, ` +
            `${diff.unchanged.length} unchanged (${fromLabel} -> ${toLabel}).`}
      </Typography>

      {diff.added.length > 0 ? (
        <Section title="Added">
          {diff.added.map((clause) => (
            <Box key={clause.code} data-ui="section" sx={(t) => ({ ...nested, backgroundColor: m3(t).cardNested })}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Tag label="Added" tone="success" icon={<AddRounded />} />
                <Typography variant="h4" component="p">
                  {clause.code} - {clause.title}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {clause.text}
              </Typography>
            </Box>
          ))}
        </Section>
      ) : null}

      {diff.removed.length > 0 ? (
        <Section title="Removed">
          {diff.removed.map((clause) => (
            <Box key={clause.code} data-ui="section" sx={(t) => ({ ...nested, backgroundColor: m3(t).cardNested })}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Tag label="Removed" tone="error" icon={<RemoveRounded />} />
                <Typography variant="h4" component="p">
                  {clause.code} - {clause.title}
                </Typography>
              </Box>
            </Box>
          ))}
        </Section>
      ) : null}

      {diff.changed.length > 0 ? (
        <Section title="Changed">
          {diff.changed.map((clause) => (
            <Box key={clause.code} data-ui="section" sx={(t) => ({ ...nested, backgroundColor: m3(t).cardNested })}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Tag label="Changed" tone="warning" icon={<EditRounded />} />
                <Typography variant="h4" component="p">
                  {clause.code} - {clause.title}
                </Typography>
              </Box>
              <Box component="dl" sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {clause.changes.map((change) => (
                  <Box key={change.field} sx={{ minWidth: 0 }}>
                    <Typography component="dt" variant="overline" color="text.secondary">
                      {change.field}
                    </Typography>
                    <Box component="dd" sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          Before:{' '}
                        </Box>
                        {formatValue(change.before)}
                      </Typography>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          After:{' '}
                        </Box>
                        {formatValue(change.after)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Section>
      ) : null}
    </Box>
  );
}
