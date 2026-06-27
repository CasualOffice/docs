import * as React from 'react';

/**
 * HyperlinkDialog — from @casualoffice/docs@1.1.7.
 */
export interface HyperlinkDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when hyperlink is inserted/updated */
  onSubmit: (data: HyperlinkData) => void;
  /** Callback when hyperlink is removed */
  onRemove?: () => void;
  /** Initial data for editing existing hyperlink */
  initialData?: HyperlinkData;
  /** Currently selected text (used as default display text) */
  selectedText?: string;
  /** Whether we're editing an existing hyperlink */
  isEditing?: boolean;
  /** Available bookmarks for internal links */
  bookmarks?: BookmarkOption[];
  /** Additional CSS class (kept for backwards compat, currently unused by the new shell). */
  className?: string;
  /** Additional inline styles (kept for backwards compat). */
  style?: React__default.CSSProperties;
}

export declare const HyperlinkDialog: React.ComponentType<HyperlinkDialogProps>;
