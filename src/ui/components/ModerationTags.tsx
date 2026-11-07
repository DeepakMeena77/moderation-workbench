import AltRouteRounded from '@mui/icons-material/AltRouteRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import HelpRounded from '@mui/icons-material/HelpRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import LabelRounded from '@mui/icons-material/LabelRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import PolicyRounded from '@mui/icons-material/PolicyRounded';
import PsychologyRounded from '@mui/icons-material/PsychologyRounded';
import ReportRounded from '@mui/icons-material/ReportRounded';
import RuleRounded from '@mui/icons-material/RuleRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ReactElement } from 'react';
import type { AiStatus, CaseStatus, ModAction, Severity } from '../api/hooks';
import { Tag, type TagTone } from './Tag';

// The semantic tags of 03 sec. 2.3: always an icon plus text, never colour alone.

const SEVERITY: Record<Severity, { tone: TagTone; icon: ReactElement<SvgIconProps>; label: string }> = {
  high: { tone: 'error', icon: <ReportRounded />, label: 'High' },
  medium: { tone: 'warning', icon: <WarningRounded />, label: 'Medium' },
  low: { tone: 'secondary', icon: <InfoRounded />, label: 'Low' },
};

export function SeverityTag({ severity }: { severity: Severity | null }) {
  if (!severity) return <Tag label="No severity" tone="neutral" icon={<InfoRounded />} />;
  const s = SEVERITY[severity];
  return <Tag label={`${s.label} severity`} tone={s.tone} icon={s.icon} />;
}

export const ACTION_LABEL: Record<ModAction, string> = {
  none: 'No action',
  label: 'Label',
  limit: 'Limit',
  remove: 'Remove',
};

const ACTION: Record<ModAction, { tone: TagTone; icon: ReactElement<SvgIconProps> }> = {
  remove: { tone: 'error', icon: <DeleteRounded /> },
  limit: { tone: 'warning', icon: <VisibilityOffRounded /> },
  label: { tone: 'tertiary', icon: <LabelRounded /> },
  none: { tone: 'success', icon: <CheckCircleRounded /> },
};

export function ActionTag({ action }: { action: ModAction }) {
  return <Tag label={ACTION_LABEL[action]} tone={ACTION[action].tone} icon={ACTION[action].icon} />;
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  pending_analysis: 'Analysing...',
  awaiting_review: 'Needs review',
  auto_cleared: 'Auto-cleared',
  resolved: 'Resolved',
  appealed: 'Appealed',
  appeal_resolved: 'Appeal resolved',
};

const STATUS: Record<CaseStatus, { tone: TagTone; icon: ReactElement<SvgIconProps> }> = {
  pending_analysis: { tone: 'neutral', icon: <HourglassTopRounded /> },
  awaiting_review: { tone: 'primary', icon: <PendingActionsRounded /> },
  auto_cleared: { tone: 'success', icon: <TaskAltRounded /> },
  resolved: { tone: 'secondary', icon: <GavelRounded /> },
  appealed: { tone: 'tertiary', icon: <ForumRounded /> },
  appeal_resolved: { tone: 'secondary', icon: <VerifiedRounded /> },
};

export function StatusTag({ status }: { status: CaseStatus }) {
  return <Tag label={STATUS_LABEL[status]} tone={STATUS[status].tone} icon={STATUS[status].icon} />;
}

export const AI_STATUS_LABEL: Record<AiStatus, string> = {
  ok: 'AI reviewed',
  timeout: 'AI timed out',
  rate_limited: 'AI rate-limited',
  invalid_output: 'AI output invalid',
  invalid_input: 'AI input too large',
  provider_error: 'AI provider error',
  budget_exhausted: 'AI budget reached',
  unavailable: 'AI unavailable',
};

export function AiStateTag({ status, fallbackUsed = false }: { status: AiStatus; fallbackUsed?: boolean }) {
  if (status === 'ok' && fallbackUsed)
    return <Tag label="AI fallback model" tone="neutral" icon={<AltRouteRounded />} />;
  if (status === 'ok') return <Tag label={AI_STATUS_LABEL.ok} tone="secondary" icon={<PsychologyRounded />} />;
  return <Tag label={AI_STATUS_LABEL[status]} tone="error" icon={<CloudOffRounded />} />;
}

export function InsufficientContextTag() {
  return <Tag label="Insufficient context" tone="warning" icon={<HelpRounded />} />;
}

export function PolicyVersionTag({ version }: { version: number }) {
  return <Tag label={`Policy v${version}`} tone="neutral" icon={<PolicyRounded />} />;
}

export function ClauseTag({ code, title }: { code: string; title?: string }) {
  return <Tag label={code} tone="neutral" title={title} />;
}

export function EvidenceTag({ kind }: { kind: 'rule' | 'confirmed' | 'interpretation' }) {
  if (kind === 'rule') return <Tag label="Rule match" tone="secondary" icon={<RuleRounded />} />;
  if (kind === 'confirmed') return <Tag label="AI, quote verified" tone="primary" icon={<VerifiedRounded />} />;
  return <Tag label="AI interpretation" tone="tertiary" icon={<PsychologyRounded />} />;
}
