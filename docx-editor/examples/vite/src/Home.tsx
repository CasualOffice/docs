/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CATEGORIES,
  TEMPLATES,
  type TemplateCategory,
  type TemplateEntry,
} from './templates/manifest';
import { deleteRecentFile, formatSize, listRecentFiles, type RecentFile } from '@casualoffice/docs';

/** Track viewport breakpoint. <720 = phone (single-col controls,
 *  2-col card grid, reduced padding, smaller hero). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 720
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 719px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    setMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return mobile;
}

interface HomeProps {
  onNewDocument: () => void;
  onSelectTemplate: (entry: TemplateEntry) => void;
  onOpenFile: (file: File) => void;
}

type CategoryFilter = 'All' | TemplateCategory;

const isCreationTemplate = (template: TemplateEntry) =>
  template.id === 'blank' || template.id === 'blank-markdown';

// Theme-aware — these resolve through the editor's design tokens (loaded
// globally via styles.css -> editor.css -> tokens.css), which flip on
// [data-theme='dark'] the same way the editor's own dark mode does. The
// literal hex after each comma is the light-mode fallback (byte-identical
// to the pre-dark-mode palette) in case the tokens aren't present.
const COLORS = {
  ink: 'var(--color-text, #0b0e15)',
  inkMuted: 'var(--color-text-secondary, #3b4354)',
  inkSubtle: 'var(--color-text-muted, #8b93a3)',
  // Fixed near-black — the "Open file" button and the active category pill
  // are solid dark chips with white text in BOTH themes. They must not
  // track body-text color, which flips to near-white in dark mode and would
  // make these chips illegible.
  inkSolid: '#0b0e15',
  // Real document previews (template cards, the blank-card icon tile) stay
  // literal white "paper" in both themes — matching how the editor's own
  // page canvas stays light even in dark mode.
  paper: '#ffffff',
  // An elevated UI-control surface (search box, filter pills, recent-file
  // rows, the auto-reopen banner) — white in light mode (unchanged), a
  // raised dark panel in dark mode.
  surfaceRaised: 'var(--color-surface-raised, #ffffff)',
  surface: 'var(--color-surface-strip, #f6f8fc)',
  surface2: 'var(--color-surface-alt, #eef2f8)',
  border: 'var(--color-divider, #e3e8f1)',
  borderHover: 'var(--color-border-strong, #9aa1b0)',
  brand: 'var(--color-accent, #2f56ff)',
  brandHover: 'var(--color-accent-hover, #2647d6)',
  brandSoft: 'var(--color-accent-soft, #e9edff)',
  // Fixed brand blue — keeps >=4.5:1 contrast with white text in both
  // themes. Used for the one "Reopen" CTA chip; the theme accent itself
  // lightens in dark mode and would fail contrast with white text there.
  ctaSolid: '#1d4ed8',
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1100px 700px at 8% -10%, rgba(110,139,255,0.35) 0%, transparent 55%),' +
      'radial-gradient(900px 500px at 100% 0%, rgba(167,139,250,0.28) 0%, transparent 50%),' +
      `linear-gradient(180deg, ${COLORS.surface} 0%, ${COLORS.surface2} 100%)`,
    boxSizing: 'border-box',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: COLORS.ink,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 40px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  brandLogo: { width: '32px', height: '32px' },
  brandName: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: COLORS.ink,
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: COLORS.inkMuted,
  },
  topLink: {
    color: COLORS.inkMuted,
    textDecoration: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    transition: 'background 0.15s, color 0.15s',
  },

  hero: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '32px 40px 12px',
  },
  heroEyebrow: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 600,
    color: COLORS.brand,
    background: COLORS.brandSoft,
    padding: '4px 10px',
    borderRadius: '999px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: '14px',
  },
  heroTitle: {
    fontSize: '40px',
    fontWeight: 700,
    letterSpacing: '-0.025em',
    lineHeight: 1.1,
    color: COLORS.ink,
    margin: 0,
  },
  heroLede: {
    marginTop: '12px',
    fontSize: '17px',
    color: COLORS.inkMuted,
    lineHeight: 1.5,
    maxWidth: '640px',
  },

  controls: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '24px 40px 8px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: COLORS.surfaceRaised,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '10px',
    padding: '8px 12px',
    minWidth: '260px',
    flex: '1 1 320px',
    maxWidth: '480px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '14px',
    color: COLORS.ink,
    width: '100%',
    font: 'inherit',
  },
  openFileBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: COLORS.inkSolid,
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    font: 'inherit',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginLeft: 'auto',
  },
  pill: {
    fontSize: '13px',
    fontWeight: 500,
    color: COLORS.inkMuted,
    background: COLORS.surfaceRaised,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '999px',
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    font: 'inherit',
  },
  pillActive: {
    background: COLORS.inkSolid,
    color: '#ffffff',
    borderColor: COLORS.inkSolid,
  },

  section: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '24px 40px 8px',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    margin: '16px 0 14px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: COLORS.ink,
    letterSpacing: '-0.005em',
    textTransform: 'none',
  },
  sectionHint: {
    fontSize: '12.5px',
    color: COLORS.inkSubtle,
  },

  featuredRow: {
    display: 'grid',
    // Fixed 4-up on desktop (mobile override drops to 2) so the capped-at-4
    // Featured set always fills one clean row — an auto-fit track count would
    // strand a lone card at intermediate widths.
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '18px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))',
    gap: '18px',
  },

  card: {
    background: COLORS.paper,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    padding: 0,
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition:
      'border-color 0.18s, box-shadow 0.18s, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
    position: 'relative',
  },
  cardHover: {
    borderColor: '#cbd5e1',
    boxShadow: '0 14px 28px -16px rgba(15, 23, 42, 0.18), 0 4px 8px -2px rgba(15, 23, 42, 0.06)',
    transform: 'translateY(-3px)',
  },
  cardThumbWrap: {
    aspectRatio: '11 / 14',
    background: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
    overflow: 'hidden',
    position: 'relative',
  },
  cardThumb: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    objectPosition: 'top center',
    transition: 'transform 0.3s ease',
  },
  cardThumbHover: {
    transform: 'scale(1.025)',
  },
  // Blank templates have no photographic render — a landscape SVG cover-cropped
  // into the portrait frame just showed flat grey and read as a broken image.
  // Render a real empty-state instead: the entry's own glyph in a dashed tile.
  cardThumbEmpty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(180deg, ${COLORS.surface} 0%, ${COLORS.surface2} 100%)`,
  },
  cardThumbEmptyIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 16,
    background: COLORS.paper,
    border: `1px dashed ${COLORS.borderHover}`,
    // Fixed — this tile is always a light "paper" swatch (see COLORS.paper),
    // so its icon must stay fixed-dark too, not track the page theme.
    color: '#3b4354',
  },
  cardIconBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.96)',
    border: `1px solid ${COLORS.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Fixed — this badge sits on a near-white translucent chip regardless
    // of page theme, so its icon must stay fixed-dark too.
    color: '#3b4354',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
  },
  cardBody: {
    padding: '12px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  cardTitle: {
    fontSize: '13.5px',
    fontWeight: 600,
    // Fixed — the card itself is always literal white "paper" (see
    // COLORS.paper), so the title must stay fixed-dark too, not track the
    // page theme (which would flip this to near-white-on-white).
    color: '#0b0e15',
    letterSpacing: '-0.005em',
  },
  cardCategory: {
    fontSize: '11.5px',
    // #94a3b8 (inkSubtle) on white is only 2.56:1 — fails WCAG AA for this
    // small label. #64748b (slate-500) is 4.86:1 and reads as the same quiet
    // grey while passing AA.
    color: '#64748b',
    fontWeight: 500,
  },

  empty: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '36px 40px',
    textAlign: 'center',
    color: COLORS.inkMuted,
    fontSize: '14px',
  },

  footer: {
    maxWidth: '1180px',
    margin: '32px auto 0',
    padding: '24px 40px 32px',
    fontSize: '12px',
    color: COLORS.inkSubtle,
    borderTop: `1px solid ${COLORS.border}`,
    display: 'flex',
    justifyContent: 'space-between',
  },

  hiddenInput: { display: 'none' },
};

/** Per-element overrides applied when `useIsMobile()` returns true.
 *  Keeps the desktop layout untouched and stacks/scales for phones. */
