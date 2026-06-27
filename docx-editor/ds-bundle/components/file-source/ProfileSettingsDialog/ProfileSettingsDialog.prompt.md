ProfileSettingsDialog from @casualoffice/docs. Use via `window.CasualOfficeDocs.ProfileSettingsDialog` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional AuthClient override. When omitted the dialog builds a default same-origin client (matches the gate's behaviour) */
  authClient?: AuthClient;
  /** Fired after a successful save with the refreshed profile, so the host can update the title bar / user menu without forci */
  onSaved?: (profile: ProfileWire) => void;
  /** Data-testid root. */
  testId?: string;
}
```
