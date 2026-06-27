ZoomControl from @casualoffice/docs. Use via `window.CasualOfficeDocs.ZoomControl` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ZoomControlProps {
  value?: number;
  onChange?: (zoom: number) => void;
  levels?: ZoomLevel[];
  disabled?: boolean;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  showButtons?: boolean;
  persistZoom?: boolean;
  storageKey?: string;
  compact?: boolean;
}
```
