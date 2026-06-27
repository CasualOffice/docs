import * as React from 'react';

/**
 * TextContextMenu — from @casualoffice/docs@1.1.7.
 */
export interface TextContextMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Menu position */
  position: { x: number; y: number; };
  /** Whether there's a selection (enables copy/cut) */
  hasSelection: boolean;
  /** Whether the editor is editable (enables paste/cut/delete) */
  isEditable: boolean;
  /** Whether clipboard has content (enables paste) */
  hasClipboardContent?: boolean;
  /** Callback when an action is selected */
  onAction: (action: TextContextAction) => void;
  /** Callback when menu is closed */
  onClose: () => void;
  /** Custom menu items (overrides default) */
  items?: TextContextMenuItem[];
  /** Additional className */
  className?: string;
}

export declare const TextContextMenu: React.ComponentType<TextContextMenuProps>;
