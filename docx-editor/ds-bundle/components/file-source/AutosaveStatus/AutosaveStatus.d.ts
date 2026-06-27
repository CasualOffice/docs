import * as React from 'react';

/**
 * AutosaveStatus — from @casualoffice/docs@1.1.7.
 */
export interface AutosaveStatusProps {
  /** Pass the full return value of useFileSourceAutoSave. */
  state: UseFileSourceAutoSaveReturn;
  /** Optional className for host-app styling. */
  className?: string;
  /** Data-testid for E2E. Defaults to 'autosave-status'. */
  testId?: string;
  /** Override the "last saved" label. Defaults to the relative format ("just now" / "1 minute ago" / "5 minutes ago"). Hosts  */
  formatLastSaved?: (date: Date) => string;
}

export declare const AutosaveStatus: React.ComponentType<AutosaveStatusProps>;
