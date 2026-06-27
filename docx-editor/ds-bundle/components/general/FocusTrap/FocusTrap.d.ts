import * as React from 'react';

/**
 * FocusTrap — from @casualoffice/docs@1.1.7.
 */
export interface FocusTrapProps {
  /** Subtree to scope focus to. */
  children: React.ReactNode;
  /** When false, the trap is inactive (still renders children). Useful for dialogs that conditionally mount inside a sibling. */
  active?: boolean;
  /** Optional ref to focus on mount instead of the first focusable. */
  initialFocus?: React$1.RefObject<HTMLElement>;
  /** Optional class applied to the wrapper. */
  className?: string;
}

export declare const FocusTrap: React.ComponentType<FocusTrapProps>;
