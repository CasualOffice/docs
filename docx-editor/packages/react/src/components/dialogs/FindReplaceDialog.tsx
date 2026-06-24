/**
 * Find and Replace Dialog Component
 *
 * Modal dialog for searching and replacing text in the document.
 * Supports find, find next/previous, replace, and replace all operations.
 *
 * Logic and utilities are in separate files:
 * - findReplaceUtils.ts — Pure search/replace functions and types
 * - useFindReplace.ts   — React hook for dialog state management
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, ChangeEvent } from 'react';
import { useTranslation } from '../../i18n';

// Re-export types and utilities so existing imports still work
export type { FindMatch, FindOptions, FindResult, HighlightOptions } from './findReplaceUtils';
export {
  createDefaultFindOptions,
  findAllMatches,
  escapeRegexString,
  createSearchPattern,
  replaceAllInContent,
  replaceFirstInContent,
  getMatchCountText,
  isEmptySearch,
  getDefaultHighlightOptions,
  findInDocument,
  findInParagraph,
  scrollToMatch,
} from './findReplaceUtils';

export type { FindReplaceOptions, FindReplaceState, UseFindReplaceReturn } from './useFindReplace';
export { useFindReplace } from './useFindReplace';

import type { FindOptions, FindResult, FindMatch } from './findReplaceUtils';

// ============================================================================
// PROPS
// ============================================================================

/**
 * Props for the FindReplaceDialog component
 */
export interface FindReplaceDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when searching for text */
  onFind: (searchText: string, options: FindOptions) => FindResult | null;
  /** Callback when navigating to next match */
  onFindNext: () => FindMatch | null;
  /** Callback when navigating to previous match */
  onFindPrevious: () => FindMatch | null;
  /** Callback when replacing current match */
  onReplace: (replaceText: string) => boolean;
  /** Callback when replacing all matches */
  onReplaceAll: (searchText: string, replaceText: string, options: FindOptions) => number;
  /** Callback to highlight matches in document */
  onHighlightMatches?: (matches: FindMatch[]) => void;
  /** Callback to clear highlights */
  onClearHighlights?: () => void;
  /** Initial search text (e.g., from selected text) */
  initialSearchText?: string;
  /** Whether to start in replace mode */
  replaceMode?: boolean;
  /** Current match result (from external state) */
  currentResult?: FindResult | null;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
}

// ============================================================================
// STYLES
// ============================================================================

const DIALOG_OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'transparent',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  zIndex: 10000,
  pointerEvents: 'none',
};

/* ============================================================
   FindReplaceDialog is a NON-MODAL floating panel — the editor
   stays interactive while it's open. Premium pass keeps that
   contract intact while bringing the chrome in line with the
   modal Dialog shell:
     - 12px corner radius (matches the modal shell's 14px family)
     - Three-layer shadow (ambient + edge + landing)
     - Hairline --doc-border-light outline
     - Soft scale-in motion (200ms, same curve as the modal shell)
     - Refined header typography (-0.005em letterspaced)
     - Close X is a stroked SVG (not a glyph)
   ============================================================ */

const DIALOG_CONTENT_STYLE: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: '12px',
  boxShadow:
    '0 1px 1px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.08), 0 24px 64px rgba(15, 23, 42, 0.18)',
  border: '1px solid var(--doc-border-light)',
  minWidth: 'min(380px, calc(100vw - 32px))',
  maxWidth: '460px',
  width: '100%',
  margin:
    'clamp(40px, 8vw, 60px) clamp(8px, 2.5vw, 20px) clamp(8px, 2.5vw, 20px) clamp(8px, 2.5vw, 20px)',
  pointerEvents: 'auto',
  animation: 'docFindReplaceIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
  overflow: 'hidden',
};

const DIALOG_HEADER_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--doc-border-light)',
  backgroundColor: 'var(--doc-surface-muted)',
};

const DIALOG_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--doc-text)',
  letterSpacing: '-0.005em',
};

const CLOSE_BUTTON_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--doc-text-muted)',
  padding: 6,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  marginRight: -6,
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const DIALOG_BODY_STYLE: CSSProperties = {
  padding: '14px 16px 12px',
};

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '12px',
};

const LABEL_STYLE: CSSProperties = {
  width: '60px',
  fontSize: '13px',
  color: 'var(--doc-text)',
  flexShrink: 0,
};

const INPUT_STYLE: CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  border: '1px solid var(--doc-border)',
  borderRadius: '6px',
  fontSize: '13px',
  boxSizing: 'border-box',
  outline: 'none',
  background: 'var(--doc-surface)',
  color: 'var(--doc-text)',
  transition:
    'border-color 80ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const INPUT_FOCUS_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  borderColor: 'var(--doc-primary)',
  boxShadow: '0 0 0 3px rgba(26, 115, 232, 0.16)',
};

