'use client';

import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import Box from '@mui/material/Box';
import { Fragment, useId, useState, type ReactNode } from 'react';
import { m3 } from '../theme/theme';
import { IconButton } from './IconButton';

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** A CSS width for the fixed table layout, e.g. "20%". Columns without one share the rest. */
  width?: string;
}

export interface DataTableProps<T> {
  /** Names the table for assistive technology; visually hidden. */
  caption: string;
  columns: Array<DataColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  /** When set, each row gets an expand button and this content opens in a full-width row below it. */
  renderExpanded?: (row: T) => ReactNode;
  /** The expand button's accessible name, e.g. "Details of event #12". */
  expandLabel?: (row: T) => string;
}

// Data table (03 sec. 4, audit at >= 840 px): no outer border; header in labelLarge and onSurfaceVariant;
// 1 px outlineVariant row dividers, the only dividers in the app; a hover state layer on rows. The fixed layout
// and wrapping cells keep it inside the pane at every width it is shown. Below 840 px pages show a list instead.
export function DataTable<T>({ caption, columns, rows, rowKey, renderExpanded, expandLabel }: DataTableProps<T>) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const span = columns.length + (renderExpanded ? 1 : 0);

  return (
    <Box
      component="table"
      sx={(t) => ({
        width: '100%',
        tableLayout: 'fixed',
        borderCollapse: 'collapse',
        color: m3(t).onSurface,
        '& th, & td': { textAlign: 'left', verticalAlign: 'middle', px: 3, py: 2, overflowWrap: 'anywhere' },
        '& th': { ...t.typography.button, color: m3(t).onSurfaceVariant },
        '& td': { ...t.typography.body2 },
        '& tbody tr': { borderBottom: `1px solid ${m3(t).outlineVariant}` },
        '& tbody tr.data-row:hover': { backgroundColor: `color-mix(in srgb, ${m3(t).onSurface} 8%, transparent)` },
      })}
    >
      <Box component="caption" sx={visuallyHidden}>
        {caption}
      </Box>
      <thead>
        <tr>
          {renderExpanded ? (
            <Box component="th" scope="col" sx={{ width: 72 }}>
              <Box component="span" sx={visuallyHidden}>
                Details
              </Box>
            </Box>
          ) : null}
          {columns.map((column) => (
            <Box component="th" scope="col" key={column.key} sx={{ width: column.width }}>
              {column.header}
            </Box>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          const isOpen = open.has(key);
          const detailId = `${baseId}-${key}`;
          return (
            <Fragment key={key}>
              <tr className="data-row">
                {renderExpanded ? (
                  <td>
                    <IconButton
                      label={expandLabel?.(row) ?? 'Show details'}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? detailId : undefined}
                      onClick={() => toggle(key)}
                    >
                      <ExpandMoreRounded sx={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </IconButton>
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
              {renderExpanded && isOpen ? (
                <tr id={detailId}>
                  <td colSpan={span}>{renderExpanded(row)}</td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
