FontSizePicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.FontSizePicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface FontSizePickerProps {
  value?: number;
  onChange?: (size: number) => void;
  sizes?: number[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  width?: string | number;
  minSize?: number;
  maxSize?: number;
}
```
