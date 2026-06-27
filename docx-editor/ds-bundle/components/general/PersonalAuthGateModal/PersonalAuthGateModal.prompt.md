PersonalAuthGateModal from @casualoffice/docs. Use via `window.CasualOfficeDocs.PersonalAuthGateModal` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PersonalAuthGateModalProps {
  isOpen: boolean;
  heading: string;
  initialMode: "login" | "signup";
  /** Fired when the user clicks Sign In / Create Account. Throws on failure; the modal renders the surfaced error from `submi */
  onSubmit: (mode: "login" | "signup", creds: { username: string; password: string; }) => Promise<void>;
  submitError: PersonalFileSourceError;
  /** True during the initial /auth/me probe — disables Sign in. */
  loading: boolean;
}
```
