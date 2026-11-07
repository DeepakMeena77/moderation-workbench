'use client';

import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { layout, m3 } from '../../theme/theme';
import { thousands } from './format';

// The post and comment composer (03 sec. 6.2, CNT-1, CNT-2): an outlined multi-line field with a 0/2000 counter,
// inline validation by field, a submit button that shows progress and blocks double submission, and a
// retryable error that keeps the typed text (03 sec. 7).

export const MAX_CHARS = 2000;

export function validateBody(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Write at least 1 character.';
  if (trimmed.length > MAX_CHARS)
    return `Keep it under ${thousands(MAX_CHARS)} characters (${thousands(trimmed.length)}).`;
  return null;
}

function bodyErrorFrom(error: ApiError): string | null {
  if (error.status !== 400 || !Array.isArray(error.details)) return null;
  const issue = (error.details as Array<{ path?: unknown; message?: unknown }>).find((d) => d.path === 'body');
  return typeof issue?.message === 'string' ? issue.message : null;
}

export interface ComposerProps {
  label: string;
  submitLabel: string;
  /** Resolves on success; rejects with an ApiError to show. */
  onSubmit: (body: string) => Promise<unknown>;
  minRows?: number;
}

export function Composer({ label, submitLabel, onSubmit, minRows = 3 }: ComposerProps) {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const over = value.length > MAX_CHARS;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const error = validateBody(value);
    setFieldError(error);
    if (error) {
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    try {
      await onSubmit(value.trim());
      setValue('');
    } catch (caught) {
      // The typed text stays in the field whatever went wrong.
      const apiError = caught instanceof ApiError ? caught : null;
      const serverFieldError = apiError ? bodyErrorFrom(apiError) : null;
      if (serverFieldError) {
        setFieldError(serverFieldError);
        inputRef.current?.focus();
      } else {
        setFormError(apiError?.message ?? "Couldn't send this. Your text is kept - try again.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <TextField
        id={id}
        inputRef={inputRef}
        label={label}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (fieldError) setFieldError(null);
        }}
        multiline
        minRows={minRows}
        fullWidth
        error={Boolean(fieldError) || over}
        helperText={
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <span>{fieldError ?? ''}</span>
            <span aria-label={`${value.length} of ${MAX_CHARS} characters`}>
              {value.length}/{MAX_CHARS}
            </span>
          </Box>
        }
      />
      {formError ? (
        <Box
          role="alert"
          data-ui="section"
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'flex-start',
            gap: 3,
            p: 3,
            borderRadius: `${layout.controlRadius}px`,
            border: `1px solid ${m3(theme).errorBorder}`,
            backgroundColor: m3(theme).errorContainer,
            color: m3(theme).onErrorContainer,
          })}
        >
          <ErrorOutlineRounded aria-hidden sx={{ fontSize: 20 }} />
          <Typography variant="body2">{formError}</Typography>
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
