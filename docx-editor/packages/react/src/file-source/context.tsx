/**
 * React provider + hook for the chosen FileSource.
 *
 * The host app calls `chooseFileSource()` once at boot, awaits it,
 * then wraps the editor tree in `<FileSourceProvider source={…}>`.
 * Everything inside reads it via `useFileSource()`; nothing branches
 * on `kind` unless it absolutely must.
 *
 * Why the provider is sync (takes a resolved FileSource) rather than
 * doing the probe itself: keeping the React tree free of async-init
 * dances means the editor never has to render a "loading source"
 * fallback. The app is responsible for awaiting the probe and showing
 * its own splash / auth gate.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { FileSource } from './types';

const FileSourceContext = createContext<FileSource | null>(null);

export interface FileSourceProviderProps {
  source: FileSource;
  children: ReactNode;
}

export function FileSourceProvider({ source, children }: FileSourceProviderProps) {
  return <FileSourceContext.Provider value={source}>{children}</FileSourceContext.Provider>;
}

/**
 * Returns the FileSource the app's root provider configured. Throws
 * if called outside a provider — the editor relies on this being
 * present, so failing loud beats a downstream null-deref.
 */
export function useFileSource(): FileSource {
  const ctx = useContext(FileSourceContext);
  if (ctx === null) {
    throw new Error(
      'useFileSource() called outside <FileSourceProvider>. Wrap the editor in a provider after calling chooseFileSource().'
    );
  }
  return ctx;
}
