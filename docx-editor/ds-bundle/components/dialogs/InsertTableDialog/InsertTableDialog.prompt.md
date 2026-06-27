InsertTableDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.InsertTableDialog` (bundle loaded from the root `_ds_bundle.js`).

InsertTableDialog - Modal for inserting tables with visual grid selector

## Props

```ts
interface InsertTableDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when table is inserted */
  onInsert: (config: TableConfig) => void;
  /** Maximum rows in grid selector (default: 8) */
  maxGridRows?: number;
  /** Maximum columns in grid selector (default: 10) */
  maxGridColumns?: number;
  /** Maximum allowed rows (default: 100) */
  maxRows?: number;
  /** Maximum allowed columns (default: 20) */
  maxColumns?: number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}
```
