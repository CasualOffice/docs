DrawnSignaturePad from @casualoffice/docs. Use via `window.CasualOfficeDocs.DrawnSignaturePad` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface DrawnSignaturePadProps {
  /** Fired when the user clicks "Use this signature". */
  onCapture: (sig: CapturedSignature) => void;
  /** Optional clear-button label override. */
  clearLabel?: string;
  /** Optional save-button label override. */
  saveLabel?: string;
  /** Canvas pixel size. Default 480 × 160. */
  width?: number;
  height?: number;
}
```
