import * as React from 'react';

/**
 * ErrorBoundary — from @casualoffice/docs@1.1.7.
 */
export interface ErrorBoundaryProps {
  /** Child components to render */
  children: React.ReactNode;
  /** Custom fallback UI */
  fallback?: unknown;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show error details */
  showDetails?: boolean;
}

export declare const ErrorBoundary: React.ComponentType<ErrorBoundaryProps>;
