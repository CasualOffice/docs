/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Format / Properties panel — the contextual right-rail home for editing
 * the properties of the SELECTED object (image / table / shape): size,
 * wrap, position, fill, borders, recolor, alt text.
 *
 * This is the agreed pattern (Collabora/LibreOffice sidebar, Word Format
 * pane, Figma, Google-Docs "Image options"): one clean surface instead of
 * scattering object-property controls across toolbar/menu/dialogs. Each
 * object kind contributes a *section*; the host renders the active section
 * as `children` based on `kind`. New per-object property UIs plug in here.
 *
 * Built on RightDockPanel so it shares the rail behavior (one panel at a
 * time, slide-in, close-✕) with comments / version-history / outline.
 */
import type { ReactNode } from 'react';
import { RightDockPanel } from '../RightDockPanel';
import { MaterialSymbol } from '../ui/Icons';
import { PanelState } from '../ui/PanelState';

export type PropertiesTargetKind = 'image' | 'table' | 'shape' | 'textbox';

export interface PropertiesPanelProps {
  /** The kind of object currently selected, or null when none is. */
  kind: PropertiesTargetKind | null;
  /** Close the panel (rail toggle off). */
  onClose: () => void;
  /** The active object's property section, chosen by the host from `kind`. */
  children?: ReactNode;
}

export function PropertiesPanel({ kind, onClose, children }: PropertiesPanelProps) {
  return (
    <RightDockPanel
      title="Format"
      icon={<MaterialSymbol name="tune" size={18} />}
      testId="properties-panel"
      ariaLabel="Format properties"
      onClose={onClose}
    >
      {kind && children ? (
        children
      ) : (
        <PanelState
          kind="empty"
          message="Select an image, table, or shape to edit its properties."
        />
      )}
    </RightDockPanel>
  );
}
