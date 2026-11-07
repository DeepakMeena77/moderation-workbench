'use client';

import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { Stepper } from '../../components/Stepper';
import { useSnackbar } from '../../components/SnackbarProvider';
import { layout, m3 } from '../../theme/theme';
import { usePublishPolicy, useValidatePolicy, type PolicyValidation } from './api';
import { DiffView } from './DiffView';

// Publish (03 sec. 6.9, POL-2, POL-3), admin only, in four steps: 1 paste or upload JSON (a plain text field, no
// editor dependency) -> 2 validate (errors with JSON paths) -> 3 review the diff and the impact -> 4 confirm.
// The pasted text is kept through every error, so nothing typed is ever lost.

export const MAX_POLICY_CHARS = 90_000;
const STEPS = ['Paste or upload JSON', 'Validate', 'Review changes and impact', 'Confirm'] as const;

function Banner({ tone, children }: { tone: 'error' | 'warning' | 'info'; children: ReactNode }) {
  return (
    <Box
      role={tone === 'info' ? 'status' : 'alert'}
      sx={(t) => {
        const p = m3(t);
        const [bg, fg] =
          tone === 'error'
            ? [p.errorContainer, p.onErrorContainer]
            : tone === 'warning'
              ? [p.warningContainer, p.onWarningContainer]
              : [p.secondaryContainer, p.onSecondaryContainer];
        return {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 3,
          px: 4,
          py: 3,
          borderRadius: `${layout.nestedRadius}px`,
          backgroundColor: bg,
          color: fg,
        };
      }}
    >
      {tone === 'info' ? (
        <InfoOutlined aria-hidden sx={{ fontSize: 20 }} />
      ) : (
        <ErrorOutlineRounded aria-hidden sx={{ fontSize: 20 }} />
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
    </Box>
  );
}

export function PublishFlow({ onPublished }: { onPublished: (runId: string) => void }) {
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<PolicyValidation | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const validate = useValidatePolicy();
  const publish = usePublishPolicy();
  const notify = useSnackbar();
  const dialogTitleId = useId();

  const preview = result?.valid ? result.preview : null;
  const step = confirmOpen ? 4 : preview ? 3 : result ? 2 : 1;

  const changeText = (value: string) => {
    setText(value);
    setFieldError(null);
    // An edit invalidates the last validation: the admin must validate again before publishing.
    setResult(null);
    setRequestError(null);
  };

  const runValidate = () => {
    setRequestError(null);
    if (text.trim().length === 0) {
      setFieldError('Paste or upload the policy JSON.');
      fieldRef.current?.focus();
      return;
    }
    if (text.length > MAX_POLICY_CHARS) {
      setFieldError(`Keep the policy under ${MAX_POLICY_CHARS.toLocaleString('en')} characters.`);
      fieldRef.current?.focus();
      return;
    }
    validate.mutate(text, {
      onSuccess: setResult,
      onError: (error) =>
        setRequestError(error instanceof ApiError ? error.message : "Couldn't validate the policy. Try again."),
    });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      changeText(await file.text());
    } catch {
      setFieldError("Couldn't read that file. Paste the JSON instead.");
    }
  };

  const runPublish = () => {
    setPublishError(null);
    publish.mutate(text, {
      onSuccess: (published) => {
        setConfirmOpen(false);
        notify(`Policy v${published.version} published. Re-evaluating ${published.run.total} unresolved cases.`);
        changeText('');
        onPublished(published.run.id);
      },
      onError: (error) =>
        setPublishError(error instanceof ApiError ? error.message : "Couldn't publish the policy. Try again."),
    });
  };

  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Stepper label="Publish steps" steps={STEPS} current={step} />

      <TextField
        inputRef={fieldRef}
        label="Policy JSON"
        value={text}
        onChange={(event) => changeText(event.target.value)}
        multiline
        minRows={8}
        maxRows={20}
        fullWidth
        error={Boolean(fieldError)}
        helperText={fieldError ?? 'Paste the full policy file. The server assigns the version number.'}
        slotProps={{
          htmlInput: { spellCheck: false },
        }}
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <Button onClick={runValidate} loading={validate.isPending}>
          Validate
        </Button>
        <Button variant="tonal" startIcon={<UploadFileRounded />} onClick={() => fileRef.current?.click()}>
          Upload JSON file
        </Button>
        <Box
          component="input"
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Upload a policy file"
          tabIndex={-1}
          onChange={(event: ChangeEvent<HTMLInputElement>) => void onFile(event)}
          sx={{ display: 'none' }}
        />
      </Box>

      {requestError ? (
        <Banner tone="error">
          <Typography variant="body2">{requestError}</Typography>
        </Banner>
      ) : null}

      {result && !result.valid ? (
        <Banner tone="error">
          <Typography variant="h4" component="h3" sx={{ mb: 2 }}>
            {result.errors.length === 1 ? '1 problem to fix' : `${result.errors.length} problems to fix`}
          </Typography>
          <Box component="ul" aria-label="Validation errors" sx={{ m: 0, pl: 5 }}>
            {result.errors.map((issue, index) => (
              <Typography
                key={`${issue.path}-${index}`}
                component="li"
                variant="body2"
                sx={{ overflowWrap: 'anywhere' }}
              >
                <Box component="span" sx={{ fontWeight: 500 }}>
                  {issue.path}
                </Box>
                : {issue.message}
              </Typography>
            ))}
          </Box>
        </Banner>
      ) : null}

      {preview ? (
        <Box component="section" aria-label="Review changes" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Typography variant="h3" component="h3">
            Review v{preview.fromVersion ?? 0} {'->'} v{preview.nextVersion}
          </Typography>
          {preview.sameAsVersion !== null ? (
            <Banner tone="warning">
              <Typography variant="body2">
                These clauses are identical to policy v{preview.sameAsVersion}. There is nothing to publish.
              </Typography>
            </Banner>
          ) : (
            <Banner tone="info">
              <Typography variant="body2">
                {preview.impact.unresolvedCases === 1
                  ? '1 unresolved case will be re-analysed'
                  : `${preview.impact.unresolvedCases} unresolved cases will be re-analysed`}{' '}
                under v{preview.nextVersion}. Resolved decisions keep their policy version.
              </Typography>
            </Banner>
          )}
          <DiffView
            diff={preview.diff}
            fromLabel={preview.fromVersion ? `v${preview.fromVersion}` : 'no policy'}
            toLabel={`v${preview.nextVersion}`}
          />
          <Box>
            <Button
              disabled={preview.sameAsVersion !== null}
              onClick={() => {
                setPublishError(null);
                setConfirmOpen(true);
              }}
            >
              Publish v{preview.nextVersion}
            </Button>
          </Box>
        </Box>
      ) : null}

      <Dialog
        open={confirmOpen}
        onClose={() => (publish.isPending ? undefined : setConfirmOpen(false))}
        aria-labelledby={dialogTitleId}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: { elevation: 0, sx: (t: Theme) => ({ backgroundColor: m3(t).surfaceContainerHigh, p: 6 }) },
        }}
      >
        {preview ? (
          <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Typography id={dialogTitleId} variant="h2" component="h2">
              Publish policy v{preview.nextVersion}?
            </Typography>
            <Typography variant="body2">
              v{preview.fromVersion ?? 0} will be retired and {preview.impact.unresolvedCases} unresolved{' '}
              {preview.impact.unresolvedCases === 1 ? 'case' : 'cases'} will be re-analysed. Published versions cannot
              be edited.
            </Typography>
            {publishError ? (
              <Banner tone="error">
                <Typography variant="body2">{publishError}</Typography>
              </Banner>
            ) : null}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button variant="text" disabled={publish.isPending} onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button loading={publish.isPending} onClick={runPublish}>
                Publish
              </Button>
            </Box>
          </Box>
        ) : null}
      </Dialog>
    </Box>
  );
}
