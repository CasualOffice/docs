import * as React from 'react';

/**
 * TypedSignatureField — from @casualoffice/docs@1.1.7.
 */
export interface TypedSignatureFieldProps {
  onCapture: (sig: CapturedSignature) => void;
  defaultText?: string;
  saveLabel?: string;
}

export declare const TypedSignatureField: React.ComponentType<TypedSignatureFieldProps>;
