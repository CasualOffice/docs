/**
 * Citations storage + formatting (A6 v0).
 *
 * Local-only — citations live in `localStorage`, scoped to the user's
 * browser. The "real" .docx bibliography-field round-trip is a future
 * follow-up (the parity note flags it as "schema-level work, queue
 * last"); this v0 keeps the user in control of their source list and
 * drops formatted plain text + hyperlink at the cursor when they
 * click Insert.
 *
 * Citation shape is intentionally minimal: author, title, year, URL.
 * That's enough to render APA / MLA / Chicago entries that look right
 * to a non-academic reader. Adding DOI, publisher, journal name later
 * is a backward-compatible additive change.
 */

const STORAGE_KEY = 'docx-editor-citations';

export type CitationStyle = 'apa' | 'mla' | 'chicago';

export interface Citation {
  /** Stable identifier — Date.now() + random suffix. */
  id: string;
  /** Author's name as it should appear in the bibliography. */
  author: string;
  /** Title of the work. */
  title: string;
  /** Optional 4-digit year. */
  year?: string;
  /** Optional URL — rendered as a hyperlink in the inserted citation. */
  url?: string;
  /** ms-since-epoch when the citation was saved. */
  createdAt: number;
}

function safeParse(raw: string | null): Citation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Citation =>
        c &&
        typeof c.id === 'string' &&
        typeof c.author === 'string' &&
        typeof c.title === 'string' &&
        typeof c.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

export function loadCitations(): Citation[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function saveAll(items: Citation[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota / private mode — silent fail.
  }
}

function makeId(): string {
  return `cit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addCitation(input: Omit<Citation, 'id' | 'createdAt'>): Citation[] {
  const c: Citation = {
    id: makeId(),
    author: input.author.trim(),
    title: input.title.trim(),
    year: input.year?.trim() || undefined,
    url: input.url?.trim() || undefined,
    createdAt: Date.now(),
  };
  const next = [c, ...loadCitations()];
  saveAll(next);
  return next;
}

export function removeCitation(id: string): Citation[] {
  const next = loadCitations().filter((c) => c.id !== id);
  saveAll(next);
  return next;
}

/**
 * Format a citation per the requested style. Returns plain text suitable
 * for inline insertion. URL — if present — comes last, separated by a
 * space, so the caller can hyperlink the URL substring without parsing
 * the formatted text back apart.
 */
export function formatCitation(c: Citation, style: CitationStyle): string {
  const year = c.year ? c.year : 'n.d.';
  const url = c.url ? ` ${c.url}` : '';
  switch (style) {
    case 'apa':
      // Author. (Year). Title.
      return `${c.author} (${year}). ${c.title}.${url}`;
    case 'mla':
      // Author. "Title." Year.
      return `${c.author}. “${c.title}.” ${year}.${url}`;
    case 'chicago':
      // Author. Year. "Title."
      return `${c.author}. ${year}. “${c.title}.”${url}`;
  }
}
