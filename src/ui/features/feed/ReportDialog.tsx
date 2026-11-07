'use client';

import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme, type Theme } from '@mui/material/styles';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError } from '../../api/client';
import { REPORT_REASONS, useReportContent, type ReportReason } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/FilterChip';
import { useSnackbar } from '../../components/SnackbarProvider';
import { m3 } from '../../theme/theme';

// Report form (03 sec. 6.2, CNT-3): reason filter chips (single choice), an optional note of up to 500
// characters and Submit. A bottom sheet on compact screens, a dialog from 600 px. Esc and the scrim close it;
// focus returns to the Report button.

export const MAX_NOTE_CHARS = 500;

export interface ReportTarget {
  id: string;
  type: 'post' | 'comment';
  authorName: string;
}

export function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  const open = target !== null;

  if (compact) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': titleId,
            sx: (t: Theme) => ({
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              backgroundColor: m3(t).card,
              borderTop: `1px solid ${m3(t).border}`,
              px: 4,
              pb: 6,
              maxHeight: '90dvh',
            }),
          },
        }}
      >
        <Box
          aria-hidden
          sx={(t) => ({
            width: 32,
            height: 4,
            borderRadius: '2px',
            mx: 'auto',
            mt: 4,
            mb: 2,
            backgroundColor: m3(t).onSurfaceVariant,
            opacity: 0.4,
          })}
        />
        {target ? <ReportForm key={target.id} target={target} titleId={titleId} onDone={onClose} /> : null}
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: { elevation: 0, sx: { p: 6 } },
      }}
    >
      {target ? <ReportForm key={target.id} target={target} titleId={titleId} onDone={onClose} /> : null}
    </Dialog>
  );
}

function ReportForm({ target, titleId, onDone }: { target: ReportTarget; titleId: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const report = useReportContent();
  const notify = useSnackbar();
  const reasonLabelId = useId();
  const reasonErrorId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (report.isPending) return;
    setFormError(null);
    const nextReasonError = reason ? null : 'Choose a reason.';
    const nextNoteError =
      note.trim().length > MAX_NOTE_CHARS ? `Keep the note under ${MAX_NOTE_CHARS} characters.` : null;
    setReasonError(nextReasonError);
    setNoteError(nextNoteError);
    if (nextReasonError || !reason) {
      chipRefs.current[0]?.focus();
      return;
    }
    if (nextNoteError) {
      noteRef.current?.focus();
      return;
    }
    report.mutate(
      { contentId: target.id, reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          notify('Report sent. A moderator will review it.');
          onDone();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'ALREADY_REPORTED') {
            notify(error.message);
            onDone();
            return;
          }
          // Choices are kept; the user can retry.
          setFormError(error instanceof ApiError ? error.message : "Couldn't send the report. Try again.");
        },
      },
    );
  };

  // Arrow keys move between the reason chips (03 sec. 8); Space or Enter selects.
  const onChipKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + REPORT_REASONS.length) % REPORT_REASONS.length;
    chipRefs.current[next]?.focus();
  };

  return (
    <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box>
        <Typography id={titleId} variant="h2" component="h2">
          Report this {target.type}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {target.authorName} will not see who reported it.
        </Typography>
      </Box>

      <Box>
        <Typography id={reasonLabelId} variant="h4" component="p" sx={{ mb: 2 }}>
          Reason
        </Typography>
        <Box
          role="radiogroup"
          aria-labelledby={reasonLabelId}
          aria-describedby={reasonError ? reasonErrorId : undefined}
          aria-invalid={reasonError ? true : undefined}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}
        >
          {REPORT_REASONS.map((option, index) => {
            const selected = reason === option.value;
            return (
              <FilterChip
                key={option.value}
                ref={(node: HTMLDivElement | null) => {
                  chipRefs.current[index] = node;
                }}
                selected={selected}
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (reason === null && index === 0) ? 0 : -1}
                label={option.label}
                onClick={() => {
                  setReason(option.value);
                  setReasonError(null);
                }}
                onKeyDown={(event) => onChipKeyDown(event, index)}
              />
            );
          })}
        </Box>
        {reasonError ? (
          <Typography id={reasonErrorId} variant="caption" component="p" color="error" sx={{ mt: 2 }}>
            {reasonError}
          </Typography>
        ) : null}
      </Box>

      <TextField
        inputRef={noteRef}
        label="Note (optional)"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          if (noteError) setNoteError(null);
        }}
        multiline
        minRows={2}
        fullWidth
        error={Boolean(noteError) || note.length > MAX_NOTE_CHARS}
        helperText={
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <span>{noteError ?? ''}</span>
            <span aria-label={`${note.length} of ${MAX_NOTE_CHARS} characters`}>
              {note.length}/{MAX_NOTE_CHARS}
            </span>
          </Box>
        }
      />

      {formError ? (
        <Banner tone="error" role="alert">
          {formError}
        </Banner>
      ) : null}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={report.isPending}>
          Submit report
        </Button>
      </Box>
    </Box>
  );
}
