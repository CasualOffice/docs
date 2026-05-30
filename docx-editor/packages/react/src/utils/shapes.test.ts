import { describe, it, expect } from 'bun:test';
import { generateShape } from './shapes';

describe('shape generation', () => {
  it('produces an SVG with the expected dimensions per shape', () => {
    expect(generateShape('rectangle').width).toBe(200);
    expect(generateShape('rectangle').height).toBe(120);
    expect(generateShape('ellipse').width).toBe(200);
    expect(generateShape('line').height).toBe(30);
    expect(generateShape('arrow').height).toBe(30);
  });

  it('embeds the shape primitive in the SVG body', () => {
    expect(generateShape('rectangle').svg).toMatch(/<rect/);
    expect(generateShape('ellipse').svg).toMatch(/<ellipse/);
    expect(generateShape('line').svg).toMatch(/<line/);
    expect(generateShape('arrow').svg).toMatch(/marker-end="url\(#arrowhead\)"/);
  });

  it('emits a usable data URL', () => {
    const r = generateShape('rectangle');
    expect(r.dataUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    // Round-trip the URI-encoded body back to text and confirm it
    // contains the shape primitive.
    const decoded = decodeURIComponent(r.dataUrl.slice('data:image/svg+xml;utf8,'.length));
    expect(decoded).toMatch(/<rect/);
  });

  it('uses a meaningful alt text', () => {
    expect(generateShape('rectangle').altText).toBe('Rectangle');
    expect(generateShape('arrow').altText).toBe('Arrow');
  });
});
