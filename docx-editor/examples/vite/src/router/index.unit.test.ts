import { describe, expect, it } from 'bun:test';
import { parseRoute } from './index';

describe('parseRoute', () => {
  it('`/` and `/home` both map to kind=home', () => {
    expect(parseRoute('/', '').kind).toBe('home');
    expect(parseRoute('/home', '').kind).toBe('home');
  });

  it('parses `/document/<id>` with the id decoded', () => {
    const r = parseRoute('/document/abc%20123', '');
    expect(r.kind).toBe('document');
    expect(r.id).toBe('abc 123');
  });

  it('treats `/document/new` as a draft (no id carried)', () => {
    const r = parseRoute('/document/new', '');
    expect(r.kind).toBe('document-draft');
    expect(r.id).toBe('');
  });

  it('parses `/r/<roomId>` as a legacy room route', () => {
    const r = parseRoute('/r/room-9', '');
    expect(r.kind).toBe('room');
    expect(r.id).toBe('room-9');
  });

  it('parses `/embed` so the existing EmbedRoute keeps catching it', () => {
    expect(parseRoute('/embed', '').kind).toBe('embed');
  });

  it('returns kind=unknown for arbitrary pathnames', () => {
    expect(parseRoute('/weird/path', '').kind).toBe('unknown');
  });

  it('threads `?share=<token>` through every kind', () => {
    expect(parseRoute('/document/abc', '?share=tok').shareToken).toBe('tok');
    expect(parseRoute('/r/room-9', '?share=tok').shareToken).toBe('tok');
    expect(parseRoute('/home', '?share=tok').shareToken).toBe('tok');
  });

  it('preserves the raw search string for downstream consumers (?e2e=1)', () => {
    const r = parseRoute('/', '?e2e=1');
    expect(r.search).toBe('?e2e=1');
  });
});
