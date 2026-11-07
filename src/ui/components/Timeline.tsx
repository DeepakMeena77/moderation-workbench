import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { m3 } from '../theme/theme';

// Timeline (03 sec. 4): a 1 px hairline joining 24 px outlined markers with a 14 px monochrome icon; each event is
// plain text beside its marker (title, time, details), grouped by day. The line is a filled box, not a border. An
// ordered list, so screen readers announce the number of events and their order.

export interface TimelineEntry {
  id: string;
  /** ISO time; entries are shown in the order given and grouped by their local day. */
  at: string;
  icon: ReactElement<SvgIconProps>;
  title: string;
  children?: ReactNode;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(entries: readonly TimelineEntry[]): Array<{ day: string; entries: TimelineEntry[] }> {
  const groups: Array<{ day: string; entries: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const day = dayLabel(entry.at);
    const last = groups.at(-1);
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

export function Timeline({ entries, label }: { entries: readonly TimelineEntry[]; label: string }) {
  return (
    <Box
      component="ol"
      aria-label={label}
      data-ui="stack"
      sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {groupByDay(entries).map((group) => (
        <Box component="li" key={group.day} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="overline" component="h3" color="text.secondary">
            {group.day}
          </Typography>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', position: 'relative' }}>
            {group.entries.map((entry, index) => (
              <Box
                component="li"
                key={entry.id}
                sx={{ position: 'relative', display: 'flex', gap: 3, pb: index === group.entries.length - 1 ? 0 : 5 }}
              >
                {index < group.entries.length - 1 ? (
                  <Box
                    aria-hidden
                    sx={(t) => ({
                      position: 'absolute',
                      left: 11,
                      top: 28,
                      bottom: 4,
                      width: '1px',
                      backgroundColor: m3(t).border,
                    })}
                  />
                ) : null}
                <Box
                  aria-hidden
                  sx={(t) => ({
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${m3(t).border}`,
                    backgroundColor: m3(t).card,
                    color: m3(t).onSurfaceVariant,
                    boxSizing: 'border-box',
                  })}
                >
                  {cloneElement(entry.icon, { sx: { fontSize: 14 } })}
                </Box>
                <Box data-ui="section" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 2 }}>
                    <Typography variant="h4" component="p" sx={{ overflowWrap: 'anywhere' }}>
                      {entry.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      <time dateTime={entry.at}>{timeLabel(entry.at)}</time>
                    </Typography>
                  </Box>
                  {entry.children}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
