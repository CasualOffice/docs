InsertImageDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.InsertImageDialog` (bundle loaded from the root `_ds_bundle.js`).

InsertImageDialog - Modal for inserting images with preview and sizing

## Props

```ts
interface InsertImageDialogProps {
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
```
