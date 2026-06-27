StylePicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.StylePicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface StylePickerProps {
  value?: string;
  onChange?: (styleId: string) => void;
  styles?: Style[];
  theme?: Theme;
  disabled?: boolean;
  className?: string;
  width?: string | number;
}
```
