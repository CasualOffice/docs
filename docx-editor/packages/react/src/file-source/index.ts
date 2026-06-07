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
export { chooseFileSource, type ChooseFileSourceOptions } from './select';
export { FileSourceProvider, useFileSource, type FileSourceProviderProps } from './context';
export type { UserWire, FileSummaryWire, ErrorWire, ProfileWire, ProfilePatchWire } from './wire';
