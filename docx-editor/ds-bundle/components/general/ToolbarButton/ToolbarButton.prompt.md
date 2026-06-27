ToolbarButton from @casualoffice/docs. Use via `window.CasualOfficeDocs.ToolbarButton` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ToolbarButtonProps {
  /** Whether the button is in active/pressed state */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button title/tooltip */
  title?: string;
  /** Optional keyboard shortcut hint shown in the tooltip in a kbd style. */
  shortcut?: string;
  /** Click handler */
  onClick?: () => void;
  /** Button content */
  children: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}
```
