'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Role } from '../api/hooks';
import { sectionLabel, type DestinationKey } from './navigation';

// The signed-in role, for page headers that name the navigation section a page sits in (03 sec. 4). Pages outside
// the shell (status, tests) have no provider and fall back to the default grouping.

const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The section label for a page header: "Moderation", "Oversight", "Governance", "Community", "System". */
export function useSectionLabel(key: DestinationKey | 'history'): string {
  return sectionLabel(key, useContext(RoleContext));
}
