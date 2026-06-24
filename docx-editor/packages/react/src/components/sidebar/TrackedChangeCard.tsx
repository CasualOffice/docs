import type { Comment } from '@eigenpal/docx-core/types/content';
import { MaterialSymbol } from '../ui/Icons';
import { Tooltip } from '../ui/Tooltip';
import type { SidebarItemRenderProps } from '../../plugin-api/types';
import type { TrackedChangeEntry } from './cardUtils';
import { formatDate, getInitials, avatarStyle, ICON_BUTTON_STYLE, truncateText } from './cardUtils';
import { ReplyThread } from './ReplyThread';
import { ReplyInput } from './ReplyInput';
import { CARD_STYLE_COLLAPSED, CARD_STYLE_EXPANDED } from './cardStyles';
import { useTranslation } from '../../i18n';

export interface TrackedChangeCardProps extends SidebarItemRenderProps {
  change: TrackedChangeEntry;
  replies: Comment[];
  onAccept?: (from: number, to: number) => void;
  onReject?: (from: number, to: number) => void;
  onReply?: (revisionId: number, text: string) => void;
}

export function TrackedChangeCard({
  change,
  replies,
  isExpanded,
  onToggleExpand,
  measureRef,
  onAccept,
  onReject,
  onReply,
}: TrackedChangeCardProps) {
  const { t } = useTranslation();
  const authorName = change.author || t('trackedChanges.unknown');

  return (
    <div
      ref={measureRef}
      className="docx-tracked-change-card"
      onClick={() => onToggleExpand()}
      onMouseDown={(e) => e.stopPropagation()}
      style={isExpanded ? CARD_STYLE_EXPANDED : CARD_STYLE_COLLAPSED}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={avatarStyle(authorName)}>{getInitials(authorName)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--doc-text-on-surface, #1f2937)' }}
          >
            {authorName}
          </div>
          {change.date && (
            <div style={{ fontSize: 11, color: 'var(--doc-text-muted)' }}>
              {formatDate(change.date)}
            </div>
          )}
        </div>
        {isExpanded && (
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <Tooltip content={t('common.accept')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept?.(change.from, change.to);
                }}
                aria-label={t('common.accept')}
                style={ICON_BUTTON_STYLE}
              >
                <MaterialSymbol name="check" size={20} />
              </button>
            </Tooltip>
            <Tooltip content={t('common.reject')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject?.(change.from, change.to);
                }}
                aria-label={t('common.reject')}
                style={ICON_BUTTON_STYLE}
              >
                <MaterialSymbol name="close" size={20} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: '20px',
          color: 'var(--doc-text-on-surface, #1f2937)',
          marginTop: 6,
        }}
      >
        {change.type === 'replacement' ? (
          <>
            {t('trackedChanges.replaced')}{' '}
            <span style={{ color: 'var(--doc-error)', fontWeight: 500 }}>
              &quot;{truncateText(change.deletedText || '')}&quot;
            </span>{' '}
            {t('trackedChanges.with')}{' '}
            <span style={{ color: 'var(--doc-success)', fontWeight: 500 }}>
              &quot;{truncateText(change.text)}&quot;
            </span>
          </>
        ) : (
          <>
            {change.type === 'insertion' ? t('trackedChanges.added') : t('trackedChanges.deleted')}{' '}
            <span
              style={{
                color: change.type === 'insertion' ? 'var(--doc-success)' : 'var(--doc-error)',
                fontWeight: 500,
              }}
            >
              &quot;{truncateText(change.text)}&quot;
            </span>
          </>
        )}
      </div>

      <ReplyThread replies={replies} isExpanded={isExpanded} />

      {isExpanded && <ReplyInput onSubmit={(text) => onReply?.(change.revisionId, text)} />}
    </div>
  );
}
