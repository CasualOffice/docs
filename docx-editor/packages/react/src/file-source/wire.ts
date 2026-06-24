/**
 * Wire types — exact-match counterparts for the JSON shapes the collab
 * server emits (CasualOffice/collab `src/auth/*` + `src/files/*`).
 *
 * If a field changes on the server, change it here too — there's no
 * runtime validator, only TypeScript's structural check at the call
 * site. Keep this file thin; it shouldn't grow logic.
 */

/**
 * Mirrors collab `PublicUser` (`auth/personal.ts`). Note: identity is
 * keyed by a numeric `id` + `username`; there is no email at this
 * level (email is an optional profile field). Wrapped as `{ user }`
 * in the /auth/* responses — unwrap at the call site.
 */
export interface UserWire {
  id: number;
  username: string;
  isAdmin: boolean;
  /** ms since epoch. */
  createdAt: number;
}

/**
 * Mirrors a row from `GET /files` / the `file` field of POST replies
 * (`files/personal-files-routes.ts`). `GET /files` wraps these as
 * `{ files: FileSummaryWire[] }`; create/replace as `{ file: … }`.
 */
export interface FileSummaryWire {
  id: string;
  name: string;
  size: number;
  /** Opaque version, bumped on every write — the If-Match value. */
  etag: string;
  /** ms since epoch. */
  createdAt: number;
  /** ms since epoch. */
  modifiedAt: number;
}

/** Mirrors collab's error envelope — a single `{ error: "<code>" }`. */
export interface ErrorWire {
  error: string;
}

/**
 * Mirrors collab `UserProfile` (`auth/personal.ts`) — the `profile`
 * field of `GET /auth/profile` (`{ user, profile }`) and the reply of
 * `PATCH /auth/profile` (`{ profile }`). There is no `locale` or
 * `avatarUrl`: language lives under `preferences.locale`, and the
 * avatar is served as bytes from `GET /auth/profile/avatar` when
 * `hasAvatar` is set.
 */
export interface ProfileWire {
  displayName: string | null;
  email: string | null;
  /** IANA tz string; defaults to "UTC". */
  timezone: string;
  hasAvatar: boolean;
  preferences: Record<string, unknown>;
}

/**
 * Mirrors the PATCH /auth/profile body. Each field optional → "leave
 * unchanged". `displayName` / `email` accept null to clear.
 */
export interface ProfilePatchWire {
  displayName?: string | null;
  email?: string | null;
  timezone?: string;
  preferences?: Record<string, unknown>;
}
