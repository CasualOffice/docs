import * as React from 'react';

/**
 * UploadedSignatureField — from @casualoffice/docs@1.1.7.
 */
export interface UploadedSignatureFieldProps {
  onCapture: (sig: CapturedSignature) => void;
  /** Accept attribute. Default image/*. */
  accept?: string;
}

export declare const UploadedSignatureField: React.ComponentType<UploadedSignatureFieldProps>;
