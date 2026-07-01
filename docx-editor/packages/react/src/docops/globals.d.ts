/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Runtime feature flags injected before app JS runs.
 * Separate from `window.__deskApp__` (desktop bridge) — this flag
 * gates opt-in features independently of deployment context.
 *
 * Enable via: window.__casualFeatures__ = { docops: true }
 * or <script>window.__casualFeatures__ = {"docops":true}</script>
 * in the host page before the editor bundle loads.
 */
declare global {
  interface Window {
    __casualFeatures__?: {
      /** Enable the DocOps AI panel (JSON DocOps IR + Anthropic tool loop). */
      docops?: boolean;
    };
  }
}

export {};
