FontPicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.FontPicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface FontPickerProps {
  value?: string;
  onChange?: (fontFamily: string) => void;
  fonts?: FontOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  width?: string | number;
  showPreview?: boolean;
}
```
