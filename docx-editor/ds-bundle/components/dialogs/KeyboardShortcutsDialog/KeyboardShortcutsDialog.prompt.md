KeyboardShortcutsDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.KeyboardShortcutsDialog` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface KeyboardShortcutsDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Custom shortcuts (merged with defaults) */
  customShortcuts?: KeyboardShortcut[];
  /** Whether to show search */
  showSearch?: boolean;
  /** Additional className */
  className?: string;
}
```
