FindReplaceDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.FindReplaceDialog` (bundle loaded from the root `_ds_bundle.js`).

FindReplaceDialog component - Modal for finding and replacing text

## Props

```ts
interface FindReplaceDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when searching for text */
  onFind: (searchText: string, options: FindOptions) => FindResult | null;
  /** Callback when navigating to next match */
  onFindNext: () => FindMatch | null;
  /** Callback when navigating to previous match */
  onFindPrevious: () => FindMatch | null;
  /** Callback when replacing current match */
  onReplace: (replaceText: string) => boolean;
  /** Callback when replacing all matches */
  onReplaceAll: (searchText: string, replaceText: string, options: FindOptions) => number;
  /** Callback to highlight matches in document */
  onHighlightMatches?: (matches: FindMatch[]) => void;
  /** Callback to clear highlights */
  onClearHighlights?: () => void;
  /** Initial search text (e.g., from selected text) */
  initialSearchText?: string;
  /** Whether to start in replace mode */
  replaceMode?: boolean;
  /** Current match result (from external state) */
  currentResult?: FindResult;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}
```