const mobile: Record<string, CSSProperties> = {
  topBar: { padding: '14px 16px' },
  hero: { padding: '24px 16px 8px' },
  heroTitle: { fontSize: '30px', letterSpacing: '-0.02em' },
  heroLede: { fontSize: '15px', marginTop: '10px' },
  controls: {
    padding: '20px 16px 4px',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '10px',
  },
  searchWrap: { minWidth: 0, flex: '1 1 auto', maxWidth: 'none' },
  openFileBtn: { justifyContent: 'center' },
  pillRow: { marginLeft: 0, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '4px' },
  pill: { whiteSpace: 'nowrap', flex: '0 0 auto' },
  inner: { padding: '12px 16px 40px' },
  section: { padding: '12px 16px 4px' },
  sectionHead: { margin: '12px 0 10px' },
  featuredRow: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  grid: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  cardThumbWrap: { aspectRatio: '4 / 5' },
  cardBody: { padding: '10px 12px 12px' },
  cardTitle: { fontSize: '12.5px' },
  cardCategory: { fontSize: '10.5px' },
  cardIconBadge: { width: '24px', height: '24px', top: '6px', right: '6px' },
  footer: {
    padding: '20px 16px 24px',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'center',
    alignItems: 'center',
  },
};

/** Blank templates ship an SVG placeholder rather than a photographic PNG
 *  render. They paint as a dashed empty-state card, so we keep them out of
 *  the Featured strip and sort them after the rich previews in each category. */
