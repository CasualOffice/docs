/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/** Returns true when the DocOps panel is enabled via the feature flag. */
export function isDocOpsEnabled(): boolean {
  return !!window.__casualFeatures__?.docops;
}
