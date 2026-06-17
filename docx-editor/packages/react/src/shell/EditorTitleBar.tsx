import { useState, type CSSProperties } from 'react';
import {
  AvatarStack,
  Button,
  Icon,
  IconButton,
  Kbd,
  Menu,
  Pill,
  type AvatarStackPerson,
  type MenuEntry,
} from '@schnsrw/design-system';

export interface EditorMenuDescriptor {
  label: string;
  items: MenuEntry[];
}

export interface EditorTitleBarProps {
  filename: string;
  saveLabel?: string;
  saveTone?: 'success' | 'warning' | 'neutral';
  starred?: boolean;
  onToggleStar?: () => void;
  breadcrumb?: string;
  onBreadcrumbClick?: () => void;
  menus?: EditorMenuDescriptor[];
  peers?: AvatarStackPerson[];
  /** Right-side label after the avatar stack (e.g. "editing"). */
  peerTag?: string;
  dark?: boolean;
  onToggleTheme?: () => void;
  onShare?: () => void;
  onOpenPalette?: () => void;
  onVersionHistory?: () => void;
  compact?: boolean;
  wide?: boolean;
  style?: CSSProperties;
}

const DEFAULT_MENUS: EditorMenuDescriptor[] = [];

export function EditorTitleBar({
  filename,
  saveLabel = 'Saved',
  saveTone = 'success',
  starred = false,
  onToggleStar,
  breadcrumb,
  onBreadcrumbClick,
  menus = DEFAULT_MENUS,
  peers = [],
  peerTag,
  dark = false,
  onToggleTheme,
  onShare,
  onOpenPalette,
  onVersionHistory,
  compact = false,
  wide = true,
  style,
}: EditorTitleBarProps) {
  if (compact) {
    return (
      <header
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-divider)',
          ...style,
        }}
      >
        <div
          style={{ height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              lineHeight: 1.15,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {filename}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-success)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="cloud_done" size={12} />
              {saveLabel}
            </span>
          </div>
          {onOpenPalette && (
            <IconButton icon="search" label="Search / commands" onClick={onOpenPalette} />
          )}
          {onToggleTheme && (
            <IconButton
              icon={dark ? 'light_mode' : 'dark_mode'}
              label="Toggle theme"
              onClick={onToggleTheme}
            />
          )}
          {onShare && <Button variant="primary" size="sm" icon="group_add" onClick={onShare} />}
        </div>
        {menus.length > 0 && (
          <div
            style={{
              height: 32,
              display: 'flex',
              alignItems: 'center',
              overflowX: 'auto',
              padding: '0 6px',
              borderTop: '1px solid var(--color-divider)',
            }}
          >
            <MenuBar menus={menus} />
          </div>
        )}
      </header>
    );
  }

  return (
    <header
      style={{
        height: 60,
        flex: '0 0 60px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-divider)',
        padding: '0 14px',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 1,
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {wide && breadcrumb && (
            <button
              onClick={onBreadcrumbClick}
              style={{
                border: 0,
                background: 'transparent',
                cursor: onBreadcrumbClick ? 'pointer' : 'default',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-muted)',
                padding: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {breadcrumb}
            </button>
          )}
          {wide && breadcrumb && (
            <Icon
              name="chevron_right"
              size={14}
              style={{ color: 'var(--color-text-disabled)' } as CSSProperties}
            />
          )}
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {filename}
          </span>
          <Icon
            name="expand_more"
            size={16}
            style={{ color: 'var(--color-text-muted)', flex: '0 0 auto' } as CSSProperties}
          />
          {onToggleStar && (
            <IconButton
              icon={starred ? 'star' : 'star_outline'}
              label={starred ? 'Unstar' : 'Star'}
              size="sm"
              onClick={onToggleStar}
              pressed={starred}
            />
          )}
          <Pill tone={saveTone} icon={saveTone === 'warning' ? 'sync_problem' : 'cloud_done'}>
            {saveLabel}
          </Pill>
        </div>
        {menus.length > 0 && (
          <div style={{ marginLeft: -6, overflowX: 'auto', minWidth: 0 }}>
            <MenuBar menus={menus} />
          </div>
        )}
      </div>

      {wide && onOpenPalette && <SearchPill onOpen={onOpenPalette} />}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          flex: '0 0 auto',
        }}
      >
        {!wide && onOpenPalette && (
          <IconButton icon="search" label="Search / commands" onClick={onOpenPalette} />
        )}
        {wide && peers.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <AvatarStack people={peers} size={28} max={3} />
            {peerTag && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {peerTag}
              </span>
            )}
          </span>
        )}
        <span style={{ width: 1, height: 22, background: 'var(--color-divider)' }} />
        {wide && onVersionHistory && (
          <IconButton icon="history" label="Version history" onClick={onVersionHistory} />
        )}
        {onToggleTheme && (
          <IconButton
            icon={dark ? 'light_mode' : 'dark_mode'}
            label="Toggle theme"
            onClick={onToggleTheme}
          />
        )}
        {onShare && (
          <Button variant="primary" icon="group_add" onClick={onShare}>
            Share
          </Button>
        )}
      </div>
    </header>
  );
}

function MenuBar({ menus }: { menus: EditorMenuDescriptor[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
      )}
      {menus.map((m) => (
        <div key={m.label} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(open === m.label ? null : m.label)}
            onMouseEnter={() => {
              if (open) setOpen(m.label);
            }}
            style={{
              height: 24,
              padding: '0 9px',
              border: 0,
              borderRadius: 'var(--radius-md)',
              background: open === m.label ? 'var(--color-hover)' : 'transparent',
              font: 'inherit',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
          {open === m.label && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 60 }}>
              <Menu
                width={250}
                items={m.items.map((entry) => {
                  if ('divider' in entry || 'header' in entry) return entry;
                  return {
                    ...entry,
                    onClick: () => {
                      setOpen(null);
                      entry.onClick?.();
                    },
                  };
                })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SearchPill({ onOpen }: { onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onOpen}
      title="Search or run a command"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: '0 1 320px',
        minWidth: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 34,
        padding: '0 10px 0 14px',
        border: `1px solid ${hover ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
        borderRadius: 'var(--radius-pill)',
        background: hover ? 'var(--color-surface)' : 'var(--color-surface-alt)',
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        font: 'inherit',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-base)',
        transition:
          'border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)',
      }}
    >
      <Icon name="search" size="md" />
      <span
        style={{
          flex: 1,
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        Search or run a command…
      </span>
      <Kbd keys="Ctrl+K" size="sm" />
    </button>
  );
}
