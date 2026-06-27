HyperlinkDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.HyperlinkDialog` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface HyperlinkDialogProps {
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
```
