import * as React from 'react';

/**
 * PasteSpecialDialog — from @casualoffice/docs@1.1.7.
 */
export interface PasteSpecialDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when paste is confirmed */
  onPaste: (content: ParsedClipboardContent, asPlainText: boolean) => void;
  /** Optional custom position */
  position?: { x: number; y: number; };
  /** Additional className */
  className?: string;
}

export declare const PasteSpecialDialog: React.ComponentType<PasteSpecialDialogProps>;
