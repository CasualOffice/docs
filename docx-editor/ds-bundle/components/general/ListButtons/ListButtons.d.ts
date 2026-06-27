import * as React from 'react';

/**
 * ListButtons — from @casualoffice/docs@1.1.7.
 */
export interface ListButtonsProps {
  /** Current list state of the selection */
  listState?: ListState;
  /** Callback when bullet list is toggled */
  onBulletList?: () => void;
  /** Callback when numbered list is toggled */
  onNumberedList?: () => void;
  /** Callback to increase list indent */
  onIndent?: () => void;
  /** Callback to decrease list indent */
  onOutdent?: () => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show indent/outdent buttons */
  showIndentButtons?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
  /** Whether the current paragraph has left indentation (for enabling outdent) */
  hasIndent?: boolean;
}

export declare const ListButtons: React.ComponentType<ListButtonsProps>;
