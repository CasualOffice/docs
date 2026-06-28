/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Table section of the Format/Properties panel. Surfaces the core table
 * structure operations as scannable ICON tiles (insert / delete rows &
 * columns, merge / split cells, delete table) — the Google-Docs table-tools
 * model — instead of a wall of text. Each tile dispatches through the editor's
 * existing `handleTableAction`, so behaviour is identical to the toolbar path.
 *
 * Icon motif: a mini 2×2 table grid with the affected row/column tinted, plus
 * a green ＋ for insert (on the relevant edge) or a red bar for delete, so the
 * direction/effect reads at a glance.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Theme } from '@eigenpal/docx-core/types/document';
import type { TableAction } from '../ui/TableToolbar';
import { TableBorderPicker } from '../ui/TableBorderPicker';
import { TableBorderColorPicker } from '../ui/TableBorderColorPicker';
import { TableBorderWidthPicker } from '../ui/TableBorderWidthPicker';
import { TableCellFillPicker } from '../ui/TableCellFillPicker';

const ACCENT = 'var(--doc-primary, #1a73e8)';
const ADD = '#1e8e3e';
const DEL = '#d93025';
const LINE = 'currentColor';

// Shared mini-grid frame (a 2×2 table). `tint` colours one band to show which
// row/column an action targets.
function Grid({
  tint,
  band,
}: {
  tint?: string;
  band?: 'top' | 'bottom' | 'left' | 'right' | 'all';
}) {
  const cells: ReactNode[] = [];
  if (tint && band) {
    if (band === 'top')
      cells.push(<rect key="b" x="4" y="4" width="16" height="6" fill={tint} opacity="0.85" />);
    if (band === 'bottom')
      cells.push(<rect key="b" x="4" y="14" width="16" height="6" fill={tint} opacity="0.85" />);
    if (band === 'left')
      cells.push(<rect key="b" x="4" y="4" width="6" height="16" fill={tint} opacity="0.85" />);
    if (band === 'right')
      cells.push(<rect key="b" x="14" y="4" width="6" height="16" fill={tint} opacity="0.85" />);
    if (band === 'all')
      cells.push(<rect key="b" x="4" y="4" width="16" height="16" fill={tint} opacity="0.15" />);
  }
  return (
    <>
      {cells}
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="1.5"
        fill="none"
        stroke={LINE}
        strokeWidth="1.5"
      />
      <path d="M12 4v16M4 12h16" stroke={LINE} strokeWidth="1.2" />
    </>
  );
}

function Plus({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={ADD} strokeWidth="1.8" strokeLinecap="round">
      <path d={`M${x - 3} ${y}h6M${x} ${y - 3}v6`} />
    </g>
  );
}

const ICONS: Record<string, ReactNode> = {
  addRowAbove: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={ADD} band="top" />
      <Plus x={12} y={1.5} />
    </svg>
  ),
  addRowBelow: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={ADD} band="bottom" />
      <Plus x={12} y={22.5} />
    </svg>
  ),
  deleteRow: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={DEL} band="all" />
      <rect x="4" y="10.5" width="16" height="3" fill={DEL} />
    </svg>
  ),
  addColumnLeft: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={ADD} band="left" />
      <Plus x={1.5} y={12} />
    </svg>
  ),
  addColumnRight: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={ADD} band="right" />
      <Plus x={22.5} y={12} />
    </svg>
  ),
  deleteColumn: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid tint={DEL} band="all" />
      <rect x="10.5" y="4" width="3" height="16" fill={DEL} />
    </svg>
  ),
  mergeCells: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="1.5"
        fill="none"
        stroke={LINE}
        strokeWidth="1.5"
      />
      <path d="M12 6v3M12 15v3" stroke={LINE} strokeWidth="1.2" />
      <path
        d="M9 12h6M9 12l2-2M9 12l2 2M15 12l-2-2M15 12l-2 2"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  splitCell: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="1.5"
        fill="none"
        stroke={LINE}
        strokeWidth="1.5"
      />
      <path d="M12 6v12" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  ),
  deleteTable: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <Grid />
      <path d="M7 7l10 10M17 7L7 17" stroke={DEL} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

interface Item {
  action: Extract<TableAction, string>;
  label: string;
  danger?: boolean;
}

const GROUPS: { header: string; items: Item[] }[] = [
  {
    header: 'Rows',
    items: [
      { action: 'addRowAbove', label: 'Above' },
      { action: 'addRowBelow', label: 'Below' },
      { action: 'deleteRow', label: 'Delete', danger: true },
    ],
  },
  {
    header: 'Columns',
    items: [
      { action: 'addColumnLeft', label: 'Left' },
      { action: 'addColumnRight', label: 'Right' },
      { action: 'deleteColumn', label: 'Delete', danger: true },
    ],
  },
  {
    header: 'Cells',
    items: [
      { action: 'mergeCells', label: 'Merge' },
      { action: 'splitCell', label: 'Split' },
    ],
  },
  {
    header: 'Table',
    items: [{ action: 'deleteTable', label: 'Delete table', danger: true }],
  },
];

const GROUP_HEADER: CSSProperties = {
  padding: '12px 16px 6px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const TILE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  padding: '0 12px 4px',
};

const tile = (danger: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '8px 2px 6px',
  fontSize: 11,
  lineHeight: 1.2,
  textAlign: 'center',
  color: danger ? 'var(--doc-danger, #d93025)' : 'var(--doc-text, #202124)',
  background: 'transparent',
  border: '1.5px solid var(--doc-border, #dadce0)',
  borderRadius: 8,
  cursor: 'pointer',
});

export interface TablePropertiesSectionProps {
  /** Dispatch a table action (host wires this to handleTableAction). */
  onAction: (action: TableAction) => void;
  /** Active theme — used to resolve theme colors in the border/fill pickers. */
  theme?: Theme | null;
  /** Resolved hex of the selected cells' border color (for the swatch). */
  borderColorHex?: string;
  /** The selected cells' background fill (for the swatch). */
  cellBackgroundColor?: string;
}

const APPEARANCE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  padding: '0 12px 8px',
};

export function TablePropertiesSection({
  onAction,
  theme,
  borderColorHex,
  cellBackgroundColor,
}: TablePropertiesSectionProps) {
  return (
    <div data-testid="properties-table-section">
      {/* Borders & fill — the appearance controls live here, in the panel,
          not scattered across the toolbar. */}
      <div style={GROUP_HEADER}>Borders &amp; fill</div>
      <div style={APPEARANCE_ROW} role="group" aria-label="Borders and fill">
        <TableBorderPicker onAction={onAction} />
        <TableBorderColorPicker onAction={onAction} theme={theme} value={borderColorHex} />
        <TableBorderWidthPicker onAction={onAction} />
        <TableCellFillPicker onAction={onAction} theme={theme} value={cellBackgroundColor} />
      </div>
      {GROUPS.map((group) => (
        <div key={group.header}>
          <div style={GROUP_HEADER}>{group.header}</div>
          <div style={TILE_GRID} role="group" aria-label={group.header}>
            {group.items.map((item) => (
              <button
                key={item.action}
                type="button"
                style={tile(!!item.danger)}
                title={item.label}
                aria-label={`${group.header}: ${item.label}`}
                data-testid={`properties-table-${item.action}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAction(item.action);
                }}
              >
                {ICONS[item.action]}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
