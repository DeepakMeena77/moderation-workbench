'use client';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useDecide, type CaseDetail, type ModAction } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChoiceChips, type ChoiceChipsHandle } from '../../components/ChoiceChips';
import { ACTION_LABEL } from '../../components/ModerationTags';
import { useSnackbar } from '../../components/SnackbarProvider';
import { layout, m3 } from '../../theme/theme';
import {
  actionDisabledReason,
  FIELD_ORDER,
  MAX_RATIONALE_CHARS,
  MODIFY_ACTIONS,
  MODIFY_REASONS,
  REJECT_REASONS,
  successMessage,
  toRequest,
  validateDraft,
  type DecisionDraft,
  type DecisionMode,
  type DraftErrors,
  type DraftField,
} from './decisionForm';

// The decision panel (03 sec. 6.6, HUM-2..6): Approve recommendation (primary), Modify (secondary), Reject
// recommendation (ghost, red only on hover and focus), all at the large size. Modify and Reject open an inline form. Submitting shows progress
// and blocks a second submit. On failure every choice is kept; a 409 explains what changed and offers Reload.

const CONFLICT_CODES = new Set(['STALE_ANALYSIS', 'ALREADY_DECIDED']);

export interface DecisionPanelProps {
  detail: CaseDetail;
  onReload: () => void;
}

