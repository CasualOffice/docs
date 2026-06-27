PersonalAuthGate from @casualoffice/docs. Use via `window.CasualOfficeDocs.PersonalAuthGate` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PersonalAuthGateProps {
  /** Children render once the user is authenticated. */
  children: React.ReactNode;
  /** Optional pre-built AuthClient. When omitted the gate builds a default same-origin client. Tests pass a mock here. */
  authClient?: AuthClient;
  /** Origin override — only used when `authClient` is omitted. Defaults to "" (same-origin). */
  baseUrl?: string;
  /** Fired once after a successful login / signup so the host app can construct PersonalFileSource and any downstream state.  */
  onAuthenticated?: (user: UserWire) => void;
  /** Heading shown above the form. Override per-deploy to brand the login surface ("Sign in to Acme Casual Editor"). Default  */
  heading?: string;
  /** Initial mode when first rendered. Defaults to 'login' — users returning to a signed-out tab expect to log in, not sign u */
  initialMode?: "login" | "signup";
}
```

## Related

`PersonalAuthGateModal`
