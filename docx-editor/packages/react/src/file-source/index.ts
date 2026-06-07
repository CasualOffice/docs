/**
 * file-source — pluggable storage abstraction.
 *
 * One interface (FileSource), three implementations:
 *   - BrowserFileSource   (Mode 1 — Pages)
 *   - WopiFileSource      (Mode 2 — WOPI, Phase D, not yet)
 *   - PersonalFileSource  (Mode 3 — Standalone)
 *
 * See docs/internal/11-storage-modes.md for the design contract.
 */

export type { FileEntry, FileSource, FileSourceKind } from './types';
export { BrowserFileSource } from './browser';
export {
  PersonalFileSource,
  PersonalFileSourceError,
  type PersonalFileSourceOptions,
} from './personal';
export { AuthClient, type AuthClientOptions, type AuthCredentials } from './auth-client';
export {
  PersonalAuthGate,
  PersonalAuthGateModal,
  usePersonalAuth,
  useAuthContext,
  type PersonalAuthGateProps,
  type UsePersonalAuthOptions,
  type UsePersonalAuthReturn,
  type AuthState,
  type AuthContextValue,
} from './PersonalAuthGate';
export { UserMenu, type UserMenuProps } from './UserMenu';
export { ProfileSettingsDialog, type ProfileSettingsDialogProps } from './ProfileSettingsDialog';
export {
  useFileSourceAutoSave,
  type UseFileSourceAutoSaveOptions,
  type UseFileSourceAutoSaveReturn,
  type AutoSaveEditorRef,
  type AutoSaveStatus as FileSourceAutoSaveStatus,
} from './useFileSourceAutoSave';
export { WopiFileSource, WopiNotSupportedError, type WopiFileSourceOptions } from './wopi';
export {
  chooseFileSource,
  extractWopiContext,
  type ChooseFileSourceOptions,
  type WopiContext,
} from './select';
export { FileSourceProvider, useFileSource, type FileSourceProviderProps } from './context';
export type { UserWire, FileSummaryWire, ErrorWire, ProfileWire, ProfilePatchWire } from './wire';
