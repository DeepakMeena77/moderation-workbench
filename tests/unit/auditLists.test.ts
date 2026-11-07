import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/server/services/audit';
import { AUDIT_ACTIONS as UI_ACTIONS, AUDIT_ENTITIES as UI_ENTITIES } from '@/ui/features/audit/api';

// AUD-5: the audit page's action and entity filters offer exactly what the server writes. The UI keeps its own
// copy (it may not import server code), so this test is what keeps the two lists in step.

describe('audit filter lists', () => {
  it('[AUD-5] the action and entity filters match the server lists', () => {
    expect([...UI_ACTIONS].sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect([...UI_ENTITIES].sort()).toEqual([...AUDIT_ENTITY_TYPES].sort());
  });
});