export function DecisionPanel({ detail, onReload }: DecisionPanelProps) {
  const analysis = detail.analysis;
  const clauses = detail.policy?.clauses ?? [];
  const decide = useDecide(detail.id);
  const notify = useSnackbar();
  const headingId = useId();
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<{ conflict: boolean; message: string } | null>(null);
  const clauseRef = useRef<ChoiceChipsHandle>(null);
  const actionRef = useRef<ChoiceChipsHandle>(null);
  const reasonRef = useRef<ChoiceChipsHandle>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);

  if (!analysis) return null;
  const recommended = analysis.recommendation.action;

  const focusField = (field: DraftField) => {
    if (field === 'clauseCodes') clauseRef.current?.focus();
    else if (field === 'finalAction') actionRef.current?.focus();
    else if (field === 'reasonCategory') reasonRef.current?.focus();
    else rationaleRef.current?.focus();
  };

  const onError = (error: unknown) => {
    if (error instanceof ApiError && CONFLICT_CODES.has(error.code)) {
      setFailure({ conflict: true, message: error.message });
      return;
    }
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
      const fromServer: DraftErrors = {};
      for (const detail of error.details as Array<{ path?: unknown; message?: unknown }>) {
        const path = typeof detail.path === 'string' ? (detail.path.split('.')[0] as DraftField) : null;
        if (path && FIELD_ORDER.includes(path) && typeof detail.message === 'string') fromServer[path] = detail.message;
      }
      setErrors(fromServer);
      const first = FIELD_ORDER.find((f) => fromServer[f]);
      if (first) focusField(first);
    }
    setFailure({
      conflict: false,
      message:
        error instanceof ApiError && error.status !== 0 && error.status < 500
          ? error.message
          : "Couldn't save your decision. Your choices are kept - try again.",
    });
  };

  const submit = (request: Parameters<typeof decide.mutate>[0]) => {
    if (decide.isPending) return;
    setFailure(null);
    decide.mutate(request, {
      onSuccess: (result) => {
        notify(successMessage(result));
        setDraft(null);
      },
      onError,
    });
  };

  const openForm = (mode: DecisionMode) => {
    setErrors({});
    setFailure(null);
    setDraft((current) =>
      current?.mode === mode
        ? null
        : {
            mode,
            finalAction: null,
            clauseCodes:
              mode === 'modify'
                ? analysis.recommendation.clauseCodes.filter((code) => clauses.some((c) => c.code === code))
                : [],
            reasonCategory: null,
            rationale: current?.rationale ?? '',
          },
    );
  };

  const onSubmitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const found = validateDraft(draft, clauses);
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    submit(toRequest(draft, analysis.id));
  };

  const update = (patch: Partial<DecisionDraft>, field: DraftField) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const reasons = draft?.mode === 'reject' ? REJECT_REASONS : MODIFY_REASONS;

  return (
    <Card component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography id={headingId} variant="h3" component="h2">
          Your decision
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          AI recommends, humans decide. Saved with policy v{analysis.policyVersion} and analysis v{analysis.seq}.
        </Typography>
      </Box>

      {failure ? (
        <Banner
          tone={failure.conflict ? 'warning' : 'error'}
          role="alert"
          action={
            failure.conflict ? (
              <Button
                variant="ghost"
                onClick={() => {
                  // The draft is kept; the next submit uses the reloaded analysis.
                  setFailure(null);
                  onReload();
                }}
              >
                Reload
              </Button>
            ) : null
          }
        >
          {failure.message}
        </Banner>
      ) : null}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <Button
          size="large"
          onClick={() => submit({ kind: 'approve', analysisId: analysis.id })}
          loading={decide.isPending && draft === null}
          disabled={decide.isPending}
        >
          Approve recommendation ({ACTION_LABEL[recommended].toLowerCase()})
        </Button>
        <Button
          size="large"
          variant="secondary"
          aria-expanded={draft?.mode === 'modify'}
          disabled={decide.isPending}
          onClick={() => openForm('modify')}
        >
          Modify
        </Button>
        <Button
          size="large"
          variant="ghost"
          destructive
          aria-expanded={draft?.mode === 'reject'}
          disabled={decide.isPending}
          onClick={() => openForm('reject')}
        >
          Reject recommendation
        </Button>
      </Box>

      {draft ? (
        <Box
          component="form"
          noValidate
          aria-label={draft.mode === 'modify' ? 'Modify the recommendation' : 'Reject the recommendation'}
          onSubmit={onSubmitForm}
          data-ui="section"
          sx={(t) => ({
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            p: 3,
            borderRadius: `${layout.controlRadius}px`,
            border: `1px solid ${m3(t).border}`,
            backgroundColor: m3(t).cardNested,
          })}
        >
          {draft.mode === 'modify' ? (
            <>
              <ChoiceChips
                ref={clauseRef}
                label="Clauses"
                multiple
                options={clauses.map((c) => ({ value: c.code, label: c.code }))}
                value={draft.clauseCodes}
                error={errors.clauseCodes}
                onChange={(codes) => {
                  const stillAllowed =
                    draft.finalAction && !actionDisabledReason(draft.finalAction, clauses, codes)
                      ? draft.finalAction
                      : null;
                  update({ clauseCodes: codes, finalAction: stillAllowed }, 'clauseCodes');
                }}
              />
              <ChoiceChips<ModAction>
                ref={actionRef}
                label="Action"
                options={MODIFY_ACTIONS.map((action) => ({
                  value: action,
                  label: ACTION_LABEL[action],
                  disabledReason: actionDisabledReason(action, clauses, draft.clauseCodes) ?? undefined,
                }))}
                value={draft.finalAction ? [draft.finalAction] : []}
                error={errors.finalAction}
                onChange={([action]) => update({ finalAction: action ?? null }, 'finalAction')}
              />
            </>
          ) : null}
          <ChoiceChips
            ref={reasonRef}
            label="Reason"
            options={reasons.map((r) => ({ value: r.value, label: r.label }))}
            value={draft.reasonCategory ? [draft.reasonCategory] : []}
            error={errors.reasonCategory}
            onChange={([reason]) => update({ reasonCategory: reason ?? null }, 'reasonCategory')}
          />
          <TextField
            inputRef={rationaleRef}
            label={draft.mode === 'modify' ? 'Rationale' : 'Note'}
            value={draft.rationale}
            onChange={(event) => update({ rationale: event.target.value }, 'rationale')}
            multiline
            minRows={3}
            fullWidth
            required
            error={Boolean(errors.rationale)}
            helperText={
              <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <span>{errors.rationale ?? 'At least 10 characters. Visible to staff and in the audit trail.'}</span>
                <span aria-label={`${draft.rationale.length} of ${MAX_RATIONALE_CHARS} characters`}>
                  {draft.rationale.length}/{MAX_RATIONALE_CHARS}
                </span>
              </Box>
            }
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={decide.isPending}>
              {draft.mode === 'modify' ? 'Save modified decision' : 'Reject recommendation'}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Card>
  );
}
