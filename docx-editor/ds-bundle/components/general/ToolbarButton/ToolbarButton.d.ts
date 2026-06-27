import * as React from 'react';

/**
 * ToolbarButton — from @casualoffice/docs@1.1.7.
 */
export interface ToolbarButtonProps {
  /** Whether the button is in active/pressed state */
  active?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button title/tooltip */
  title?: string;
  /** Optional keyboard shortcut hint shown in the tooltip in a kbd style. */
  shortcut?: string;
  /** Click handler */
  onClick?: () => void;
  /** Button content */
  children: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** ARIA label for accessibility */
  ariaLabel?: string;
}

export declare const ToolbarButton: React.ComponentType<ToolbarButtonProps>;
