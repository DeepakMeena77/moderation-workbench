'use client';

import Snackbar from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { m3 } from '../theme/theme';
import { Button } from './Button';

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

export interface SnackbarMessage {
  message: string;
  /** For example "View". Decisions never offer "Undo" (03 sec. 4). */
  action?: SnackbarAction;
}

type Notify = (message: string | SnackbarMessage) => void;

const SnackbarContext = createContext<Notify | null>(null);

export function useSnackbar(): Notify {
  const notify = useContext(SnackbarContext);
  if (!notify) throw new Error('useSnackbar must be used inside SnackbarProvider.');
  return notify;
}

const AUTO_HIDE_MS = 6000; // 03 sec. 4: 4-8 s

// Success and failure feedback for forms (UX-1). role="status" with aria-live="polite" so screen readers
// announce it without interrupting (UX-3). A newer message replaces the current one.
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(SnackbarMessage & { id: number }) | null>(null);

  const notify = useCallback<Notify>((input) => {
    const message = typeof input === 'string' ? { message: input } : input;
    setCurrent({ ...message, id: Date.now() });
  }, []);

  const close = () => setCurrent(null);

  return (
    <SnackbarContext.Provider value={notify}>
      {children}
      <Snackbar
        key={current?.id}
        open={current !== null}
        autoHideDuration={AUTO_HIDE_MS}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') close();
        }}
        message={current?.message}
        action={
          current?.action ? (
            <Button
              variant="text"
              onClick={() => {
                current.action?.onClick();
                close();
              }}
              sx={(theme) => ({ color: m3(theme).inverseOnSurface })}
            >
              {current.action.label}
            </Button>
          ) : undefined
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        // Above the 80 dp navigation bar on compact screens, so the bar stays usable (05 sec. 6.3).
        sx={{ bottom: { xs: 96, sm: 24 } }}
        slotProps={{
          content: {
            role: 'status',
            'aria-live': 'polite',
            sx: (theme) => ({
              backgroundColor: m3(theme).inverseSurface,
              color: m3(theme).inverseOnSurface,
              borderRadius: '4px',
              boxShadow: 'none',
              ...theme.typography.body2,
            }),
          },
        }}
      />
    </SnackbarContext.Provider>
  );
}
