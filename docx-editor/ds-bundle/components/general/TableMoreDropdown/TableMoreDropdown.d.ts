import * as React from 'react';

/**
 * TableMoreDropdown — from @casualoffice/docs@1.1.7.
 */
export interface TableMoreDropdownProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  tableContext?: { isInTable: boolean; rowCount?: number; columnCount?: number; columnIndex?: number; canSplitCell?: boolean; hasMultiCellSelection?: boolean; currentRowIsHeader?: boolean; table?: { attrs?: { justification?: string; }; }; };
}

export declare const TableMoreDropdown: React.ComponentType<TableMoreDropdownProps>;
