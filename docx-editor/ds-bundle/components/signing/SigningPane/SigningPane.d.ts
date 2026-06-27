import * as React from 'react';

/**
 * SigningPane — from @casualoffice/docs@1.1.7.
 */
export interface SigningPaneProps {
  /** Optional banner override; falls back to session.banner. */
  banner?: string;
  /** Optional data-testid root. */
  testId?: string;
}

export declare const SigningPane: React.ComponentType<SigningPaneProps>;
