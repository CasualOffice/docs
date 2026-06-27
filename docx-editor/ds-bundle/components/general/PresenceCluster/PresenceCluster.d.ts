import * as React from 'react';

/**
 * PresenceCluster — from @casualoffice/docs@1.1.7.
 */
export interface PresenceClusterProps {
  /** Live co-editing peers. Empty → the avatar stack is omitted. */
  peers: PresencePeer[];
  /** Realtime room status → drives the status badge. Omit for non-collab docs. */
  status?: "connecting" | "connected" | "disconnected";
  /** Share action. When provided, renders a Share button after a divider. */
  onShare?: () => void;
  /** Max avatars before the rest collapse into a `+N` chip. Default 4. */
  maxAvatars?: number;
}

export declare const PresenceCluster: React.ComponentType<PresenceClusterProps>;
