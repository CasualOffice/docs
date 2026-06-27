import * as React from 'react';

/**
 * PrintButton — from @casualoffice/docs@1.1.7.
 */
export interface PrintButtonProps {
  /** Callback when print is triggered */
  onPrint: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button label */
  label?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show icon */
  showIcon?: boolean;
  /** Compact mode */
  compact?: boolean;
}

export declare const PrintButton: React.ComponentType<PrintButtonProps>;
