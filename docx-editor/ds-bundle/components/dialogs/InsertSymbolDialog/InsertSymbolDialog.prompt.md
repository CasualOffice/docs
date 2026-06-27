InsertSymbolDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.InsertSymbolDialog` (bundle loaded from the root `_ds_bundle.js`).

InsertSymbolDialog - Modal for inserting special characters

## Props

```ts
interface InsertSymbolDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when symbol is inserted */
  onInsert: (symbol: string) => void;
  /** Recently used symbols */
  recentSymbols?: string[];
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}
```
