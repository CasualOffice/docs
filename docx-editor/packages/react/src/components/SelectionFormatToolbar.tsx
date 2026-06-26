/**
 * SelectionFormatToolbar — Google-Docs / Word-style on-selection mini toolbar.
 *
 * When the user selects text in the body editor, a small floating toolbar
 * appears just above the selection with the highest-frequency character
 * formatting (bold / italic / underline / strikethrough), each reflecting the
 * selection's current state. This is the Tier-1 editing-UX affordance the
 * competitive analysis (docs/internal/29) flagged as expected — Google Docs and
 * Word ship it; OnlyOffice's absence is a documented complaint.
 *
 * It anchors with the same `coordsAtPos` approach as SelectionAskAi, but prefers
 * ABOVE the selection (Word's mini-toolbar placement) and falls back below when
 * there isn't room. Every button uses `onMouseDown` preventDefault so clicking
 * never collapses the PM selection (the documented focus-stealing pitfall).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EditorView } from 'prosemirror-view';
import { MaterialSymbol } from './ui/Icons';
import { useTranslation } from '../i18n';
import type { SelectionFormatting } from './Toolbar';
import type { FormattingAction } from './Toolbar';

export interface SelectionFormatToolbarProps {
  /** Shown only when there is a non-empty body selection. */
  isOpen: boolean;
  /** Returns the active editor view for coordinate mapping. */
  getView: () => EditorView | null;
  /** Current selection's active marks (drives the pressed state). */
  formatting: SelectionFormatting;
  /** Same handler the main toolbar uses, so behaviour stays identical. */
  onFormat: (action: FormattingAction) => void;
}

const GAP_PX = 8;
const HEIGHT_PX = 36;
const VIEWPORT_PAD = 8;
const TOOLBAR_BOTTOM_PX = 96; // keep clear of the top chrome

const barStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: HEIGHT_PX,
  padding: '0 4px',
  borderRadius: 8,
  background: 'var(--doc-surface, #ffffff)',
  border: '1px solid var(--doc-border, #e0e0e0)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
};

interface BtnDef {
  /** String-literal subset of FormattingAction (all assignable to it). */
  action: 'bold' | 'italic' | 'underline' | 'strikethrough';
  icon: string;
  active: boolean;
  labelKey: string;
}

export function SelectionFormatToolbar({
  isOpen,
  getView,
  formatting,
  onFormat,
}: SelectionFormatToolbarProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const view = getView();
      if (!view) {
        setAnchor(null);
        return;
      }
      const { from, to, empty } = view.state.selection;
      if (empty) {
        setAnchor(null);
        return;
      }
      let startRect: { top: number; bottom: number; left: number };
      let endRect: { top: number; bottom: number; left: number };
      try {
        startRect = view.coordsAtPos(from);
        endRect = view.coordsAtPos(to);
      } catch {
        setAnchor(null);
        return;
      }
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const barW = barRef.current?.offsetWidth ?? 160;
      // Prefer ABOVE the selection start (Word's placement); fall back below.
      const aboveTop = startRect.top - GAP_PX - HEIGHT_PX;
      const belowTop = endRect.bottom + GAP_PX;
      const fitsAbove = aboveTop >= TOOLBAR_BOTTOM_PX;
      const top = fitsAbove
        ? aboveTop
        : belowTop + HEIGHT_PX <= vh - VIEWPORT_PAD
          ? belowTop
          : TOOLBAR_BOTTOM_PX;
      const left = Math.max(VIEWPORT_PAD, Math.min(startRect.left, vw - barW - VIEWPORT_PAD));
      setAnchor({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, getView, formatting]);

  if (!isOpen || !anchor) return null;

  const buttons: BtnDef[] = [
    {
      action: 'bold',
      icon: 'format_bold',
      active: !!formatting.bold,
      labelKey: 'formattingBar.bold',
    },
    {
      action: 'italic',
      icon: 'format_italic',
      active: !!formatting.italic,
      labelKey: 'formattingBar.italic',
    },
    {
      action: 'underline',
      icon: 'format_underlined',
      active: !!formatting.underline,
      labelKey: 'formattingBar.underline',
    },
    {
      action: 'strikethrough',
      icon: 'strikethrough_s',
      active: !!formatting.strike,
      labelKey: 'formattingBar.strikethrough',
    },
  ];

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t('selectionToolbar.ariaLabel')}
      data-testid="selection-format-toolbar"
      style={{ ...barStyle, top: anchor.top, left: anchor.left }}
      // Never let a click on the bar collapse the editor selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      {buttons.map((b) => (
        <button
          key={b.action}
          type="button"
          aria-label={t(b.labelKey as never)}
          aria-pressed={b.active}
          title={t(b.labelKey as never)}
          data-testid={`selection-format-${b.action}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(b.action)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            color: b.active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-on-surface, #1f2937)',
            background: b.active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
          }}
        >
          <MaterialSymbol name={b.icon} size={18} />
        </button>
      ))}
    </div>
  );
}

export default SelectionFormatToolbar;
