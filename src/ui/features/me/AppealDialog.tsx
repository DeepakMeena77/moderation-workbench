'use client';

import CloseRounded from '@mui/icons-material/CloseRounded';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme, type Theme } from '@mui/material/styles';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateAppeal, type MyContentItem } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { useSnackbar } from '../../components/SnackbarProvider';
import { m3 } from '../../theme/theme';
import { shortDate } from '../feed/format';
import {
  APPEAL_FIELDS,
  EMPTY_APPEAL,
  linkError,
  MAX_LINKS,
  MAX_NOTE_CHARS,
  MAX_STATEMENT_CHARS,
  MIN_STATEMENT_CHARS,
  toAppealRequest,
  validateAppeal,
  type AppealDraft,
  type AppealErrors,
  type AppealField,
} from './appealForm';

// The appeal form (03 sec. 6.3, APP-1): a statement (20-2,000 characters), up to 3 evidence links as input chips,
// and an optional note. A full-screen dialog on compact screens, a dialog from 600 px. On any failure the dialog
// stays open with everything typed; a conflict (already appealed, window closed) explains itself in a banner.

export interface AppealTarget {
  item: MyContentItem;
  decisionId: string;
}

export function AppealDialog({ target, onClose }: { target: AppealTarget | null; onClose: () => void }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const titleId = useId();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      aria-labelledby={titleId}
      fullScreen={compact}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          elevation: 0,
          sx: (t: Theme) => ({ backgroundColor: m3(t).surfaceContainerHigh, p: { xs: 4, sm: 6 } }),
        },
      }}
    >
      {target ? <AppealForm key={target.decisionId} target={target} titleId={titleId} onDone={onClose} /> : null}
    </Dialog>
  );
}

