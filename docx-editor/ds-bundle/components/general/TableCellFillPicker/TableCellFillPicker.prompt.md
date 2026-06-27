TableCellFillPicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.TableCellFillPicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TableCellFillPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  theme?: Theme;
  /** Current fill color (RGB hex without #) */
  value?: string;
}
```
