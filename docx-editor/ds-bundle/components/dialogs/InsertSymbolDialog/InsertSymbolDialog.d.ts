import * as React from 'react';

/**
 * InsertSymbolDialog — from @casualoffice/docs@1.1.7.
 */
export interface InsertSymbolDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when symbol is inserted */
  onInsert: (symbol: string) => void;
  /** Recently used symbols */
  recentSymbols?: string[];
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}

export declare const InsertSymbolDialog: React.ComponentType<InsertSymbolDialogProps>;
