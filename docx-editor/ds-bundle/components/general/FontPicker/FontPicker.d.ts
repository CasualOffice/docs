import * as React from 'react';

/**
 * FontPicker — from @casualoffice/docs@1.1.7.
 */
export interface FontPickerProps {
  value?: string;
  onChange?: (fontFamily: string) => void;
  fonts?: FontOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  width?: string | number;
  showPreview?: boolean;
}

export declare const FontPicker: React.ComponentType<FontPickerProps>;
