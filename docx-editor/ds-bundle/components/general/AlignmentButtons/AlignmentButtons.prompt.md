AlignmentButtons from @casualoffice/docs. Use via `window.CasualOfficeDocs.AlignmentButtons` (bundle loaded from the root `_ds_bundle.js`).

Alignment dropdown component — single button with popover panel

## Props

```ts
interface AlignmentButtonsProps {
  /** Current alignment value */
  value?: "left" | "center" | "right" | "both" | "distribute" | "mediumKashida" | "highKashida" | "lowKashida" | "thaiDistribute";
  /** Callback when alignment is changed */
  onChange?: (alignment: ParagraphAlignment) => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show labels next to icons */
  showLabels?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
}
```
