SigningProvider from @casualoffice/docs. Use via `window.CasualOfficeDocs.SigningProvider` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SigningProviderProps {
  /** Active signing session config. When null, signing is off and children render unchanged. */
  session: SigningSessionConfig;
  /** Current document bytes the editor is rendering. Captured into the context so the eventual `complete` payload carries the */
  documentBytes: ArrayBuffer;
  children: React.ReactNode;
}
```
