ColorPicker from @casualoffice/docs. Use via `window.CasualOfficeDocs.ColorPicker` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ColorPickerProps {
  mode: "text" | "highlight" | "border";
  value?: string | ColorValue;
  onChange?: (color: ColorValue | string) => void;
  theme?: Theme;
  disabled?: boolean;
  className?: string;
  style?: React__default.CSSProperties;
  title?: string;
  /** Override the default icon for the mode */
  icon?: string;
  /** Override the auto/no-color button label */
  autoLabel?: string;
  /** Word-style split button. When true (default), renders two halves: - left (apply): re-applies the last picked color direc */
  splitButton?: boolean;
  /** Initial "last picked" color used by the apply half before the user picks anything. Defaults: text → red, highlight → yel */
  defaultColor?: string | ColorValue;
}
```
