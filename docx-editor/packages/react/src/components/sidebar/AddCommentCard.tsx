import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import { submitButtonStyle, CANCEL_BUTTON_STYLE } from './cardUtils';
import { useTranslation } from '../../i18n';

export interface AddCommentCardProps extends SidebarItemRenderProps {
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  /**
   * Names eligible for @-mention autocomplete. Typically computed
   * by the parent from `comments.map(c => c.author)` + the current
   * author. Empty list disables the mention UI entirely so a single-
   * user doc doesn't surface useless suggestions.
   */
  knownAuthors?: readonly string[];
}

interface MentionContext {
  /** Index of the @ that anchors the active mention. */
  atIndex: number;
  /** Query characters after the @ (lowercased) used to filter. */
  query: string;
}

/**
 * Scan `text` for the active mention starting at the cursor: returns
 * the `@` index + query if the cursor sits inside an unbroken
 * word-run that began with `@`. Returns null otherwise.
 */
function findActiveMention(text: string, cursor: number): MentionContext | null {
  // Walk backwards from cursor-1 looking for @. Stop at whitespace or
  // text start without finding one → no mention.
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text.charAt(i);
    if (ch === '@') {
      // Email guard: if the @ is preceded by an alphanumeric (e.g.
      // `user@host`), don't treat it as a mention trigger.
      const prev = i > 0 ? text.charAt(i - 1) : '';
      if (prev && /[A-Za-z0-9]/.test(prev)) return null;
      return { atIndex: i, query: text.slice(i + 1, cursor).toLowerCase() };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

const dropdownStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  // Float above the action buttons; appears just below the textarea.
  zIndex: 1000,
  background: 'var(--doc-surface, white)',
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(60,64,67,0.2)',
  padding: '4px 0',
  maxHeight: 180,
  overflowY: 'auto',
};

const dropdownItemStyle = (active: boolean): CSSProperties => ({
  padding: '6px 10px',
  fontSize: 13,
  cursor: 'pointer',
  background: active ? 'var(--doc-primary-light, #e8f0fe)' : 'transparent',
  color: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-text-on-surface, #1f2937)',
});

export function AddCommentCard({
  measureRef,
  onSubmit,
  onCancel,
  knownAuthors = [],
}: AddCommentCardProps) {
  const [text, setText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [activeMentionIdx, setActiveMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { t } = useTranslation();

  const mention = useMemo(() => findActiveMention(text, cursorPos), [text, cursorPos]);
  const suggestions = useMemo(() => {
    if (!mention) return [] as string[];
    const q = mention.query;
    return (
      knownAuthors
        .filter((name) => name && name.toLowerCase().includes(q))
        // Names that start with the query rank above names that just contain it.
        .sort((a, b) => {
          const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
          const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
          return ap - bp;
        })
        .slice(0, 8)
    );
  }, [mention, knownAuthors]);

  // Reset the highlighted suggestion whenever the candidate list flips.
  // useMemo would also work; useState + assignment keeps the active
  // index responsive to keyboard nav between renders.
  if (activeMentionIdx >= suggestions.length && suggestions.length > 0) {
    // Clamp without a re-render — next render will see the corrected
    // value; before that, key handlers below already guard for length.
    queueMicrotask(() => setActiveMentionIdx(0));
  }

  const insertMention = (name: string): void => {
    if (!mention) return;
    const before = text.slice(0, mention.atIndex);
    const after = text.slice(cursorPos);
    const inserted = `@${name} `;
    const next = before + inserted + after;
    setText(next);
    // Move cursor to right after the inserted "@Name ".
    const nextCursor = before.length + inserted.length;
    setCursorPos(nextCursor);
    setActiveMentionIdx(0);
    // After React commits the state, restore caret in the textarea.
    queueMicrotask(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.setSelectionRange(nextCursor, nextCursor);
        ta.focus();
      }
    });
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit?.(text.trim());
      setText('');
      setCursorPos(0);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    e.stopPropagation();

    // When the mention dropdown is open, arrow keys + Enter steer it.
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveMentionIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveMentionIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const pick = suggestions[Math.min(activeMentionIdx, suggestions.length - 1)];
        if (pick) insertMention(pick);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Close the dropdown without submitting; move cursor past the
        // @ so findActiveMention returns null next render.
        setActiveMentionIdx(0);
        // Insert a zero-width step: blur and re-focus to drop the
        // mention context without disturbing the typed text.
        const ta = textareaRef.current;
        if (ta) ta.focus();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Escape') {
      onCancel?.();
      setText('');
    }
  };

  return (
    <div
      ref={measureRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'var(--doc-surface, white)',
        boxShadow: '0 1px 3px rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)',
        zIndex: 50,
        position: 'relative',
      }}
    >
      <textarea
        ref={(el) => {
          textareaRef.current = el;
          el?.focus({ preventScroll: true });
        }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCursorPos(e.target.selectionStart ?? e.target.value.length);
        }}
        onSelect={(e) => {
          const ta = e.target as HTMLTextAreaElement;
          setCursorPos(ta.selectionStart ?? text.length);
        }}
        onClick={(e) => {
          const ta = e.target as HTMLTextAreaElement;
          setCursorPos(ta.selectionStart ?? text.length);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          const ta = e.target as HTMLTextAreaElement;
          setCursorPos(ta.selectionStart ?? text.length);
        }}
        placeholder={t('comments.addComment')}
        style={{
          width: '100%',
          border: '1px solid var(--doc-primary, #1a73e8)',
          borderRadius: 20,
          outline: 'none',
          resize: 'none',
          fontSize: 14,
          lineHeight: '20px',
          padding: '8px 16px',
          fontFamily: 'inherit',
          minHeight: 40,
          boxSizing: 'border-box',
          color: 'var(--doc-text-on-surface, #1f2937)',
        }}
      />
      {mention && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={t('comments.mentionSuggestions')}
          style={dropdownStyle}
          onMouseDown={(e) => e.preventDefault()}
          data-testid="mention-suggestions"
        >
          {suggestions.map((name, idx) => (
            <div
              key={name}
              role="option"
              aria-selected={idx === activeMentionIdx}
              onMouseEnter={() => setActiveMentionIdx(idx)}
              onClick={() => insertMention(name)}
              style={dropdownItemStyle(idx === activeMentionIdx)}
              data-testid={`mention-option-${name}`}
            >
              {name}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => {
            onCancel?.();
            setText('');
          }}
          style={CANCEL_BUTTON_STYLE}
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          style={submitButtonStyle(!!text.trim())}
        >
          {t('common.comment')}
        </button>
      </div>
    </div>
  );
}
