import * as React from 'react';

/**
 * TableBorderColorPicker — from @casualoffice/docs@1.1.7.
 */
export interface TableBorderColorPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  theme?: Theme;
  /** Current border color (RGB hex without #) */
  value?: string;
}

export declare const TableBorderColorPicker: React.ComponentType<TableBorderColorPickerProps>;
