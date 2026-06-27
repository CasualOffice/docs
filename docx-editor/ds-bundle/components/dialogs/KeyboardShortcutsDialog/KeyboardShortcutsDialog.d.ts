import * as React from 'react';

/**
 * KeyboardShortcutsDialog — from @casualoffice/docs@1.1.7.
 */
export interface KeyboardShortcutsDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Custom shortcuts (merged with defaults) */
  customShortcuts?: KeyboardShortcut[];
  /** Whether to show search */
  showSearch?: boolean;
  /** Additional className */
  className?: string;
}

export declare const KeyboardShortcutsDialog: React.ComponentType<KeyboardShortcutsDialogProps>;
