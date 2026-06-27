import * as React from 'react';

/**
 * TableBorderWidthPicker — from @casualoffice/docs@1.1.7.
 */
export interface TableBorderWidthPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
}

export declare const TableBorderWidthPicker: React.ComponentType<TableBorderWidthPickerProps>;
