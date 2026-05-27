import { useEffect, useRef, useState } from 'react';
import type { Comment } from '@eigenpal/docx-core/types/content';
import { MaterialSymbol } from '../ui/Icons';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import {
  getCommentText,
  formatDate,
  getInitials,
  avatarStyle,
  ICON_BUTTON_STYLE,
} from './cardUtils';
import { ReplyThread } from './ReplyThread';
import { ReplyInput } from './ReplyInput';
import { CARD_STYLE_COLLAPSED, CARD_STYLE_EXPANDED } from './cardStyles';
import { useTranslation } from '../../i18n';

export interface CommentCardProps extends SidebarItemRenderProps {
  comment: Comment;
  replies: Comment[];
  onReply?: (commentId: number, text: string) => void;
  onResolve?: (commentId: number) => void;
  onUnresolve?: (commentId: number) => void;
  onDelete?: (commentId: number) => void;
}

export function CommentCard({
  comment,
  replies,
  isExpanded,
  onToggleExpand,
  measureRef,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
}: CommentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Close the menu on Escape + auto-focus the first menu item on open
  // so keyboard users can act without reaching for the mouse. Also
  // click-outside-to-close so opening the menu doesn't trap focus.
  useEffect(() => {
    if (!menuOpen) return;
    // Auto-focus first menu item when the popup mounts.
    const first = menuRef.current?.querySelector('button');
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenuOpen(false);
        // Return focus to the trigger — standard menu pattern.
        menuTriggerRef.current?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuTriggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [menuOpen]);
  const { t } = useTranslation();

  return (
    <div
      ref={measureRef}
      data-comment-id={comment.id}
      className="docx-comment-card"
      onClick={onToggleExpand}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...(isExpanded ? CARD_STYLE_EXPANDED : CARD_STYLE_COLLAPSED),
      }}
    >
      {comment.done && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--doc-success)',
            backgroundColor: 'var(--doc-success-bg)',
            borderRadius: 10,
          }}
        >
          <MaterialSymbol name="check" size={12} />
          {t('comments.resolved')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={avatarStyle(comment.author || 'U')}>{getInitials(comment.author || 'U')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--doc-text-on-surface, #1f2937)' }}
          >
            {comment.author || t('comments.unknown')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--doc-text-muted)' }}>
            {formatDate(comment.date)}
          </div>
        </div>
        {isExpanded && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2, position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (comment.done) {
                  onUnresolve?.(comment.id);
                } else {
                  onResolve?.(comment.id);
                }
              }}
              title={comment.done ? t('comments.reopen') : t('comments.resolve')}
              aria-label={comment.done ? t('comments.reopen') : t('comments.resolve')}
              style={ICON_BUTTON_STYLE}
            >
              <MaterialSymbol name={comment.done ? 'undo' : 'check'} size={20} />
            </button>
            <button
              ref={menuTriggerRef}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title={t('comments.moreOptions')}
              aria-label={t('comments.moreOptions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={ICON_BUTTON_STYLE}
            >
              <MaterialSymbol name="more_vert" size={20} />
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                role="menu"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: 'var(--doc-surface, white)',
                  borderRadius: 8,
                  boxShadow: '0 2px 6px rgba(60,64,67,0.3), 0 1px 2px rgba(60,64,67,0.15)',
                  zIndex: 100,
                  minWidth: 120,
                  padding: '4px 0',
                }}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.(comment.id);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    fontSize: 14,
                    color: 'var(--doc-text-on-surface, #1f2937)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseOver={(e) => {
                    (e.target as HTMLElement).style.backgroundColor =
                      'var(--doc-bg-hover, #f1f3f4)';
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = 'transparent';
                  }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 13,
          color: 'var(--doc-text-on-surface, #1f2937)',
          lineHeight: '20px',
          marginTop: 6,
        }}
      >
        {getCommentText(comment.content)}
      </div>

      <ReplyThread replies={replies} isExpanded={isExpanded} />

      {isExpanded && !comment.done && (
        <ReplyInput onSubmit={(text) => onReply?.(comment.id, text)} />
      )}
    </div>
  );
}
