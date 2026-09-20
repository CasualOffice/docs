/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * PresenceCluster — the live co-editing presence unit for the title bar.
 *
 * Groups, as one visual block (CROSS_EDITOR_CONSISTENCY.md §2): the peer
 * avatar stack + a room-status badge + a Share action, separated from the
 * surrounding status pills / account controls by a hairline divider — the
 * Docs / Excel-online convention the sister sheet app shipped.
 *
 * This is a NET-NEW surface, so it's built from the shared
 * `@schnsrw/design-system` UI-kit (AvatarStack / Badge / Button) rather than
 * the editor's hand-rolled chrome — the kit's Avatar already carries the
 * green "active now" ring for live peers. The editor's proven toolbar/icon
 * system is intentionally left as-is.
 *
 * Wire it into the editor via the `renderTitleBarRight` prop, feeding `peers`
 * and `status` from the host's collab transport (e.g. `useCollab`).
 */

import type { CSSProperties, ReactElement } from 'react';
import { AvatarStack, Badge, Button, type BadgeTone } from '@schnsrw/design-system';
import { useTranslation, type TranslationKey } from '../i18n';

export interface PresencePeer {
  /** Display name — also seeds the avatar's deterministic colour + initials. */
  name: string;
  /** Override the deterministic avatar colour (e.g. the peer's cursor colour). */
  color?: string;
  /** Whether the peer is currently live. Defaults to true. */
  active?: boolean;
}

export interface PresenceClusterProps {
  /** Live co-editing peers. Empty → the avatar stack is omitted. */
  peers: PresencePeer[];
  /** Realtime room status → drives the status badge. Omit for non-collab docs. */
  status?: 'connecting' | 'connected' | 'disconnected';
  /** True while an AI request is running for this room → shows an "AI is editing" chip. */
  aiIsEditing?: boolean;
  /**
   * Display name of the peer who triggered the AI request. When set, the chip
   * names them ("<name> is asking AI…"); otherwise it stays generic.
   */
  aiEditingBy?: string | null;
  /** Share action. When provided, renders a Share button after a divider. */
  onShare?: () => void;
  /** Max avatars before the rest collapse into a `+N` chip. Default 4. */
  maxAvatars?: number;
}

const STATUS: Record<
  NonNullable<PresenceClusterProps['status']>,
  { tone: BadgeTone; labelKey: TranslationKey }
> = {
  connected: { tone: 'success', labelKey: 'presence.live' },
  connecting: { tone: 'warning', labelKey: 'presence.connecting' },
  disconnected: { tone: 'neutral', labelKey: 'presence.offline' },
};

const wrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-4, 8px)',
};

const dividerStyle: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  minHeight: 20,
  background: 'var(--color-divider)',
  margin: '0 var(--space-1, 2px)',
};

const aiChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1, 2px)',
  padding: '2px var(--space-2, 4px)',
  borderRadius: 'var(--radius-full, 999px)',
  fontSize: 'var(--text-xs, 12px)',
  color: 'var(--doc-accent, #6b3fd4)',
  background: 'var(--doc-accent-subtle, rgba(107, 63, 212, 0.12))',
  whiteSpace: 'nowrap',
};

export function PresenceCluster({
  peers,
  status,
  onShare,
  maxAvatars = 4,
  aiIsEditing = false,
  aiEditingBy = null,
}: PresenceClusterProps): ReactElement | null {
  const { t } = useTranslation();
  const hasPeers = peers.length > 0;
  if (!hasPeers && !status && !onShare && !aiIsEditing) return null;

  const s = status ? { tone: STATUS[status].tone, label: t(STATUS[status].labelKey) } : null;
  const aiLabel = aiIsEditing
    ? aiEditingBy
      ? t('presence.askingAi', { name: aiEditingBy })
      : t('presence.aiEditing')
    : null;

  return (
    <div style={wrapStyle} data-testid="presence-cluster">
      {aiLabel && (
        <span style={aiChipStyle} data-testid="presence-ai-chip">
          {aiLabel}
        </span>
      )}
      {hasPeers && (
        <AvatarStack
          size={26}
          max={maxAvatars}
          people={peers.map((p) => ({
            name: p.name,
            color: p.color,
            active: p.active ?? true,
          }))}
        />
      )}
      {s && (
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      )}
      {onShare && (
        <>
          <span style={dividerStyle} aria-hidden="true" />
          <Button variant="secondary" size="sm" icon="share" onClick={onShare}>
            {t('presence.share')}
          </Button>
        </>
      )}
    </div>
  );
}

export default PresenceCluster;
