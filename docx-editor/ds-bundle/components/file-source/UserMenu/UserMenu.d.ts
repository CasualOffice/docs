import * as React from 'react';

/**
 * UserMenu — from @casualoffice/docs@1.1.7.
 */
export interface UserMenuProps {
  /** Optional className applied to the trigger button, so a host app can match its own title-bar styling without inlining a s */
  className?: string;
  /** Optional callback fired after logout completes (after the gate's onAuthenticated transitions away from `authed`). Useful */
  onLogout?: () => void;
  /** Optional AuthClient passed through to the Profile settings dialog. When omitted the dialog builds its own same-origin cl */
  authClient?: AuthClient;
  /** Data-testid for E2E tests. Applied to the trigger; the dropdown panel + sign-out button derive their testids from the sa */
  testId?: string;
}

export declare const UserMenu: React.ComponentType<UserMenuProps>;
