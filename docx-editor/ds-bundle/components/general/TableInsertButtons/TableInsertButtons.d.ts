import * as React from 'react';

/**
 * TableInsertButtons — from @casualoffice/docs@1.1.7.
 */
export interface TableInsertButtonsProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
}

export declare const TableInsertButtons: React.ComponentType<TableInsertButtonsProps>;