function isBlankEntry(entry: TemplateEntry): boolean {
  return entry.thumbnail.endsWith('.svg');
}

function TemplateCard({
  entry,
  onSelect,
  isMobile,
}: {
  entry: TemplateEntry;
  onSelect: (entry: TemplateEntry) => void;
  isMobile: boolean;
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  // Blank entries ship an SVG placeholder rather than a PNG render; give them
  // a clean empty-state instead of an image that crops to grey.
  const isBlank = isBlankEntry(entry);
  return (
    <button
      type="button"
      style={{ ...styles.card, ...(hovered ? styles.cardHover : null) }}
      onClick={() => onSelect(entry)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      data-testid={`template-card-${entry.id}`}
      aria-label={`${entry.name} — ${entry.category}`}
    >
      <div style={{ ...styles.cardThumbWrap, ...(isMobile && mobile.cardThumbWrap) }}>
        {isBlank ? (
          <div style={styles.cardThumbEmpty}>
            <span style={styles.cardThumbEmptyIcon} aria-hidden="true">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: isMobile ? 28 : 34 }}
              >
                {entry.icon}
              </span>
            </span>
          </div>
        ) : (
          <>
            <img
              src={entry.thumbnail}
              alt=""
              aria-hidden="true"
              draggable={false}
              loading="lazy"
              style={{ ...styles.cardThumb, ...(hovered ? styles.cardThumbHover : null) }}
            />
            <span
              style={{ ...styles.cardIconBadge, ...(isMobile && mobile.cardIconBadge) }}
              aria-hidden="true"
            >
              <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 14 : 16 }}>
                {entry.icon}
              </span>
            </span>
          </>
        )}
      </div>
      <div style={{ ...styles.cardBody, ...(isMobile && mobile.cardBody) }}>
        <div style={{ ...styles.cardTitle, ...(isMobile && mobile.cardTitle) }}>{entry.name}</div>
        <div style={{ ...styles.cardCategory, ...(isMobile && mobile.cardCategory) }}>
          {entry.category}
        </div>
      </div>
    </button>
  );
}

function relativeAgo(ms: number): string {
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Auto-reopen banner — Phase A from docs/internal/11-storage-modes.md.
// Shows above the landing when the most recently-opened doc is < 7
// days old, offering to reopen it in one click. Dismissal is sticky
// for the rest of the browser session so a user who actively
// dismissed it doesn't see it on every navigation back to Home.
const AUTO_REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_REOPEN_DISMISS_KEY = 'home.auto-reopen-dismissed';

function isAutoReopenDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(AUTO_REOPEN_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markAutoReopenDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTO_REOPEN_DISMISS_KEY, '1');
  } catch {
    // sessionStorage can throw in sandboxed iframes. Best-effort.
  }
}

interface AutoReopenBannerProps {
  /** Most-recently-opened doc; null hides the banner. */
  candidate: RecentFile | null;
  onOpen: (r: RecentFile) => void;
  /** Dismiss action — also persists to sessionStorage. */
  onDismiss: () => void;
}

function AutoReopenBanner({
  candidate,
  onOpen,
  onDismiss,
}: AutoReopenBannerProps): React.JSX.Element | null {
  if (!candidate) return null;
  const age = Date.now() - candidate.openedAt;
  if (age > AUTO_REOPEN_WINDOW_MS) return null;
  return (
    <section
      data-testid="auto-reopen-banner"
      style={autoReopenBannerStyle}
      role="region"
      aria-label="Reopen last document"
    >
      <span style={{ fontSize: 13, color: COLORS.inkMuted }}>Pick up where you left off</span>
      <strong
        data-testid="auto-reopen-banner-name"
        style={{ fontSize: 14, color: COLORS.ink, marginRight: 'auto' }}
      >
        {candidate.name}
      </strong>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="auto-reopen-banner-dismiss"
        style={autoReopenBannerDismissStyle}
      >
        Dismiss
      </button>
      <button
        type="button"
        onClick={() => onOpen(candidate)}
        data-testid="auto-reopen-banner-open"
        style={autoReopenBannerOpenStyle}
      >
        Reopen
      </button>
    </section>
  );
}

const autoReopenBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '10px 16px',
  margin: '12px 24px 0',
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surfaceRaised,
  boxShadow: '0 1px 1px rgba(15, 23, 42, 0.03)',
};

const autoReopenBannerOpenStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid transparent',
  background: COLORS.ctaSolid,
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const autoReopenBannerDismissStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: 'transparent',
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// Compact horizontal card used in the Recent strip. The big-thumbnail
// template-card look would push the actual templates below the fold
// (the user has nothing to render as a preview — Recent files are
// not pre-painted to PNG the way bundled templates are). Microsoft
// Word's Home uses this same shape for its Recent / Pinned list.
const recentCardStyle: CSSProperties = {
  background: COLORS.surfaceRaised,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '10px',
  padding: '10px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  transition:
    'border-color 0.18s, box-shadow 0.18s, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  minWidth: 0, // allow text truncation
};

const recentCardHoverStyle: CSSProperties = {
  borderColor: '#cbd5e1',
  boxShadow: '0 8px 18px -12px rgba(15, 23, 42, 0.16), 0 2px 4px -1px rgba(15, 23, 42, 0.05)',
  transform: 'translateY(-1px)',
};

const recentIconBoxStyle: CSSProperties = {
  width: '40px',
  height: '40px',
  flexShrink: 0,
  borderRadius: '8px',
  background: COLORS.brandSoft,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: COLORS.brand,
};

const recentMetaStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  flex: 1,
};

const recentNameStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: COLORS.ink,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const recentSubStyle: CSSProperties = {
  fontSize: '11.5px',
  color: COLORS.inkSubtle,
  fontWeight: 500,
};

function RecentCard({
  entry,
  onOpen,
  onDelete,
}: {
  entry: RecentFile;
  onOpen: (r: RecentFile) => void;
  onDelete: (r: RecentFile) => void;
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <button
        type="button"
        style={{ ...recentCardStyle, ...(hovered ? recentCardHoverStyle : null), width: '100%' }}
        onClick={() => onOpen(entry)}
        data-testid={`recent-card-${entry.id}`}
        aria-label={`Reopen ${entry.name}`}
      >
        <div style={recentIconBoxStyle}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>
            description
          </span>
        </div>
        <div style={recentMetaStyle}>
          <div style={recentNameStyle} title={entry.name}>
            {entry.name}
          </div>
          <div style={recentSubStyle}>
            {formatSize(entry.size)} · {relativeAgo(Date.now() - entry.openedAt)}
          </div>
        </div>
      </button>
      {hovered && (
        <button
          type="button"
          title="Remove from recents"
          aria-label={`Remove ${entry.name} from recents`}
          data-testid={`recent-card-delete-${entry.id}`}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(15,23,42,0.08)',
            color: COLORS.inkSubtle,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            lineHeight: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry);
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>
            close
          </span>
        </button>
      )}
    </div>
  );
}

