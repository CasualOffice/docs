PresenceCluster from @casualoffice/docs. Use via `window.CasualOfficeDocs.PresenceCluster` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PresenceClusterProps {
  /** Live co-editing peers. Empty → the avatar stack is omitted. */
  peers: PresencePeer[];
  /** Realtime room status → drives the status badge. Omit for non-collab docs. */
  status?: "connecting" | "connected" | "disconnected";
  /** Share action. When provided, renders a Share button after a divider. */
  onShare?: () => void;
  /** Max avatars before the rest collapse into a `+N` chip. Default 4. */
  maxAvatars?: number;
}
```
