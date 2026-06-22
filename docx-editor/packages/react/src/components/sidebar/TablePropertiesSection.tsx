/**
 * Table section of the Format/Properties panel. Surfaces the core table
 * structure operations (insert / delete rows & columns, merge / split cells,
 * delete table) in the contextual right rail — the same actions that were
 * previously only reachable from the toolbar grid dropdown. Grouped like the
 * Google-Docs table menu so the panel is the single home for object
 * properties. Border / shading / cell-alignment groups plug in here next.
 *
 * Each button dispatches through the editor's existing `handleTableAction`,
 * so behaviour is identical to the toolbar path — this is purely a relocation
 * of the controls into the panel, not a new command surface.
 */
import type { CSSProperties } from 'react';
import type { TableAction } from '../ui/TableToolbar';

const GROUP_HEADER: CSSProperties = {
  padding: '12px 16px 6px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted)',
  fontWeight: 600,
};

const ROW_BTN = (danger: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 16px',
  fontSize: 13,
  background: 'transparent',
  color: danger ? 'var(--doc-danger, #d93025)' : 'var(--doc-text, #202124)',
  border: 'none',
  cursor: 'pointer',
});

interface Item {
  action: Extract<TableAction, string>;
  label: string;
  danger?: boolean;
}

const GROUPS: { header: string; items: Item[] }[] = [
  {
    header: 'Rows',
    items: [
      { action: 'addRowAbove', label: 'Insert row above' },
      { action: 'addRowBelow', label: 'Insert row below' },
      { action: 'deleteRow', label: 'Delete row', danger: true },
    ],
  },
  {
    header: 'Columns',
    items: [
      { action: 'addColumnLeft', label: 'Insert column left' },
      { action: 'addColumnRight', label: 'Insert column right' },
      { action: 'deleteColumn', label: 'Delete column', danger: true },
    ],
  },
  {
    header: 'Cells',
    items: [
      { action: 'mergeCells', label: 'Merge cells' },
      { action: 'splitCell', label: 'Split cell' },
    ],
  },
  {
    header: 'Table',
    items: [{ action: 'deleteTable', label: 'Delete table', danger: true }],
  },
];

export interface TablePropertiesSectionProps {
  /** Dispatch a table action (host wires this to handleTableAction). */
  onAction: (action: TableAction) => void;
}

export function TablePropertiesSection({ onAction }: TablePropertiesSectionProps) {
  return (
    <div data-testid="properties-table-section">
      {GROUPS.map((group) => (
        <div key={group.header}>
          <div style={GROUP_HEADER}>{group.header}</div>
          <div role="group" aria-label={group.header}>
            {group.items.map((item) => (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                style={ROW_BTN(!!item.danger)}
                data-testid={`properties-table-${item.action}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAction(item.action);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
