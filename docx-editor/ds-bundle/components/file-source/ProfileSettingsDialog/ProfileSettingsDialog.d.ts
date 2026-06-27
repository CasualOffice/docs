import * as React from 'react';

/**
 * ProfileSettingsDialog — from @casualoffice/docs@1.1.7.
 */
export interface ProfileSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional AuthClient override. When omitted the dialog builds a default same-origin client (matches the gate's behaviour) */
  authClient?: AuthClient;
  /** Fired after a successful save with the refreshed profile, so the host can update the title bar / user menu without forci */
  onSaved?: (profile: ProfileWire) => void;
  /** Data-testid root. */
  testId?: string;
}

export declare const ProfileSettingsDialog: React.ComponentType<ProfileSettingsDialogProps>;
