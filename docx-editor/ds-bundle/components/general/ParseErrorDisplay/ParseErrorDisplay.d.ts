import * as React from 'react';

/**
 * ParseErrorDisplay — from @casualoffice/docs@1.1.7.
 */
export interface ParseErrorDisplayProps {
  message: string;
  details?: string;
  onRetry?: () => void;
  className?: string;
}

export declare const ParseErrorDisplay: React.ComponentType<ParseErrorDisplayProps>;