export function Home({ onNewDocument, onSelectTemplate, onOpenFile }: HomeProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');
  const isMobile = useIsMobile();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onOpenFile(file);
    e.target.value = '';
  };

  // Recent files (sheet parity) — IDB-backed; cards re-open via a
  // synthesized File so the existing onOpenFile path doesn't need to
  // care that the buffer didn't come from `<input type="file">`.
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [autoReopenDismissed, setAutoReopenDismissed] = useState<boolean>(() =>
    isAutoReopenDismissed()
  );
  useEffect(() => {
    let cancelled = false;
    void listRecentFiles().then((rows) => {
      if (!cancelled) setRecents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const openRecent = (r: RecentFile) => {
    // Preserve the original extension — handleOpenFromHome routes .md/.txt/.rtf
    // via formatFromFilename(file.name). Appending .docx would break that check.
    const hasExt = /\.[a-z0-9]+$/i.test(r.name);
    const fileName = hasExt ? r.name : `${r.name}.docx`;
    const file = new File([r.buffer], fileName, { type: 'application/octet-stream' });
    onOpenFile(file);
  };
  const autoReopenCandidate = autoReopenDismissed ? null : (recents[0] ?? null);

  const handleDeleteRecent = (r: RecentFile) => {
    setRecents((prev) => prev.filter((x) => x.id !== r.id));
    void deleteRecentFile(r.id);
  };

  const handleClearAllRecents = () => {
    const ids = recents.map((r) => r.id);
    setRecents([]);
    void Promise.all(ids.map((id) => deleteRecentFile(id)));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (isCreationTemplate(t)) return false;
      if (category !== 'All' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  // Featured showcases the rich photographic templates only — blank cards paint
  // as sparse dashed tiles and would strand next to the real previews. Cap at 4
  // so the auto-fit grid fills one clean row instead of a lopsided 4 + 1.
  const featured = useMemo(
    () => TEMPLATES.filter((t) => t.featured && !isBlankEntry(t)).slice(0, 4),
    []
  );
  const blankDocument = TEMPLATES.find((t) => t.id === 'blank');
  const blankMarkdown = TEMPLATES.find((t) => t.id === 'blank-markdown');

  const byCategory = useMemo(() => {
    const m = new Map<TemplateCategory, TemplateEntry[]>();
    for (const c of CATEGORIES) m.set(c, []);
    for (const t of TEMPLATES) {
      if (!isCreationTemplate(t)) m.get(t.category)?.push(t);
    }
    // Sort the blank cards to the end of each category so the rich previews
    // lead and the sparse tiles group together instead of holing the grid.
    for (const list of m.values()) {
      list.sort((a, b) => Number(isBlankEntry(a)) - Number(isBlankEntry(b)));
    }
    return m;
  }, []);

  const isFiltered = query.trim() !== '' || category !== 'All';

  return (
    <div style={styles.page} data-testid="home-page">
      <header style={{ ...styles.topBar, ...(isMobile && mobile.topBar) }}>
        <div style={styles.brandRow}>
          <img src="/logo.svg" alt="" style={styles.brandLogo} aria-hidden="true" />
          <div style={styles.brandName}>
            Casual <span style={{ color: COLORS.brand }}>Editor</span>
          </div>
        </div>
        <div style={styles.topRight}>
          <a
            href="https://github.com/schnsrw/docx"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.topLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = COLORS.ink;
              e.currentTarget.style.background = COLORS.surface2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = COLORS.inkMuted;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            GitHub
          </a>
        </div>
      </header>

      <AutoReopenBanner
        candidate={autoReopenCandidate}
        onOpen={openRecent}
        onDismiss={() => {
          markAutoReopenDismissed();
          setAutoReopenDismissed(true);
        }}
      />

      <section style={{ ...styles.hero, ...(isMobile && mobile.hero) }}>
        <div style={styles.heroEyebrow}>Casual Editor</div>
        <h1 style={{ ...styles.heroTitle, ...(isMobile && mobile.heroTitle) }}>
          Start something today.
        </h1>
        <p style={{ ...styles.heroLede, ...(isMobile && mobile.heroLede) }}>
          A real-time collaborative <code>.docx</code> editor that runs in the browser. Pick a
          template designed for the way you actually work — or open a file from your computer.
        </p>
      </section>

      {blankDocument && blankMarkdown && (
        <section style={{ ...styles.section, ...(isMobile && mobile.section) }} aria-label="Create new">
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>Create new</h2>
          </div>
          <div style={{ ...styles.featuredRow, ...(isMobile && mobile.featuredRow) }}>
            <TemplateCard
              entry={blankDocument}
              onSelect={onNewDocument}
              isMobile={isMobile}
            />
            <TemplateCard entry={blankMarkdown} onSelect={onSelectTemplate} isMobile={isMobile} />
          </div>
        </section>
      )}

      <section style={{ ...styles.controls, ...(isMobile && mobile.controls) }}>
        <label style={{ ...styles.searchWrap, ...(isMobile && mobile.searchWrap) }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: COLORS.inkSubtle }}
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="search"
            placeholder="Search templates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.searchInput}
            data-testid="home-search"
          />
        </label>
        <button
          type="button"
          style={{ ...styles.openFileBtn, ...(isMobile && mobile.openFileBtn) }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.brandHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.inkSolid)}
          data-testid="home-open-from-disk"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden="true">
            folder_open
          </span>
          Open file
        </button>
        <div
          style={{ ...styles.pillRow, ...(isMobile && mobile.pillRow) }}
          role="group"
          aria-label="Filter by category"
        >
          {(['All', ...CATEGORIES] as CategoryFilter[]).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                style={{
                  ...styles.pill,
                  ...(isMobile && mobile.pill),
                  ...(active ? styles.pillActive : null),
                }}
                onClick={() => setCategory(c)}
                data-testid={`home-category-${c.toLowerCase()}`}
                aria-pressed={active}
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      {!isFiltered && recents.length > 0 && (
        <section
          style={{ ...styles.section, ...(isMobile && mobile.section) }}
          data-testid="home-recent"
        >
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>Recent</h2>
            <span style={styles.sectionHint}>Pick up where you left off.</span>
            <button
              type="button"
              onClick={handleClearAllRecents}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                fontSize: '12px',
                color: COLORS.inkSubtle,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
              data-testid="home-clear-recents"
            >
              Clear all
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? 'repeat(1, minmax(0, 1fr))'
                : 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            {recents.slice(0, 4).map((r) => (
              <RecentCard key={r.id} entry={r} onOpen={openRecent} onDelete={handleDeleteRecent} />
            ))}
          </div>
        </section>
      )}

      {!isFiltered && (
        <section style={{ ...styles.section, ...(isMobile && mobile.section) }}>
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>Featured</h2>
            <span style={styles.sectionHint}>A few picks to get going.</span>
          </div>
          <div style={{ ...styles.featuredRow, ...(isMobile && mobile.featuredRow) }}>
            {featured.map((t) => (
              <TemplateCard key={t.id} entry={t} onSelect={onSelectTemplate} isMobile={isMobile} />
            ))}
          </div>
        </section>
      )}

      {isFiltered ? (
        <section style={{ ...styles.section, ...(isMobile && mobile.section) }}>
          <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
            <h2 style={styles.sectionTitle}>
              {query.trim() ? `Results for “${query.trim()}”` : category}
            </h2>
            <span style={styles.sectionHint}>
              {filtered.length} template{filtered.length === 1 ? '' : 's'}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div style={styles.empty}>No templates match. Try a different keyword.</div>
          ) : (
            <div style={{ ...styles.grid, ...(isMobile && mobile.grid) }}>
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  entry={t}
                  onSelect={onSelectTemplate}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        CATEGORIES.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat} style={{ ...styles.section, ...(isMobile && mobile.section) }}>
              <div style={{ ...styles.sectionHead, ...(isMobile && mobile.sectionHead) }}>
                <h2 style={styles.sectionTitle}>{cat}</h2>
                <span style={styles.sectionHint}>
                  {items.length} template{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ ...styles.grid, ...(isMobile && mobile.grid) }}>
                {items.map((t) => (
                  <TemplateCard
                    key={t.id}
                    entry={t}
                    onSelect={onSelectTemplate}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.odt,.md,.markdown,.txt,.yml,.yaml,.toml,.conf,.cfg,.ini,.env,.properties"
        style={styles.hiddenInput}
        onChange={handleFileChange}
        data-testid="home-file-input"
      />

      <section
        style={{
          maxWidth: '1180px',
          margin: '24px auto 0',
          padding: isMobile ? '0 16px' : '0 40px',
        }}
        aria-label="AI features pre-release"
      >
        <div
          style={{
            background: '#e9edff',
            border: `1px solid #bfdbfe`,
            borderRadius: '10px',
            padding: isMobile ? '10px 14px' : '10px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 12px',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#1d4ed8',
              background: '#dbeafe',
              border: `1px solid #93c5fd`,
              padding: '2px 8px',
              borderRadius: '999px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            Pre-release
          </span>
          <span style={{ fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
            <strong style={{ color: '#0f172a' }}>AI features are on the way</strong> — inline ask,
            rewrite panel, and a DocOps chat panel. On-device in the desktop app, or the Anthropic
            API on the web.
          </span>
          <a
            href="https://github.com/CasualOffice/docs#ai-features-pre-release"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: 'auto',
              fontSize: '13px',
              fontWeight: 600,
              color: '#1d4ed8',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            Learn more
          </a>
        </div>
      </section>

      <footer style={{ ...styles.footer, ...(isMobile && mobile.footer) }}>
        <span>MIT fork of eigenpal/docx-editor · Node collab server (Hocuspocus + Yjs)</span>
        <a
          href="https://github.com/schnsrw/docx"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: COLORS.inkMuted, textDecoration: 'none' }}
        >
          schnsrw/docx
        </a>
      </footer>
    </div>
  );
}
