'use client';

import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';

// 404 (03 sec. 6.13).
export default function NotFound() {
  return (
    <Box component="main" id="content" sx={{ minHeight: '100dvh', px: { xs: 4, sm: 6 }, py: 12 }}>
      <Card sx={{ maxWidth: 680, mx: 'auto' }}>
        <Box
          data-ui="stack"
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, py: 6 }}
        >
          <SearchOffRounded aria-hidden sx={{ fontSize: 48, color: 'text.secondary' }} />
          <Typography variant="h1">Not found</Typography>
          <Typography variant="body2" color="text.secondary">
            This page doesn&apos;t exist or has moved. Check the address, or go back to the start page.
          </Typography>
          <Button variant="tonal" href="/">
            Go to the start page
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
