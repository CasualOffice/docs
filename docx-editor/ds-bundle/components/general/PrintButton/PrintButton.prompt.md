PrintButton from @casualoffice/docs. Use via `window.CasualOfficeDocs.PrintButton` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PrintButtonProps {
  /** Callback when print is triggered */
  onPrint: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button label */
  label?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show icon */
  showIcon?: boolean;
  /** Compact mode */
  compact?: boolean;
}
```
