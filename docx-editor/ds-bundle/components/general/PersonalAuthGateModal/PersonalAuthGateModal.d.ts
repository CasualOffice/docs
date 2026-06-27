import * as React from 'react';

/**
 * PersonalAuthGateModal — from @casualoffice/docs@1.1.7.
 */
export interface PersonalAuthGateModalProps {
  isOpen: boolean;
  heading: string;
  initialMode: "login" | "signup";
  /** Fired when the user clicks Sign In / Create Account. Throws on failure; the modal renders the surfaced error from `submi */
  onSubmit: (mode: "login" | "signup", creds: { username: string; password: string; }) => Promise<void>;
  submitError: PersonalFileSourceError;
  /** True during the initial /auth/me probe — disables Sign in. */
  loading: boolean;
}

export declare const PersonalAuthGateModal: React.ComponentType<PersonalAuthGateModalProps>;
