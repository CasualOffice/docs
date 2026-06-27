import * as React from 'react';

/**
 * DrawnSignaturePad — from @casualoffice/docs@1.1.7.
 */
export interface DrawnSignaturePadProps {
  /** Fired when the user clicks "Use this signature". */
  onCapture: (sig: CapturedSignature) => void;
  /** Optional clear-button label override. */
  clearLabel?: string;
  /** Optional save-button label override. */
  saveLabel?: string;
  /** Canvas pixel size. Default 480 × 160. */
  width?: number;
  height?: number;
}

export declare const DrawnSignaturePad: React.ComponentType<DrawnSignaturePadProps>;
