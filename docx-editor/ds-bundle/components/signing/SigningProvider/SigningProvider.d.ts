import * as React from 'react';

/**
 * SigningProvider — from @casualoffice/docs@1.1.7.
 */
export interface SigningProviderProps {
  /** Active signing session config. When null, signing is off and children render unchanged. */
  session: SigningSessionConfig;
  /** Current document bytes the editor is rendering. Captured into the context so the eventual `complete` payload carries the */
  documentBytes: ArrayBuffer;
  children: React.ReactNode;
}

export declare const SigningProvider: React.ComponentType<SigningProviderProps>;
