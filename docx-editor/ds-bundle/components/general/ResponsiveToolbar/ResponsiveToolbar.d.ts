import * as React from 'react';

/**
 * ResponsiveToolbar — from @casualoffice/docs@1.1.7.
 */
export interface ResponsiveToolbarProps {
  /** Toolbar items */
  items: ToolbarItem[];
  /** Additional items for overflow menu only */
  overflowItems?: ToolbarItem[];
  /** Whether to show overflow button even when all items fit */
  alwaysShowOverflow?: boolean;
  /** Custom overflow button renderer */
  renderOverflowButton?: (itemCount: number, isOpen: boolean, onClick: () => void) => ReactNode;
  /** Custom overflow menu renderer */
  renderOverflowMenu?: (items: ToolbarItem[], onClose: () => void) => ReactNode;
  /** Gap between items in pixels */
  itemGap?: number;
  /** Padding for the toolbar */
  padding?: string | number;
  /** Minimum width for overflow button */
  overflowButtonWidth?: number;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: React__default.CSSProperties;
  /** Height of the toolbar */
  height?: string | number;
  /** Background color */
  backgroundColor?: string;
  /** Border styles */
  borderBottom?: string;
}

export declare const ResponsiveToolbar: React.ComponentType<ResponsiveToolbarProps>;
