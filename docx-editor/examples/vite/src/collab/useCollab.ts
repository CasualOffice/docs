/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// useCollab was promoted to the library in
// packages/react/src/collab/useCollab.ts so SDK consumers (Drive,
// future sheet integrations) can opt into collab without
// reimplementing the Yjs wiring. This file stays as a re-export
// shim so the existing example imports + every collab/*.tsx file
// in this folder keep working.
//
// New code should import from the package directly:
//   import { useCollab, type CollabState } from '@casualoffice/docs';
export {
  useCollab,
  type CollabPeer,
  type CollabState,
  type CollabStatus,
  type UseCollabOptions,
} from '@casualoffice/docs';
