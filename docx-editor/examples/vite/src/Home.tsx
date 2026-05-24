import React, { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CATEGORIES,
  TEMPLATES,
  type TemplateCategory,
  type TemplateEntry,
} from './templates/manifest';

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
    boxShadow:
      '0 14px 28px -16px rgba(15, 23, 42, 0.18), 0 4px 8px -2px rgba(15, 23, 42, 0.06)',
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
    color: COLORS.inkSubtle,
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

function TemplateCard({
  entry,
  onSelect,
}: {
  entry: TemplateEntry;
  onSelect: (entry: TemplateEntry) => void;
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
      <div style={styles.cardThumbWrap}>
        <img
          src={entry.thumbnail}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          style={{ ...styles.cardThumb, ...(hovered ? styles.cardThumbHover : null) }}
        />
        <span style={styles.cardIconBadge} aria-hidden="true">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {entry.icon}
          </span>
        </span>
      </div>
      <div style={styles.cardBody}>
        <div style={styles.cardTitle}>{entry.name}</div>
        <div style={styles.cardCategory}>{entry.category}</div>
      </div>
    </button>
  );
}

export function Home({ onSelectTemplate, onOpenFile }: HomeProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onOpenFile(file);
    e.target.value = '';
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
      <header style={styles.topBar}>
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

      <section style={styles.hero}>
        <div style={styles.heroEyebrow}>Casual Editor</div>
        <h1 style={styles.heroTitle}>
          Start something today.
        </h1>
        <p style={styles.heroLede}>
          A real-time collaborative <code>.docx</code> editor that runs in the browser.
          Pick a template designed for the way you actually work — or open a file from
          your computer.
        </p>
      </section>

      <section style={styles.controls}>
        <label style={styles.searchWrap}>
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
          style={styles.openFileBtn}
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
        <div style={styles.pillRow} role="group" aria-label="Filter by category">
          {(['All', ...CATEGORIES] as CategoryFilter[]).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                style={{ ...styles.pill, ...(active ? styles.pillActive : null) }}
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

      {!isFiltered && (
        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>Featured</h2>
            <span style={styles.sectionHint}>A few picks to get going.</span>
          </div>
          <div style={styles.featuredRow}>
            {featured.map((t) => (
              <TemplateCard key={t.id} entry={t} onSelect={onSelectTemplate} />
            ))}
          </div>
        </section>
      )}

      {isFiltered ? (
        <section style={styles.section}>
          <div style={styles.sectionHead}>
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
            <div style={styles.grid}>
              {filtered.map((t) => (
                <TemplateCard key={t.id} entry={t} onSelect={onSelectTemplate} />
              ))}
            </div>
          )}
        </section>
      ) : (
        CATEGORIES.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={cat} style={styles.section}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>{cat}</h2>
                <span style={styles.sectionHint}>
                  {items.length} template{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={styles.grid}>
                {items.map((t) => (
                  <TemplateCard key={t.id} entry={t} onSelect={onSelectTemplate} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        style={styles.hiddenInput}
        onChange={handleFileChange}
        data-testid="home-file-input"
      />

      <footer style={styles.footer}>
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
