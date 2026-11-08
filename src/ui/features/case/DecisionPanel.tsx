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
import { OptionCards, type OptionCardsHandle } from '../../components/OptionCards';
import { useSnackbar } from '../../components/SnackbarProvider';
import {
  actionDisabledReason,
  CHOICE_ERROR,
  DECISION_OPTIONS,
  decisionButtonLabel,
  FIELD_ORDER,
  MAX_RATIONALE_CHARS,
  MODIFY_ACTIONS,
  MODIFY_REASONS,
  REJECT_REASONS,
  successMessage,
  toRequest,
  validateDraft,
  type DecisionChoice,
  type DraftErrors,
  type DraftField,
} from './decisionForm';

// The decision panel (03 sec. 6.6, HUM-2..6): Approve, Reject and Modify as three option cards, each stating its
// consequence; the fields the choice needs (clauses and action for Modify, a reason and a rationale for Reject and
// Modify); then one primary button whose label says exactly what will happen. Submitting shows progress and blocks
// a second submit. On failure every choice is kept; a 409 explains what changed and offers Reload.

const CONFLICT_CODES = new Set(['STALE_ANALYSIS', 'ALREADY_DECIDED']);

type PanelField = DraftField | 'choice';

interface Fields {
  finalAction: ModAction | null;
  clauseCodes: string[];
  reasonCategory: string | null;
  rationale: string;
}

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
  const recommendedCodes = (analysis?.recommendation.clauseCodes ?? []).filter((code) =>
    clauses.some((c) => c.code === code),
  );
  const empty: Fields = { finalAction: null, clauseCodes: recommendedCodes, reasonCategory: null, rationale: '' };
  const [choice, setChoice] = useState<DecisionChoice | null>(null);
  const [fields, setFields] = useState<Fields>(empty);
  const [errors, setErrors] = useState<Partial<Record<PanelField, string>>>({});
  const [failure, setFailure] = useState<{ conflict: boolean; message: string } | null>(null);
  const choiceRef = useRef<OptionCardsHandle>(null);
  const clauseRef = useRef<ChoiceChipsHandle>(null);
  const actionRef = useRef<ChoiceChipsHandle>(null);
  const reasonRef = useRef<ChoiceChipsHandle>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);

  if (!analysis) return null;
  const recommended = analysis.recommendation.action;
  const needsForm = choice === 'reject' || choice === 'modify';

  const focusField = (field: PanelField) => {
    if (field === 'choice') choiceRef.current?.focus();
    else if (field === 'clauseCodes') clauseRef.current?.focus();
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
      for (const item of error.details as Array<{ path?: unknown; message?: unknown }>) {
        const path = typeof item.path === 'string' ? (item.path.split('.')[0] as DraftField) : null;
        if (path && FIELD_ORDER.includes(path) && typeof item.message === 'string') fromServer[path] = item.message;
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (decide.isPending) return;
    setFailure(null);
    if (!choice) {
      setErrors({ choice: CHOICE_ERROR });
      focusField('choice');
      return;
    }
    let request: Parameters<typeof decide.mutate>[0];
    if (choice === 'approve') {
      setErrors({});
      request = { kind: 'approve', analysisId: analysis.id };
    } else {
      const draft = { mode: choice, ...fields };
      const found = validateDraft(draft, clauses);
      setErrors(found);
      const first = FIELD_ORDER.find((f) => found[f]);
      if (first) {
        focusField(first);
        return;
      }
      request = toRequest(draft, analysis.id);
    }
    decide.mutate(request, {
      onSuccess: (result) => {
        notify(successMessage(result));
        setChoice(null);
        setFields(empty);
      },
      onError,
    });
  };

  const choose = (next: DecisionChoice) => {
    setChoice(next);
    setFailure(null);
    // Typed text and picks are kept when switching; only the errors of the old choice go.
    setErrors({});
  };

  const update = (patch: Partial<Fields>, field: DraftField) => {
    setFields((current) => ({ ...current, ...patch }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const reasons = choice === 'reject' ? REJECT_REASONS : MODIFY_REASONS;

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
                  // The choices are kept; the next submit uses the reloaded analysis.
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

      <Box
        component="form"
        noValidate
        aria-label="Decide on the recommendation"
        onSubmit={onSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <OptionCards<DecisionChoice>
          ref={choiceRef}
          label="Decision"
          options={DECISION_OPTIONS.map((o) =>
            o.value === 'approve'
              ? { ...o, description: `${o.description} (${ACTION_LABEL[recommended].toLowerCase()})` }
              : o,
          )}
          value={choice}
          onChange={choose}
          error={errors.choice}
        />

        {choice === 'modify' ? (
          <>
            <ChoiceChips
              ref={clauseRef}
              label="Clauses"
              multiple
              options={clauses.map((c) => ({ value: c.code, label: c.code }))}
              value={fields.clauseCodes}
              error={errors.clauseCodes}
              onChange={(codes) => {
                const stillAllowed =
                  fields.finalAction && !actionDisabledReason(fields.finalAction, clauses, codes)
                    ? fields.finalAction
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
                disabledReason: actionDisabledReason(action, clauses, fields.clauseCodes) ?? undefined,
              }))}
              value={fields.finalAction ? [fields.finalAction] : []}
              error={errors.finalAction}
              onChange={([action]) => update({ finalAction: action ?? null }, 'finalAction')}
            />
          </>
        ) : null}

        {needsForm ? (
          <>
            <ChoiceChips
              ref={reasonRef}
              label="Reason"
              options={reasons.map((r) => ({ value: r.value, label: r.label }))}
              value={fields.reasonCategory ? [fields.reasonCategory] : []}
              error={errors.reasonCategory}
              onChange={([reason]) => update({ reasonCategory: reason ?? null }, 'reasonCategory')}
            />
            <TextField
              inputRef={rationaleRef}
              label={choice === 'modify' ? 'Rationale' : 'Note'}
              value={fields.rationale}
              onChange={(event) => update({ rationale: event.target.value }, 'rationale')}
              multiline
              minRows={3}
              fullWidth
              required
              error={Boolean(errors.rationale)}
              helperText={
                <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <span>{errors.rationale ?? 'At least 10 characters. Visible to staff and in the audit trail.'}</span>
                  <span aria-label={`${fields.rationale.length} of ${MAX_RATIONALE_CHARS} characters`}>
                    {fields.rationale.length}/{MAX_RATIONALE_CHARS}
                  </span>
                </Box>
              }
            />
          </>
        ) : null}

        <Box>
          <Button type="submit" size="large" loading={decide.isPending}>
            {decisionButtonLabel(choice, {
              recommended,
              contentType: detail.content.type,
              finalAction: fields.finalAction,
              clauseCodes: fields.clauseCodes,
            })}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
