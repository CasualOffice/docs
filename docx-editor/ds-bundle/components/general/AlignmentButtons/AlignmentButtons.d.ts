import * as React from 'react';

/**
 * AlignmentButtons — from @casualoffice/docs@1.1.7.
 */
export interface AlignmentButtonsProps {
  /** Current alignment value */
  value?: "left" | "center" | "right" | "both" | "distribute" | "mediumKashida" | "highKashida" | "lowKashida" | "thaiDistribute";
  /** Callback when alignment is changed */
  onChange?: (alignment: ParagraphAlignment) => void;
  /** Whether the buttons are disabled */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline styles */
  style?: React__default.CSSProperties;
  /** Show labels next to icons */
  showLabels?: boolean;
  /** Compact mode (smaller buttons) */
  compact?: boolean;
}

export declare const AlignmentButtons: React.ComponentType<AlignmentButtonsProps>;
