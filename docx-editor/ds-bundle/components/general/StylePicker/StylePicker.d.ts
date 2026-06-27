import * as React from 'react';

/**
 * StylePicker — from @casualoffice/docs@1.1.7.
 */
export interface StylePickerProps {
  value?: string;
  onChange?: (styleId: string) => void;
  styles?: Style[];
  theme?: Theme;
  disabled?: boolean;
  className?: string;
  width?: string | number;
}

export declare const StylePicker: React.ComponentType<StylePickerProps>;
