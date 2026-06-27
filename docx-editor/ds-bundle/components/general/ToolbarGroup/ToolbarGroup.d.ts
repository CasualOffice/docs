import * as React from 'react';

/**
 * ToolbarGroup — from @casualoffice/docs@1.1.7.
 */
export interface ToolbarGroupProps {
  /** Group items */
  children: React.ReactNode;
  /** Gap between items */
  gap?: number;
  /** Whether to show separator after group */
  separatorAfter?: boolean;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: React__default.CSSProperties;
}

export declare const ToolbarGroup: React.ComponentType<ToolbarGroupProps>;
