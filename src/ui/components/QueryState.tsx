import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { ListSkeleton } from './Skeletons';

export interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => unknown;
}

export interface QueryStateProps<T> {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  /** Announced to screen readers while loading. */
  loadingLabel?: string;
}

// Every data view renders through this wrapper so loading, error and empty states are never forgotten
// (UX-1, docs/03-ui-ux.md sec. 4). Children receive data only once it exists.
export function QueryState<T>({
  query,
  children,
  isEmpty,
  empty,
  skeleton,
  loadingLabel = 'Loading',
}: QueryStateProps<T>) {
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.isLoading || query.data === undefined) {
    return (
      <Box role="status" aria-live="polite" aria-busy="true">
        <Box component="span" sx={visuallyHidden}>
          {loadingLabel}
        </Box>
        {skeleton ?? <ListSkeleton />}
      </Box>
    );
  }
  if (isEmpty?.(query.data)) {
    return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  }
  return <>{children(query.data)}</>;
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
