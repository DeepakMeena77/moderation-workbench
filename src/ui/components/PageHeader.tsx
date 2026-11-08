import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { m3, titleGap } from '../theme/theme';

export interface PageHeaderProps {
  /** The navigation section the page belongs to: "Moderation", "Community", "Governance", "Oversight", "System". */
  section: string;
  title: string;
  /** One plain sentence saying what the page is for. */
  description: string;
  /** Optional page-level action on the right (Refresh). */
  action?: ReactNode;
  /** The page's content width (reading or form width), so the action lines up with the content below. */
  maxWidth?: number;
}

/** The small uppercase section label above a page title; pages with their own header (case review) use it too. */
export function PageSectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      component="p"
      sx={(t) => ({ color: m3(t).textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em' })}
    >
      {children}
    </Typography>
  );
}

// Page header (03 sec. 4): a small uppercase section label in the tertiary colour, the page title (the page's one
// h1) and one sentence in the secondary colour saying what the page is for, with an optional action on the right.
export function PageHeader({ section, title, description, action, maxWidth }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        columnGap: 4,
        rowGap: 2,
        mb: titleGap,
        maxWidth,
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <PageSectionLabel>{section}</PageSectionLabel>
        <Typography variant="h1" sx={{ mt: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 680 }}>
          {description}
        </Typography>
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}