const BUTTON_CONTAINER_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginLeft: '8px',
};

const BUTTON_BASE_STYLE: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12.5px',
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid var(--doc-border)',
  backgroundColor: 'var(--doc-surface)',
  color: 'var(--doc-text)',
  minWidth: '80px',
  textAlign: 'center',
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), border-color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const BUTTON_DISABLED_STYLE: CSSProperties = {
  ...BUTTON_BASE_STYLE,
  backgroundColor: 'var(--doc-surface-muted)',
  color: 'var(--doc-text-subtle)',
  cursor: 'not-allowed',
};

const NAV_BUTTON_STYLE: CSSProperties = {
  padding: '6px 8px',
  borderRadius: '6px',
  cursor: 'pointer',
  border: '1px solid var(--doc-border)',
  backgroundColor: 'var(--doc-surface)',
  color: 'var(--doc-text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition:
    'background 80ms cubic-bezier(0.4, 0, 0.2, 1), color 80ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const NAV_BUTTON_DISABLED_STYLE: CSSProperties = {
  ...NAV_BUTTON_STYLE,
  color: 'var(--doc-text-subtle)',
  cursor: 'not-allowed',
};

const OPTIONS_CONTAINER_STYLE: CSSProperties = {
  display: 'flex',
  gap: '16px',
  marginTop: '4px',
  marginLeft: '68px',
};

const CHECKBOX_LABEL_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  color: 'var(--doc-text-muted)',
  cursor: 'pointer',
};

const CHECKBOX_STYLE: CSSProperties = {
  width: '14px',
  height: '14px',
  cursor: 'pointer',
};

const STATUS_STYLE: CSSProperties = {
  marginLeft: '68px',
  fontSize: '12px',
  color: 'var(--doc-text-muted)',
  marginBottom: '8px',
};

const NO_RESULTS_STYLE: CSSProperties = {
  ...STATUS_STYLE,
  color: 'var(--doc-error)',
};

// ============================================================================
// ICONS
// ============================================================================

