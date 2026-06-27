import * as React from 'react';

/**
 * ZoomControl — from @casualoffice/docs@1.1.7.
 */
export interface ZoomControlProps {
  value?: number;
  onChange?: (zoom: number) => void;
  levels?: ZoomLevel[];
  disabled?: boolean;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  showButtons?: boolean;
  persistZoom?: boolean;
  storageKey?: string;
  compact?: boolean;
}

export declare const ZoomControl: React.ComponentType<ZoomControlProps>;
