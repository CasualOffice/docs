import { describe, expect, test } from 'bun:test';
import { getClipboardImageFiles, runsToClipboardContent } from '../clipboard';
import type { Run, Theme } from '../../types/document';

const OFFICE_THEME: Theme = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
};

describe('getClipboardImageFiles', () => {
  test('returns image files from clipboardData.files', () => {
    const imageFile = new File([new Uint8Array([1, 2, 3])], 'photo.png', {
      type: 'image/png',
    });
    const textFile = new File([new Uint8Array([4])], 'note.txt', { type: 'text/plain' });

    const clipboardData = {
      files: [imageFile, textFile],
    } as unknown as DataTransfer;

    expect(getClipboardImageFiles(clipboardData)).toEqual([imageFile]);
  });

  test('returns image files from clipboardData.items', () => {
    const imageFile = new File([new Uint8Array([9])], 'scan.jpg', { type: 'image/jpeg' });
    const textFile = new File([new Uint8Array([5])], 'readme.md', { type: 'text/plain' });

    const imageItem = {
      kind: 'file',
      type: 'image/jpeg',
      getAsFile: () => imageFile,
    };
    const textItem = {
      kind: 'file',
      type: 'text/plain',
      getAsFile: () => textFile,
    };

    const clipboardData = {
      items: [imageItem, textItem],
    } as unknown as DataTransfer;

    expect(getClipboardImageFiles(clipboardData)).toEqual([imageFile]);
  });

  test('deduplicates images that appear in files and items', () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fileFromFiles = new File([payload], 'dup.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const fileFromItems = new File([payload], 'dup.png', {
      type: 'image/png',
      lastModified: 123,
    });

    const imageItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => fileFromItems,
    };

    const clipboardData = {
      files: [fileFromFiles],
      items: [imageItem],
    } as unknown as DataTransfer;

    const result = getClipboardImageFiles(clipboardData);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('dup.png');
  });

  test('deduplicates multiple clipboard formats for the same image', () => {
    const payload = new Uint8Array([9, 8, 7, 6, 5]);
    const pngFile = new File([payload], 'clipboard.png', {
      type: 'image/png',
      lastModified: 111,
    });
    const bmpFile = new File([payload], 'clipboard.bmp', {
      type: 'image/bmp',
      lastModified: 222,
    });

    const pngItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => pngFile,
    };
    const bmpItem = {
      kind: 'file',
      type: 'image/bmp',
      getAsFile: () => bmpFile,
    };

    const clipboardData = {
      files: [pngFile, bmpFile],
      items: [pngItem, bmpItem],
    } as unknown as DataTransfer;

    const result = getClipboardImageFiles(clipboardData);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('image/png');
  });

  test('returns empty array when clipboardData is null', () => {
    expect(getClipboardImageFiles(null)).toEqual([]);
  });
});

describe('runsToClipboardContent — themed color resolution in HTML', () => {
  function textRun(text: string, formatting?: Run['formatting']): Run {
    return { type: 'run', content: [{ type: 'text', text }], formatting };
  }

  test('plain rgb text color passes through to HTML', () => {
    const runs = [textRun('hello', { color: { rgb: 'FF0000' } })];
    const { html } = runsToClipboardContent(runs, true, OFFICE_THEME);
    expect(html).toContain('color: #FF0000');
  });

  test('themed text color resolves via theme', () => {
    const runs = [textRun('hello', { color: { themeColor: 'accent1' } })];
    const { html } = runsToClipboardContent(runs, true, OFFICE_THEME);
    expect(html).toContain('color: #4472C4');
  });

  test('themed text color with tint resolves via theme', () => {
    const runs = [textRun('hello', { color: { themeColor: 'accent1', themeTint: '33' } })];
    const { html } = runsToClipboardContent(runs, true, OFFICE_THEME);
    expect(html).toContain('color: #DAE3F3');
  });

  test('themed shading fill resolves via theme', () => {
    const runs = [
      textRun('hello', {
        shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
      }),
    ];
    const { html } = runsToClipboardContent(runs, true, OFFICE_THEME);
    expect(html).toContain('background-color: #DAE3F3');
  });

  test('themed color without theme falls back gracefully (no color style)', () => {
    const runs = [textRun('hello', { color: { themeColor: 'accent1' } })];
    const { html } = runsToClipboardContent(runs, true); // no theme
    expect(html).not.toContain('color:');
    expect(html).toContain('hello');
  });
});
