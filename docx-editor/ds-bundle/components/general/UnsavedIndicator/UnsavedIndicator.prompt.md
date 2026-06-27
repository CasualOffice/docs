UnsavedIndicator from @casualoffice/docs. Use via `window.CasualOfficeDocs.UnsavedIndicator` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface UnsavedIndicatorProps {
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Variant of the indicator */
  variant?: "text" | "dot" | "badge" | "icon";
  /** Position of the indicator */
  position?: "inline" | "absolute-top-right" | "absolute-top-left";
  /** Whether to show pulse animation */
  showPulse?: boolean;
  /** Custom label for text variant */
  label?: string;
  /** Custom saved label for text variant */
  savedLabel?: string;
  /** Whether to show indicator when saved (always show) */
  showWhenSaved?: boolean;
  /** Custom color for unsaved state */
  unsavedColor?: string;
  /** Custom color for saved state */
  savedColor?: string;
  /** Size in pixels (for dot/icon) */
  size?: number;
  /** Additional className */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Click handler */
  onClick?: () => void;
  /** Title/tooltip text */
  title?: string;
}
```
