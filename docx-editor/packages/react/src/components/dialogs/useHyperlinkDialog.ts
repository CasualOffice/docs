/**
 * Hyperlink dialog state hook — lives in its own module so consumers
 * (DocxEditor) can import the hook without pulling the dialog
 * component's chunk back into the main bundle. The dialog itself is
 * lazy-loaded via `React.lazy()`; re-importing through the dialog
 * file forced an eager evaluation that wired up a circular dependency
 * and minified down to `TypeError: n is not a function` at boot.
 *
 * Same pattern as `useFindReplace.ts`.
 */

import { useCallback, useState } from 'react';

export interface HyperlinkData {
  /** URL for external link */
  url?: string;
  /** Display text for the link */
  displayText?: string;
  /** Internal bookmark name */
  bookmark?: string;
  /** Tooltip text */
  tooltip?: string;
  /** Whether opens in new window */
  target?: '_blank' | '_self';
}

export interface UseHyperlinkDialogState {
  isOpen: boolean;
  initialData?: HyperlinkData;
  selectedText?: string;
  isEditing: boolean;
}

export interface UseHyperlinkDialogReturn {
  state: UseHyperlinkDialogState;
  openInsert: (selectedText?: string) => void;
  openEdit: (data: HyperlinkData) => void;
  close: () => void;
  toggle: () => void;
}

export function useHyperlinkDialog(): UseHyperlinkDialogReturn {
  const [state, setState] = useState<UseHyperlinkDialogState>({
    isOpen: false,
    isEditing: false,
  });

  const openInsert = useCallback((selectedText?: string) => {
    setState({
      isOpen: true,
      selectedText,
      initialData: undefined,
      isEditing: false,
    });
  }, []);

  const openEdit = useCallback((data: HyperlinkData) => {
    setState({
      isOpen: true,
      initialData: data,
      selectedText: data.displayText,
      isEditing: true,
    });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: !prev.isOpen,
    }));
  }, []);

  return { state, openInsert, openEdit, close, toggle };
}
