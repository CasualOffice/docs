TableBorderColorPicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.TableBorderColorPicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TableBorderColorPickerProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  theme?: Theme;
  /** Current border color (RGB hex without #) */
  value?: string;
}
```
