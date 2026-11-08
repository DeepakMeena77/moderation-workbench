import ArticleRounded from '@mui/icons-material/ArticleRounded';
import DynamicFeedRounded from '@mui/icons-material/DynamicFeedRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import MonitorHeartRounded from '@mui/icons-material/MonitorHeartRounded';
import PolicyRounded from '@mui/icons-material/PolicyRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Role } from '../api/hooks';

// Navigation by role (docs/03-ui-ux.md sec. 3.2) and the roles each page allows. Pages use PAGE_ROLES for
// their server-side check, so what the navigation offers and what a page accepts come from one table.

export type DestinationKey = 'feed' | 'me' | 'policy' | 'queue' | 'appeals' | 'audit' | 'metrics' | 'status';

export interface Destination {
  key: DestinationKey;
  label: string;
  href: string;
  icon: SvgIconComponent;
}

export const DESTINATIONS: Record<DestinationKey, Destination> = {
  feed: { key: 'feed', label: 'Feed', href: '/feed', icon: DynamicFeedRounded },
  me: { key: 'me', label: 'My content', href: '/me', icon: ArticleRounded },
  policy: { key: 'policy', label: 'Policy', href: '/policy', icon: PolicyRounded },
  queue: { key: 'queue', label: 'Queue', href: '/queue', icon: InboxRounded },
  appeals: { key: 'appeals', label: 'Appeals', href: '/appeals', icon: ForumRounded },
  audit: { key: 'audit', label: 'Audit', href: '/audit', icon: FactCheckRounded },
  metrics: { key: 'metrics', label: 'Metrics', href: '/metrics', icon: InsightsRounded },
  status: { key: 'status', label: 'Status', href: '/status', icon: MonitorHeartRounded },
};

export const ROLE_LABEL: Record<Role, string> = {
  author: 'Author',
  moderator: 'Moderator',
  senior_moderator: 'Senior moderator',
  admin: 'Admin',
};

const STAFF: readonly Role[] = ['moderator', 'senior_moderator', 'admin'];
const EVERYONE: readonly Role[] = ['author', ...STAFF];

/** Who may open each page in the app shell (SEC-1). Appeals: moderators may read (02 sec. 7). */
export const PAGE_ROLES: Record<Exclude<DestinationKey, 'status'>, readonly Role[]> = {
  feed: EVERYONE,
  policy: EVERYONE,
  me: ['author'],
  queue: STAFF,
  audit: STAFF,
  metrics: STAFF,
  appeals: STAFF,
};

export interface NavGroup {
  label: string;
  items: DestinationKey[];
}

interface RoleNavigation {
  /** Bottom bar destinations before "More" (at most 4 with More). */
  bar: DestinationKey[];
  /** Drawer groups; the rail shows the same items in the same order, ungrouped. */
  groups: NavGroup[];
}

const NAVIGATION: Record<Role, RoleNavigation> = {
  author: {
    bar: ['feed', 'me', 'policy'],
    groups: [
      { label: 'Community', items: ['feed', 'me'] },
      { label: 'Governance', items: ['policy'] },
      { label: 'System', items: ['status'] },
    ],
  },
  moderator: {
    bar: ['queue', 'audit', 'metrics'],
    groups: [
      { label: 'Moderation', items: ['queue'] },
      { label: 'Governance', items: ['policy', 'audit', 'metrics'] },
      { label: 'System', items: ['status'] },
    ],
  },
  senior_moderator: {
    bar: ['queue', 'appeals', 'audit'],
    groups: [
      { label: 'Moderation', items: ['queue', 'appeals'] },
      { label: 'Governance', items: ['policy', 'audit', 'metrics'] },
      { label: 'System', items: ['status'] },
    ],
  },
  admin: {
    bar: ['policy', 'queue', 'appeals'],
    groups: [
      { label: 'Governance', items: ['policy', 'audit', 'metrics'] },
      { label: 'Oversight', items: ['queue', 'appeals'] },
      { label: 'System', items: ['status'] },
    ],
  },
};

const toDestinations = (keys: DestinationKey[]): Destination[] => keys.map((key) => DESTINATIONS[key]);

/** The section a page belongs to without a role (public pages, tests): the most common grouping. */
const DEFAULT_SECTION: Record<DestinationKey, string> = {
  feed: 'Community',
  me: 'Community',
  queue: 'Moderation',
  appeals: 'Moderation',
  policy: 'Governance',
  audit: 'Governance',
  metrics: 'Governance',
  status: 'System',
};

/**
 * The page-header section label (03 sec. 4): the navigation group that holds the page for this role, so the queue
 * reads "Moderation" for moderators and "Oversight" for admins. "history" belongs with the author's own content, or
 * with moderation for staff.
 */
export function sectionLabel(key: DestinationKey | 'history', role: Role | null): string {
  if (key === 'history') return role === null || role === 'author' ? 'Community' : 'Moderation';
  const group = role ? NAVIGATION[role].groups.find((g) => g.items.includes(key)) : undefined;
  return group?.label ?? DEFAULT_SECTION[key];
}

export function barDestinations(role: Role): Destination[] {
  return toDestinations(NAVIGATION[role].bar);
}

export function drawerGroups(role: Role): Array<{ label: string; items: Destination[] }> {
  return NAVIGATION[role].groups.map((group) => ({ label: group.label, items: toDestinations(group.items) }));
}

export function railDestinations(role: Role): Destination[] {
  return toDestinations(NAVIGATION[role].groups.flatMap((group) => group.items));
}

/** Destinations the bottom bar has no room for; they go in the "More" sheet. */
export function moreDestinations(role: Role): Destination[] {
  const bar = new Set(NAVIGATION[role].bar);
  return railDestinations(role).filter((destination) => !bar.has(destination.key));
}

const HOME: Record<Role, string> = {
  author: '/feed',
  moderator: '/queue',
  senior_moderator: '/queue',
  admin: '/policy',
};

/** Where a role lands after sign-in. */
export function homeFor(role: Role): string {
  return HOME[role];
}

export function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The current page as a short breadcrumb for the top bar (03 sec. 3.1): "Queue", "Queue / Case", "Appeals /
 * Appeal", "Moderation history". Empty for paths that are not app pages (the 404 page).
 */
export function pageTrail(pathname: string): string[] {
  if (/^\/content\/[^/]+\/history\/?$/.test(pathname)) return ['Moderation history'];
  const destination = Object.values(DESTINATIONS).find((d) => isActive(d.href, pathname));
  if (!destination) return [];
  const deeper = pathname.length > destination.href.length + 1;
  if (deeper && destination.key === 'queue') return [destination.label, 'Case'];
  if (deeper && destination.key === 'appeals') return [destination.label, 'Appeal'];
  return [destination.label];
}

/**
 * The `next` redirect after sign-in, only if it is a path on this site. Anything that could leave the site
 * ("//host", "/\\host", a full URL) or loop back to sign-in is dropped (open-redirect guard).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\x00-\x1f\x7f]/.test(value)) return null;
  const base = 'http://local.invalid';
  const parsed = new URL(value, base);
  if (parsed.origin !== base || parsed.pathname === '/sign-in') return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
