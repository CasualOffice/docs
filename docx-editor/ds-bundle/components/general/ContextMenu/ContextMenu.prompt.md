ContextMenu from @casualoffice/docs. Use via `window.CasualOfficeDocs.ContextMenu` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ContextMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Menu position */
  position: { x: number; y: number; };
  /** Selected text */
  selectedText: string;
  /** Selection context for AI operations */
  selectionContext?: SelectionContext;
  /** Callback when an action is selected */
  onAction: (action: AIAction, customPrompt?: string) => void;
  /** Callback when menu is closed */
  onClose: () => void;
  /** Available actions (defaults to DEFAULT_AI_ACTIONS) */
  actions?: AIAction[];
  /** Whether to show custom prompt option */
  showCustomPrompt?: boolean;
  /** Additional className */
  className?: string;
}
```
