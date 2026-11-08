'use client';

import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { PageHeader } from '@/ui/components/PageHeader';
import { layout, pageSx } from '@/ui/theme/theme';

// 404 (03 sec. 6.13).
export default function NotFound() {
  return (
    <Box component="main" id="content" sx={{ minHeight: '100dvh', ...pageSx, pt: { xs: 6, sm: 10 } }}>
      <PageHeader
        section="System"
        title="Not found"
        description="There is no page at this address."
        maxWidth={layout.readingWidth}
      />
      <Card sx={{ maxWidth: layout.readingWidth }}>
        <Box data-ui="stack" sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          <SearchOffRounded aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
            <Typography variant="body2">
              This page doesn&apos;t exist or has moved. Check the address, or go back to the start page.
            </Typography>
            <Button variant="secondary" href="/">
              Go to the start page
            </Button>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}
