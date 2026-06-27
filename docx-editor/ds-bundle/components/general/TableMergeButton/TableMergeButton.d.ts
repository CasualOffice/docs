import * as React from 'react';

/**
 * TableMergeButton — from @casualoffice/docs@1.1.7.
 */
export interface TableMergeButtonProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  canMerge?: boolean;
  canSplit?: boolean;
}

export declare const TableMergeButton: React.ComponentType<TableMergeButtonProps>;
