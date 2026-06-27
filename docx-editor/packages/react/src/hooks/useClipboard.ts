/**
 * useClipboard Hook
 *
 * Thin React wrapper around the framework-agnostic ClipboardManager.
 * Handles clipboard operations with formatting preservation.
 */

import { useCallback, useRef } from 'react';
import {
  copyRuns,
  handlePasteEvent,
  parseClipboardHtml,
  runsToClipboardContent,
  type ParsedClipboardContent,
} from '@eigenpal/docx-core/utils';
import { getSelectionRuns, createSelectionFromDOM } from '@eigenpal/docx-core';
import type { ClipboardSelection, Theme } from '@eigenpal/docx-core';

// ============================================================================
// RE-EXPORTS (backwards compat)
// ============================================================================

export { getSelectionRuns, createSelectionFromDOM };
export type { ClipboardSelection };

// ============================================================================
// TYPES
// ============================================================================

export interface UseClipboardOptions {
  onCopy?: (selection: ClipboardSelection) => void;
  onCut?: (selection: ClipboardSelection) => void;
  onPaste?: (content: ParsedClipboardContent, asPlainText: boolean) => void;
  cleanWordFormatting?: boolean;
  editable?: boolean;
  onError?: (error: Error) => void;
  /** Document theme — used to resolve themed colors in the HTML clipboard payload. */
  theme?: Theme | null;
}

export interface UseClipboardReturn {
  copy: (selection: ClipboardSelection) => Promise<boolean>;
  cut: (selection: ClipboardSelection) => Promise<boolean>;
  paste: (asPlainText?: boolean) => Promise<ParsedClipboardContent | null>;
  handleCopy: (event: ClipboardEvent) => void;
  handleCut: (event: ClipboardEvent) => void;
  handlePaste: (event: ClipboardEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  isProcessing: boolean;
  lastPastedContent: ParsedClipboardContent | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const {
    onCopy,
    onCut,
    onPaste,
    cleanWordFormatting = true,
    editable = true,
    onError,
    theme,
  } = options;

  const isProcessingRef = useRef<boolean>(false);
  const lastPastedContentRef = useRef<ParsedClipboardContent | null>(null);
  // A paste `ClipboardEvent` carries no keyboard-modifier state, so we can't
  // read shift off it to detect ⌘/Ctrl+Shift+V (paste-as-plain-text). Instead
  // we remember whether the most recent paste-initiating keydown held Shift,
  // and consume that in `handlePaste`. `handleKeyDown` must be wired by the
  // consumer alongside `handlePaste` for the keyboard path to work.
  const plainPasteArmedRef = useRef<boolean>(false);

  const copy = useCallback(
    async (selection: ClipboardSelection): Promise<boolean> => {
      if (isProcessingRef.current) return false;

      isProcessingRef.current = true;
      try {
        const success = await copyRuns(selection.runs, { onError, theme });
        if (success) {
          onCopy?.(selection);
        }
        return success;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [onCopy, onError, theme]
  );

  const cut = useCallback(
    async (selection: ClipboardSelection): Promise<boolean> => {
      if (isProcessingRef.current || !editable) return false;

      isProcessingRef.current = true;
      try {
        const success = await copyRuns(selection.runs, { onError, theme });
        if (success) {
          onCut?.(selection);
        }
        return success;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [onCut, editable, onError, theme]
  );

  const paste = useCallback(
    async (asPlainText = false): Promise<ParsedClipboardContent | null> => {
      if (isProcessingRef.current || !editable) return null;

      isProcessingRef.current = true;
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          let html = '';
          let plainText = '';

          for (const item of items) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              html = await blob.text();
            }
            if (item.types.includes('text/plain')) {
              const blob = await item.getType('text/plain');
              plainText = await blob.text();
            }
          }

          if (asPlainText) {
            html = '';
          }

          const content = parseClipboardHtml(html, plainText, cleanWordFormatting);
          lastPastedContentRef.current = content;
          onPaste?.(content, asPlainText);
          return content;
        }

        return null;
      } catch (error) {
        onError?.(error as Error);
        return null;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [editable, cleanWordFormatting, onPaste, onError]
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent) => {
      const selection = createSelectionFromDOM();
      if (!selection) return;

      event.preventDefault();

      const content = runsToClipboardContent(selection.runs, true, theme);

      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', content.plainText);
        event.clipboardData.setData('text/html', content.html);
        if (content.internal) {
          event.clipboardData.setData('application/x-docx-editor', content.internal);
        }
      }

      onCopy?.(selection);
    },
    [onCopy, theme]
  );

  const handleCut = useCallback(
    (event: ClipboardEvent) => {
      if (!editable) return;

      const selection = createSelectionFromDOM();
      if (!selection) return;

      event.preventDefault();

      const content = runsToClipboardContent(selection.runs, true, theme);

      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', content.plainText);
        event.clipboardData.setData('text/html', content.html);
        if (content.internal) {
          event.clipboardData.setData('application/x-docx-editor', content.internal);
        }
      }

      onCut?.(selection);
    },
    [editable, onCut, theme]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (!editable) return;

      event.preventDefault();

      const content = handlePasteEvent(event, { cleanWordFormatting });
      if (content) {
        lastPastedContentRef.current = content;
        // The paste event has no modifier state; read the flag armed by the
        // preceding keydown (⌘/Ctrl+Shift+V) and disarm it.
        const asPlainText = plainPasteArmedRef.current;
        plainPasteArmedRef.current = false;
        onPaste?.(content, asPlainText);
      }
    },
    [editable, cleanWordFormatting, onPaste]
  );

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Native copy/cut/paste events do the actual clipboard work; we only
    // record whether a paste keystroke (⌘/Ctrl+V) held Shift so the paste
    // handler can branch to plain-text. Other keys leave the flag untouched.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      plainPasteArmedRef.current = event.shiftKey;
    }
  }, []);

  return {
    copy,
    cut,
    paste,
    handleCopy,
    handleCut,
    handlePaste,
    handleKeyDown,
    isProcessing: isProcessingRef.current,
    lastPastedContent: lastPastedContentRef.current,
  };
}

export default useClipboard;
