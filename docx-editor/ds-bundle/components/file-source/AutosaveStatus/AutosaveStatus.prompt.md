AutosaveStatus from @casualoffice/docs. Use via `window.CasualOfficeDocs.AutosaveStatus` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface AutosaveStatusProps {
  /** Pass the full return value of useFileSourceAutoSave. */
  state: UseFileSourceAutoSaveReturn;
  /** Optional className for host-app styling. */
  className?: string;
  /** Data-testid for E2E. Defaults to 'autosave-status'. */
  testId?: string;
  /** Override the "last saved" label. Defaults to the relative format ("just now" / "1 minute ago" / "5 minutes ago"). Hosts  */
  formatLastSaved?: (date: Date) => string;
}
```