export function AppealForm({ target, titleId, onDone }: { target: AppealTarget; titleId: string; onDone: () => void }) {
  const [draft, setDraft] = useState<AppealDraft>(EMPTY_APPEAL);
  const [errors, setErrors] = useState<AppealErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const create = useCreateAppeal(target.decisionId);
  const notify = useSnackbar();
  const statementRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const linksLabelId = useId();
  const { item } = target;
  const until = item.appealability?.until ?? null;

  const focus = (field: AppealField) => {
    if (field === 'statement') statementRef.current?.focus();
    else if (field === 'links') linkRef.current?.focus();
    else noteRef.current?.focus();
  };

  const update = (patch: Partial<AppealDraft>, field: AppealField) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const addLink = () => {
    const problem = linkError(draft.linkInput, draft.links);
    if (problem) {
      setErrors((e) => ({ ...e, links: problem }));
      linkRef.current?.focus();
      return;
    }
    update({ links: [...draft.links, draft.linkInput.trim()], linkInput: '' }, 'links');
  };

  const onLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (draft.linkInput.trim()) addLink();
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    setFailure(null);
    const found = validateAppeal(draft);
    setErrors(found);
    const first = APPEAL_FIELDS.find((f) => found[f]);
    if (first) {
      focus(first);
      return;
    }
    create.mutate(toAppealRequest(draft), {
      onSuccess: () => {
        notify('Appeal sent. A senior moderator will review it.');
        onDone();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
          const fromServer: AppealErrors = {};
          for (const detail of error.details as Array<{ path?: unknown; message?: unknown }>) {
            const key = typeof detail.path === 'string' ? detail.path.split('.')[0] : '';
            const field: AppealField | null =
              key === 'statement'
                ? 'statement'
                : key === 'evidenceLinks'
                  ? 'links'
                  : key === 'evidenceNote'
                    ? 'note'
                    : null;
            if (field && typeof detail.message === 'string') fromServer[field] = detail.message;
          }
          setErrors(fromServer);
          const firstServer = APPEAL_FIELDS.find((f) => fromServer[f]);
          if (firstServer) focus(firstServer);
        }
        setFailure(
          error instanceof ApiError && error.status !== 0 && error.status < 500
            ? error.message
            : "Couldn't send your appeal. What you wrote is kept - try again.",
        );
      },
    });
  };

  const statementLength = draft.statement.trim().length;

  return (
    <Box
      component="form"
      noValidate
      aria-labelledby={titleId}
      onSubmit={submit}
      sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="h2" component="h2">
            Appeal this decision
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
            {item.decision?.summary}
            {until ? ` You can appeal until ${shortDate(until)}.` : ''}
          </Typography>
        </Box>
        <IconButton label="Close" onClick={onDone} sx={{ mt: -2, mr: -2 }}>
          <CloseRounded />
        </IconButton>
      </Box>

      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        A senior moderator who did not make the original decision will review it. You can appeal once.
      </Typography>

      <TextField
        inputRef={statementRef}
        label="Why should the decision change?"
        value={draft.statement}
        onChange={(event) => update({ statement: event.target.value }, 'statement')}
        multiline
        minRows={4}
        fullWidth
        required
        error={Boolean(errors.statement)}
        helperText={
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <span>{errors.statement ?? `At least ${MIN_STATEMENT_CHARS} characters.`}</span>
            <span aria-label={`${statementLength} of ${MAX_STATEMENT_CHARS} characters`}>
              {statementLength}/{MAX_STATEMENT_CHARS}
            </span>
          </Box>
        }
        slotProps={{ formHelperText: { sx: (t) => ({ ...t.typography.caption, mx: 4 }) } }}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography id={linksLabelId} variant="h4" component="p">
          Evidence links (optional, up to {MAX_LINKS})
        </Typography>
        {draft.links.length > 0 ? (
          <Box
            component="ul"
            aria-labelledby={linksLabelId}
            sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 2 }}
          >
            {draft.links.map((link) => (
              <Box component="li" key={link} sx={{ maxWidth: '100%' }}>
                <Chip
                  data-ui="chip"
                  label={link}
                  onDelete={() => update({ links: draft.links.filter((l) => l !== link) }, 'links')}
                  deleteIcon={<CloseRounded aria-label={`Remove ${link}`} />}
                  sx={(t) => ({
                    ...t.typography.button,
                    maxWidth: '100%',
                    backgroundColor: m3(t).field,
                    color: m3(t).onSurfaceVariant,
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                    '& .MuiChip-deleteIcon': { color: 'inherit', fontSize: 18 },
                  })}
                />
              </Box>
            ))}
          </Box>
        ) : null}
        {draft.links.length < MAX_LINKS ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2 }}>
            <TextField
              inputRef={linkRef}
              label="Link"
              placeholder="https://"
              value={draft.linkInput}
              onChange={(event) => update({ linkInput: event.target.value }, 'links')}
              onKeyDown={onLinkKeyDown}
              error={Boolean(errors.links)}
              helperText={errors.links ?? ' '}
              slotProps={{ htmlInput: { inputMode: 'url' } }}
              sx={{ flex: '1 1 220px' }}
            />
            <Button variant="tonal" onClick={addLink} disabled={!draft.linkInput.trim()} sx={{ mt: 2 }}>
              Add link
            </Button>
          </Box>
        ) : null}
      </Box>

      <TextField
        inputRef={noteRef}
        label="Note (optional)"
        value={draft.note}
        onChange={(event) => update({ note: event.target.value }, 'note')}
        multiline
        minRows={2}
        fullWidth
        error={Boolean(errors.note)}
        helperText={
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <span>{errors.note ?? ''}</span>
            <span aria-label={`${draft.note.length} of ${MAX_NOTE_CHARS} characters`}>
              {draft.note.length}/{MAX_NOTE_CHARS}
            </span>
          </Box>
        }
        slotProps={{ formHelperText: { sx: (t) => ({ ...t.typography.caption, mx: 4 }) } }}
      />

      {failure ? (
        <Banner tone="error" role="alert">
          {failure}
        </Banner>
      ) : null}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="text" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Send appeal
        </Button>
      </Box>
    </Box>
  );
}
