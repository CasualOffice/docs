import * as React from 'react';

/**
 * TableCellFillPicker — from @casualoffice/docs@1.1.7.
 */
export interface TableCellFillPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  theme?: Theme;
  /** Current fill color (RGB hex without #) */
  value?: string;
}

export declare const TableCellFillPicker: React.ComponentType<TableCellFillPickerProps>;
