ListButtons from @casualoffice/docs. Use via `window.CasualOfficeDocs.ListButtons` (bundle loaded from the root `_ds_bundle.js`).

List buttons component for bullet/numbered list controls

## Props

```ts
interface ListButtonsProps {
  /** Current list state of the selection */
  listState?: ListState;
  /** Callback when bullet list is toggled */
  onBulletList?: () => void;
  /** Callback when numbered list is toggled */
  onNumberedList?: () => void;
  /** Callback to increase list indent */
  onIndent?: () => void;
  /** Callback to decrease list indent */
  onOutdent?: () => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show indent/outdent buttons */
  showIndentButtons?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
  /** Whether the current paragraph has left indentation (for enabling outdent) */
  hasIndent?: boolean;
}
```
