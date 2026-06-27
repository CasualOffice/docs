TextContextMenu from @casualoffice/docs. Use via `window.CasualOfficeDocs.TextContextMenu` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TextContextMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Menu position */
  position: { x: number; y: number; };
  /** Whether there's a selection (enables copy/cut) */
  hasSelection: boolean;
  /** Whether the editor is editable (enables paste/cut/delete) */
  isEditable: boolean;
  /** Whether clipboard has content (enables paste) */
  hasClipboardContent?: boolean;
  /** Callback when an action is selected */
  onAction: (action: TextContextAction) => void;
  /** Callback when menu is closed */
  onClose: () => void;
  /** Custom menu items (overrides default) */
  items?: TextContextMenuItem[];
  /** Additional className */
  className?: string;
}
```
