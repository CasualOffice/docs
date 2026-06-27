import * as React from 'react';

/**
 * TableBorderPicker — from @casualoffice/docs@1.1.7.
 */
export interface TableBorderPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
}

export declare const TableBorderPicker: React.ComponentType<TableBorderPickerProps>;
