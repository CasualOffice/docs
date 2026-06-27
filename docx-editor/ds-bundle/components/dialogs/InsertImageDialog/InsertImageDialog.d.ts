import * as React from 'react';

/**
 * InsertImageDialog — from @casualoffice/docs@1.1.7.
 */
export interface InsertImageDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when image is inserted */
  onInsert: (data: ImageData) => void;
  /** Maximum width in pixels (default: 800) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 600) */
  maxHeight?: number;
  /** Accepted file types (default: image/*) */
  accept?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}

export declare const InsertImageDialog: React.ComponentType<InsertImageDialogProps>;