const ChevronUpIcon: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ChevronDownIcon: React.FC<{ style?: CSSProperties }> = ({ style }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * FindReplaceDialog component - Modal for finding and replacing text
 */
export function FindReplaceDialog({
  isOpen,
  onClose,
  onFind,
  onFindNext,
  onFindPrevious,
  onReplace,
  onReplaceAll,
  onHighlightMatches,
  onClearHighlights,
  initialSearchText = '',
  replaceMode = false,
  currentResult,
  className,
  style,
}: FindReplaceDialogProps): React.ReactElement | null {
  const { t } = useTranslation();

  // State
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(replaceMode);
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  // Phase 1.5 U7 — exposes the existing `useRegex` flag in
  // `FindOptions` (already handled by findReplaceUtils.ts:93-103).
  // Matches Word's "Use wildcards" and VS Code's "Use Regular
  // Expression" checkboxes.
  const [useRegex, setUseRegex] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [replaceFocused, setReplaceFocused] = useState(false);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Sync with external result if provided
  useEffect(() => {
    if (currentResult !== undefined) {
      setResult(currentResult);
    }
  }, [currentResult]);

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSearchText(initialSearchText);
      setReplaceText('');
      setShowReplace(replaceMode);
      setResult(null);

      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 100);

      if (initialSearchText) {
        const searchResult = onFind(initialSearchText, {
          matchCase,
          matchWholeWord,
          useRegex,
        });
        setResult(searchResult);
        if (searchResult?.matches && onHighlightMatches) {
          onHighlightMatches(searchResult.matches);
        }
      }
    } else {
      if (onClearHighlights) {
        onClearHighlights();
      }
    }
  }, [isOpen, initialSearchText, replaceMode]);

  const performSearch = useCallback(() => {
    if (!searchText.trim()) {
      setResult(null);
      if (onClearHighlights) {
        onClearHighlights();
      }
      return;
    }

    const searchResult = onFind(searchText, { matchCase, matchWholeWord, useRegex });
    setResult(searchResult);

    if (searchResult?.matches && onHighlightMatches) {
      onHighlightMatches(searchResult.matches);
    } else if (onClearHighlights) {
      onClearHighlights();
    }
  }, [
    searchText,
    matchCase,
    matchWholeWord,
    useRegex,
    onFind,
    onHighlightMatches,
    onClearHighlights,
  ]);

  useEffect(() => {
    if (isOpen && searchText.trim()) {
      performSearch();
    }
  }, [matchCase, matchWholeWord, useRegex]);

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handleFindPrevious();
        } else {
          if (!result) {
            performSearch();
          } else {
            handleFindNext();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [result, performSearch, onClose]
  );

  const handleReplaceKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleReplace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleFindNext = useCallback(() => {
    if (!searchText.trim()) {
      performSearch();
      return;
    }

    if (!result) {
      performSearch();
      return;
    }

    const match = onFindNext();
    if (match && result) {
      const newIndex = (result.currentIndex + 1) % result.totalCount;
      setResult({
        ...result,
        currentIndex: newIndex,
      });
    }
  }, [searchText, result, performSearch, onFindNext]);

  const handleFindPrevious = useCallback(() => {
    if (!searchText.trim()) {
      performSearch();
      return;
    }

    if (!result) {
      performSearch();
      return;
    }

    const match = onFindPrevious();
    if (match && result) {
      const newIndex = result.currentIndex === 0 ? result.totalCount - 1 : result.currentIndex - 1;
      setResult({
        ...result,
        currentIndex: newIndex,
      });
    }
  }, [searchText, result, performSearch, onFindPrevious]);

  const handleReplace = useCallback(() => {
    if (!result || result.totalCount === 0) return;

    const success = onReplace(replaceText);
    if (success) {
      const newResult = onFind(searchText, { matchCase, matchWholeWord, useRegex });
      setResult(newResult);
      if (newResult?.matches && onHighlightMatches) {
        onHighlightMatches(newResult.matches);
      }
    }
  }, [
    result,
    replaceText,
    searchText,
    matchCase,
    matchWholeWord,
    useRegex,
    onReplace,
    onFind,
    onHighlightMatches,
  ]);

  const handleReplaceAll = useCallback(() => {
    if (!searchText.trim()) return;

    const count = onReplaceAll(searchText, replaceText, { matchCase, matchWholeWord, useRegex });
    if (count > 0) {
      setResult({
        matches: [],
        totalCount: 0,
        currentIndex: -1,
      });
      if (onClearHighlights) {
        onClearHighlights();
      }
    }
  }, [
    searchText,
    replaceText,
    matchCase,
    matchWholeWord,
    useRegex,
    onReplaceAll,
    onClearHighlights,
  ]);

  const toggleReplaceMode = useCallback(() => {
    setShowReplace((prev) => {
      const newValue = !prev;
      if (newValue) {
        setTimeout(() => replaceInputRef.current?.focus(), 100);
      }
      return newValue;
    });
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Don't close on overlay click - this is a non-modal dialog
    }
  }, []);

  const handleDialogKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  const hasMatches = result && result.totalCount > 0;
  const noMatches = result && result.totalCount === 0 && searchText.trim();

  return (
    <div
      className={`docx-find-replace-dialog-overlay ${className || ''}`}
      style={{ ...DIALOG_OVERLAY_STYLE, ...style }}
      onClick={handleOverlayClick}
      onKeyDown={handleDialogKeyDown}
    >
      <div
        className="docx-find-replace-dialog"
        data-testid="find-replace-dialog"
        style={DIALOG_CONTENT_STYLE}
        role="dialog"
        aria-modal="false"
        aria-labelledby="find-replace-dialog-title"
      >
        {/* Local keyframe for the soft entry motion. Co-located so the
            shared stylesheet doesn't need to know about a per-dialog
            animation. */}
        <style>{`
          @keyframes docFindReplaceIn {
            from { opacity: 0; transform: scale(0.96) translateY(-6px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        {/* Header */}
        <div className="docx-find-replace-dialog-header" style={DIALOG_HEADER_STYLE}>
          <h2 id="find-replace-dialog-title" style={DIALOG_TITLE_STYLE}>
            {showReplace
              ? t('dialogs.findReplace.titleFindReplace')
              : t('dialogs.findReplace.titleFind')}
          </h2>
          <button
            type="button"
            className="docx-find-replace-dialog-close"
            style={CLOSE_BUTTON_STYLE}
            onClick={onClose}
            aria-label={t('common.closeDialog')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="docx-find-replace-dialog-body" style={DIALOG_BODY_STYLE}>
          {/* Find row */}
          <div className="docx-find-replace-dialog-row" style={ROW_STYLE}>
            <label htmlFor="find-text" style={LABEL_STYLE}>
              {t('dialogs.findReplace.findLabel')}
            </label>
            <input
              ref={searchInputRef}
              id="find-text"
              data-testid="find-input"
              type="text"
              className="docx-find-replace-dialog-input"
              style={searchFocused ? INPUT_FOCUS_STYLE : INPUT_STYLE}
              value={searchText}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                setSearchFocused(false);
                if (searchText.trim() && !result) {
                  performSearch();
                }
              }}
              placeholder={t('dialogs.findReplace.findPlaceholder')}
              aria-label={t('dialogs.findReplace.findAriaLabel')}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="docx-find-replace-dialog-nav"
                style={hasMatches ? NAV_BUTTON_STYLE : NAV_BUTTON_DISABLED_STYLE}
                onClick={handleFindPrevious}
                disabled={!hasMatches}
                aria-label={t('dialogs.findReplace.findPrevious')}
                title={t('dialogs.findReplace.findPreviousTitle')}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                className="docx-find-replace-dialog-nav"
                style={hasMatches ? NAV_BUTTON_STYLE : NAV_BUTTON_DISABLED_STYLE}
                onClick={handleFindNext}
                disabled={!hasMatches}
                aria-label={t('dialogs.findReplace.findNext')}
                title={t('dialogs.findReplace.findNextTitle')}
              >
                <ChevronDownIcon />
              </button>
            </div>
          </div>

          {/* Status line */}
          {hasMatches && (
            <div className="docx-find-replace-dialog-status" style={STATUS_STYLE}>
              {t('dialogs.findReplace.matchCount', {
                current: result.currentIndex + 1,
                total: result.totalCount,
              })}
            </div>
          )}
          {noMatches && (
            <div className="docx-find-replace-dialog-status" style={NO_RESULTS_STYLE}>
              {t('dialogs.findReplace.noResults')}
            </div>
          )}

          {/* Replace row (togglable) */}
          {showReplace && (
            <>
              <div className="docx-find-replace-dialog-row" style={ROW_STYLE}>
                <label htmlFor="replace-text" style={LABEL_STYLE}>
                  {t('dialogs.findReplace.replaceLabel')}
                </label>
                <input
                  ref={replaceInputRef}
                  id="replace-text"
                  type="text"
                  className="docx-find-replace-dialog-input"
                  style={replaceFocused ? INPUT_FOCUS_STYLE : INPUT_STYLE}
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={handleReplaceKeyDown}
                  onFocus={() => setReplaceFocused(true)}
                  onBlur={() => setReplaceFocused(false)}
                  placeholder={t('dialogs.findReplace.replacePlaceholder')}
                  aria-label={t('dialogs.findReplace.replaceAriaLabel')}
                />
                <div style={BUTTON_CONTAINER_STYLE}>
                  <button
                    type="button"
                    className="docx-find-replace-dialog-button"
                    style={hasMatches ? BUTTON_BASE_STYLE : BUTTON_DISABLED_STYLE}
                    onClick={handleReplace}
                    disabled={!hasMatches}
                    title={t('dialogs.findReplace.replaceCurrentTitle')}
                  >
                    {t('dialogs.findReplace.replaceButton')}
                  </button>
                  <button
                    type="button"
                    className="docx-find-replace-dialog-button"
                    style={hasMatches ? BUTTON_BASE_STYLE : BUTTON_DISABLED_STYLE}
                    onClick={handleReplaceAll}
                    disabled={!hasMatches}
                    title={t('dialogs.findReplace.replaceAllTitle')}
                  >
                    {t('dialogs.findReplace.replaceAllButton')}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Options */}
          <div className="docx-find-replace-dialog-options" style={OPTIONS_CONTAINER_STYLE}>
            <label className="docx-find-replace-dialog-option" style={CHECKBOX_LABEL_STYLE}>
              <input
                type="checkbox"
                style={CHECKBOX_STYLE}
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              {t('dialogs.findReplace.matchCase')}
            </label>
            <label className="docx-find-replace-dialog-option" style={CHECKBOX_LABEL_STYLE}>
              <input
                type="checkbox"
                style={CHECKBOX_STYLE}
                checked={matchWholeWord}
                onChange={(e) => setMatchWholeWord(e.target.checked)}
              />
              {t('dialogs.findReplace.wholeWords')}
            </label>
            <label
              className="docx-find-replace-dialog-option"
              style={CHECKBOX_LABEL_STYLE}
              data-testid="find-replace-use-regex-label"
            >
              <input
                type="checkbox"
                style={CHECKBOX_STYLE}
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                data-testid="find-replace-use-regex"
              />
              {t('dialogs.findReplace.useRegex')}
            </label>
            {!showReplace && (
              <button
                type="button"
                style={{
                  ...CHECKBOX_LABEL_STYLE,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--doc-link)',
                  padding: 0,
                }}
                onClick={toggleReplaceMode}
              >
                {t('dialogs.findReplace.toggleReplace')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FindReplaceDialog;
