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
  onSelectTemplate: (entry: TemplateEntry) => void;
  onOpenFile: (file: File) => void;
}

type CategoryFilter = 'All' | TemplateCategory;

const COLORS = {
  ink: '#0f172a',
  inkMuted: '#475569',
  inkSubtle: '#94a3b8',
  paper: '#ffffff',
  surface: '#f8fafc',
  surface2: '#f1f5f9',
  border: '#e2e8f0',
  borderHover: '#94a3b8',
  brand: '#2563eb',
  brandHover: '#1d4ed8',
  brandSoft: '#eff6ff',
};

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(1100px 700px at 8% -10%, #dbeafe 0%, transparent 55%),' +
      'radial-gradient(900px 500px at 100% 0%, #f3e8ff 0%, transparent 50%),' +
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
    background: COLORS.paper,
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
    background: COLORS.ink,
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
    background: COLORS.paper,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '999px',
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    font: 'inherit',
  },
  pillActive: {
    background: COLORS.ink,
    color: '#ffffff',
    borderColor: COLORS.ink,
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
    color: COLORS.inkMuted,
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
    color: COLORS.ink,
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
  background: COLORS.paper,
  boxShadow: '0 1px 1px rgba(15, 23, 42, 0.03)',
};

const autoReopenBannerOpenStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid transparent',
  background: COLORS.brand,
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
  background: COLORS.paper,
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

export function Home({ onSelectTemplate, onOpenFile }: HomeProps): React.JSX.Element {
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
    const fileName = /\.docx$/i.test(r.name) ? r.name : `${r.name}.docx`;
    const file = new File([r.buffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
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
      // Blank always shows (cosmetic Personal, but useful from every filter).
      if (category !== 'All' && t.category !== category && t.id !== 'blank') return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const featured = useMemo(() => TEMPLATES.filter((t) => t.featured), []);

  const byCategory = useMemo(() => {
    const m = new Map<TemplateCategory, TemplateEntry[]>();
    for (const c of CATEGORIES) m.set(c, []);
    for (const t of TEMPLATES) m.get(t.category)?.push(t);
    return m;
  }, []);

  const isFiltered = query.trim() !== '' || category !== 'All';

  return (
    <div style={styles.page} data-testid="home-page">
      <header style={{ ...styles.topBar, ...(isMobile && mobile.topBar) }}>
        <div style={styles.brandRow}>
          <img src="/logo.svg" alt="" style={styles.brandLogo} aria-hidden="true" />
          <div style={styles.brandName}>Casual Editor</div>
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
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.ink)}
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
        accept=".docx,.odt,.md,.markdown,.txt"
        style={styles.hiddenInput}
        onChange={handleFileChange}
        data-testid="home-file-input"
      />

      <footer style={{ ...styles.footer, ...(isMobile && mobile.footer) }}>
        <span>MIT fork of eigenpal/docx-editor · stateless real-time backend in Go</span>
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
