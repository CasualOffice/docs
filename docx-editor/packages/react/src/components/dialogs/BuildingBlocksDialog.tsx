/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Insert → Building blocks.
 *
 * Word's "Quick parts" equivalent: reusable named snippets the user has
 * saved from previous selections. The dialog has two regions —
 *
 *   1. Top: "Save current selection" — name input + Save button. Visible
 *      only when the host captured a non-empty selection at open time.
 *   2. Bottom: list of saved blocks (name + preview + Insert + Delete).
 *
 * Storage is host-owned (localStorage today). The dialog is pure UI: it
 * just calls the callbacks the host passes in.
 *
 * Visual language mirrors AccessibilityDialog / WatermarkDialog for
 * consistency.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import type { BuildingBlock } from '../../utils/buildingBlocks';

export interface BuildingBlocksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Saved blocks, ordered newest-first by the host. */
  blocks: BuildingBlock[];
  /** Preview of the captured selection, or null if nothing's selected. */
  pendingPreview: string | null;
  /** Save the captured selection under `name`. */
  onSaveSelection: (name: string) => void;
  /** Insert a saved block at the current editor selection. */
  onInsert: (id: string) => void;
  /** Remove a saved block from storage. */
  onDelete: (id: string) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  minWidth: 460,
  maxWidth: 560,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxHeight: '60vh',
  overflowY: 'auto',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--doc-text-muted, #6b7280)',
};

const saveRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  outline: 'none',
};

const previewHintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  fontStyle: 'italic',
  marginTop: 6,
};

const noSelectionHintStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--doc-text-muted, #6b7280)',
  padding: '8px 10px',
  background: 'var(--doc-bg-subtle, #f9fafb)',
  border: '1px dashed var(--doc-border, #e5e7eb)',
  borderRadius: 4,
};

const emptyStateStyle: CSSProperties = {
  padding: '12px 0',
  fontSize: 14,
  color: 'var(--doc-text-muted, #6b7280)',
  textAlign: 'center',
};

const blockRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 4,
  border: '1px solid var(--doc-border, #e5e7eb)',
};

const blockNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const blockPreviewStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--doc-text-muted, #6b7280)',
  marginTop: 2,
};

const rowActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexShrink: 0,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const btnBase: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const rowBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const insertBtnStyle: CSSProperties = {
  ...rowBtnStyle,
  color: 'var(--doc-primary, #1a73e8)',
  borderColor: 'var(--doc-primary, #1a73e8)',
};

const deleteBtnStyle: CSSProperties = {
  ...rowBtnStyle,
  color: 'var(--doc-error, #d93025)',
};

export function BuildingBlocksDialog({
  isOpen,
  onClose,
  blocks,
  pendingPreview,
  onSaveSelection,
  onInsert,
  onDelete,
}: BuildingBlocksDialogProps) {
  const [name, setName] = useState('');

  // Reset the name field whenever the dialog opens — stale text from a
  // previous open would otherwise bleed into the next save.
  useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmedName = name.trim();
  const canSave = pendingPreview !== null && trimmedName.length > 0;

  const submitSave = () => {
    if (!canSave) return;
    onSaveSelection(trimmedName);
    setName('');
  };

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Building blocks"
        data-testid="building-blocks-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Building blocks</div>
        <div style={bodyStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={sectionLabelStyle}>Save current selection</div>
            {pendingPreview === null ? (
              <div style={noSelectionHintStyle} data-testid="bb-no-selection">
                Select text or content in the document, then reopen this dialog to save it as a
                reusable block.
              </div>
            ) : (
              <>
                <div style={saveRowStyle}>
                  <input
                    type="text"
                    placeholder="Block name (e.g. Signature)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitSave();
                    }}
                    data-testid="bb-name-input"
                    style={inputStyle}
                    autoFocus
                  />
                  <button
                    type="button"
                    style={primaryBtnStyle}
                    data-testid="bb-save"
                    disabled={!canSave}
                    onClick={submitSave}
                  >
                    Save
                  </button>
                </div>
                <div style={previewHintStyle}>“{pendingPreview}”</div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={sectionLabelStyle}>
              Saved blocks{blocks.length > 0 ? ` (${blocks.length})` : ''}
            </div>
            {blocks.length === 0 ? (
              <div style={emptyStateStyle} data-testid="bb-empty">
                No building blocks saved yet.
              </div>
            ) : (
              blocks.map((block) => (
                <div key={block.id} style={blockRowStyle} data-testid={`bb-row-${block.id}`}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={blockNameStyle}>{block.name}</div>
                    <div
                      style={{
                        ...blockPreviewStyle,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {block.preview}
                    </div>
                  </div>
                  <div style={rowActionsStyle}>
                    <button
                      type="button"
                      style={insertBtnStyle}
                      data-testid={`bb-insert-${block.id}`}
                      onClick={() => onInsert(block.id)}
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      style={deleteBtnStyle}
                      data-testid={`bb-delete-${block.id}`}
                      onClick={() => onDelete(block.id)}
                      aria-label={`Delete ${block.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default BuildingBlocksDialog;
