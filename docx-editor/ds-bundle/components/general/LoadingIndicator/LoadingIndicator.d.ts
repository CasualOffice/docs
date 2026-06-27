import * as React from 'react';

/**
 * LoadingIndicator — from @casualoffice/docs@1.1.7.
 */
export interface LoadingIndicatorProps {
  /** Whether loading is active */
  isLoading: boolean;
  /** Variant of the loading indicator */
  variant?: "spinner" | "dots" | "bar" | "pulse" | "progress";
  /** Size of the indicator */
  size?: "small" | "medium" | "large";
  /** Loading message to display */
  message?: string;
  /** Whether to show as full-screen overlay */
  overlay?: boolean;
  /** Overlay background opacity (0-1) */
  overlayOpacity?: number;
  /** Progress percentage (0-100) for progress variant */
  progress?: number;
  /** Show progress percentage text */
  showProgressText?: boolean;
  /** Custom color */
  color?: string;
  /** Additional className */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
}

export declare const LoadingIndicator: React.ComponentType<LoadingIndicatorProps>;
