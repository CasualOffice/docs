TableToolbar from @casualoffice/docs. Use via `window.CasualOfficeDocs.TableToolbar` (bundle loaded from the root `_ds_bundle.js`).

TableToolbar - Shows table manipulation controls when cursor is in a table

## Props

```ts
interface TableToolbarProps {
  /** Current table context (null if cursor not in table) */
  context: TableContext;
  /** Callback when a table action is triggered */
  onAction?: (action: TableAction, context: TableContext) => void;
  /** Whether the toolbar is disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show labels next to icons */
  showLabels?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Position of the toolbar */
  position?: "top" | "floating";
  /** Custom render for additional buttons */
  children?: React.ReactNode;
}
```
