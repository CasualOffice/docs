import { describe, it, expect, beforeEach } from 'bun:test';
import { addCitation, loadCitations, removeCitation, formatCitation } from './citations';

function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  (globalThis as unknown as { window: { localStorage: typeof ls } }).window = {
    localStorage: ls,
  };
}

describe('citations storage', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('round-trips a saved citation', () => {
    const after = addCitation({
      author: 'Knuth, D.',
      title: 'The Art of Computer Programming',
      year: '1968',
      url: 'https://example.com',
    });
    expect(after.length).toBe(1);
    expect(after[0]?.title).toBe('The Art of Computer Programming');
    expect(loadCitations()[0]?.author).toBe('Knuth, D.');
  });

  it('removes by id', () => {
    const [c] = addCitation({ author: 'A', title: 'B' });
    expect(removeCitation(c!.id)).toEqual([]);
    expect(loadCitations()).toEqual([]);
  });

  it('puts newest first', () => {
    addCitation({ author: 'A', title: 'A-title' });
    addCitation({ author: 'B', title: 'B-title' });
    expect(loadCitations()[0]?.author).toBe('B');
  });
});

describe('citation formatting', () => {
  const citation = {
    id: 'cit_x',
    author: 'Knuth, D.',
    title: 'The Art of Computer Programming',
    year: '1968',
    url: 'https://example.com',
    createdAt: 0,
  };

  it('formats APA', () => {
    expect(formatCitation(citation, 'apa')).toBe(
      'Knuth, D. (1968). The Art of Computer Programming. https://example.com'
    );
  });

  it('formats MLA', () => {
    expect(formatCitation(citation, 'mla')).toBe(
      'Knuth, D.. “The Art of Computer Programming.” 1968. https://example.com'
    );
  });

  it('formats Chicago', () => {
    expect(formatCitation(citation, 'chicago')).toBe(
      'Knuth, D.. 1968. “The Art of Computer Programming.” https://example.com'
    );
  });

  it('uses n.d. when no year', () => {
    const noyear = { ...citation, year: undefined };
    expect(formatCitation(noyear, 'apa')).toContain('(n.d.)');
  });

  it('omits the URL segment when not present', () => {
    const nourl = { ...citation, url: undefined };
    expect(formatCitation(nourl, 'apa')).not.toContain('https');
  });
});
