import * as React from 'react';

/**
 * FontSizePicker — from @casualoffice/docs@1.1.7.
 */
export interface FontSizePickerProps {
  value?: number;
  onChange?: (size: number) => void;
  sizes?: number[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  width?: string | number;
  minSize?: number;
  maxSize?: number;
}

export declare const FontSizePicker: React.ComponentType<FontSizePickerProps>;
