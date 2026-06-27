import * as React from 'react';

/**
 * LineSpacingPicker — from @casualoffice/docs@1.1.7.
 */
export interface LineSpacingPickerProps {
  value?: number;
  onChange?: (twipsValue: number) => void;
  options?: LineSpacingOption[];
  disabled?: boolean;
  className?: string;
  width?: string | number;
  /** Current spaceBefore value in twips (from paragraph formatting) */
  spaceBefore?: number;
  /** Current spaceAfter value in twips (from paragraph formatting) */
  spaceAfter?: number;
  onSpaceBeforeChange?: (twips: number) => void;
  onSpaceAfterChange?: (twips: number) => void;
  /** Open the Custom spacing dialog (Docs's Custom spacing… leaf). */
  onOpenCustomSpacing?: () => void;
  /** Current paragraph pagination attrs. */
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  onTogglePagination?: (key: "keepNext" | "keepLines" | "pageBreakBefore" | "widowControl") => void;
}

export declare const LineSpacingPicker: React.ComponentType<LineSpacingPickerProps>;
