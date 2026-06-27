PasteSpecialDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.PasteSpecialDialog` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PasteSpecialDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when paste is confirmed */
  onPaste: (content: ParsedClipboardContent, asPlainText: boolean) => void;
  /** Optional custom position */
  position?: { x: number; y: number; };
  /** Additional className */
  className?: string;
}
```
