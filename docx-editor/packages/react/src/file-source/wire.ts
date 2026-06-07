/**
 * Wire types — exact-match counterparts for the JSON shapes the Go
 * gateway emits from backend/internal/auth/personal/routes.go.
 *
 * If a field changes on the server, change it here too — there's no
 * runtime validator, only TypeScript's structural check at the call
 * site. Keep this file thin; it shouldn't grow logic.
 */

/** Mirrors `personal.User` from the backend. */
export interface UserWire {
  userId: string;
  email: string;
  displayName: string;
  /** RFC3339 string. The personal source converts to ms-since-epoch. */
  createdAt: string;
}

/** Mirrors `personal.FileSummary` from the backend. */
export interface FileSummaryWire {
  docId: string;
  fileName: string;
  version: number;
  /** RFC3339 string. */
  savedAt: string;
  size: number;
}

/** Mirrors the `errorResp` shape returned on 4xx / 5xx. */
export interface ErrorWire {
  code: string;
  message: string;
}
