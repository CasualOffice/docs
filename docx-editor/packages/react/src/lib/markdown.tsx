/**
 * Tiny inline markdown renderer for chat bubbles.
 *
 * Llama-3.2-1B's replies routinely use **bold**, *italic*, `code`,
 * bullets, numbered lists, and fenced code blocks. Showing them as
 * raw asterisks makes the chat feel amateur; pulling in a full
 * markdown lib (react-markdown + remark + …) adds 50 KB+ of deps we
 * don't need for the subset the model actually uses.
 *
 * What we handle:
 *  - `# heading` to `###### heading`
 *  - `**bold**`, `__bold__`, `*italic*`, `_italic_`
 *  - `` `inline code` ``
 *  - Fenced code blocks (```)
 *  - Bullet lists (`- `, `* `)
 *  - Numbered lists (`1. `, `2. `, …)
 *  - Links: `[text](url)`
 *  - Hard line breaks (blank line between paragraphs)
 *
 * What we deliberately ignore: tables, images, blockquotes,
 * strikethrough, HTML pass-through. Small models seldom emit them,
 * and supporting them properly belongs in a real markdown engine.
 */

import { Fragment, memo, type ReactNode } from 'react';

interface InlineToken {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'link';
  value: string;
  href?: string;
}

const INLINE_PATTERNS: {
  kind: InlineToken['kind'];
  open: string;
  close: string;
  pattern: RegExp;
}[] = [
  { kind: 'bold', open: '**', close: '**', pattern: /\*\*([^*]+)\*\*/ },
  { kind: 'bold', open: '__', close: '__', pattern: /__([^_]+)__/ },
  { kind: 'italic', open: '*', close: '*', pattern: /(^|[^*])\*([^*]+)\*/ },
  { kind: 'italic', open: '_', close: '_', pattern: /(^|[^_])_([^_]+)_/ },
  { kind: 'code', open: '`', close: '`', pattern: /`([^`]+)`/ },
  {
    kind: 'link',
    open: '[',
    close: ')',
    pattern: /\[([^\]]+)\]\(([^)]+)\)/,
  },
];

function tokeniseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let best: { match: RegExpMatchArray; spec: (typeof INLINE_PATTERNS)[number] } | null = null;
    for (const spec of INLINE_PATTERNS) {
      const m = remaining.match(spec.pattern);
      if (!m) continue;
      if (!best || (m.index ?? 0) < (best.match.index ?? 0)) {
        best = { match: m, spec };
      }
    }
    if (!best || best.match.index === undefined) {
      tokens.push({ kind: 'text', value: remaining });
      break;
    }
    const before = remaining.slice(0, best.match.index);
    if (before.length > 0) tokens.push({ kind: 'text', value: before });

    if (best.spec.kind === 'link') {
      tokens.push({
        kind: 'link',
        value: best.match[1] ?? '',
        href: best.match[2] ?? '',
      });
      remaining = remaining.slice(best.match.index + best.match[0].length);
      continue;
    }

    if (best.spec.kind === 'italic') {
      // Italic patterns include a leading non-marker capture so they
      // don't eat the first asterisk of a bold span. Re-emit the
      // captured prefix as plain text.
      const prefix = best.match[1] ?? '';
      if (prefix.length > 0) tokens.push({ kind: 'text', value: prefix });
      tokens.push({ kind: 'italic', value: best.match[2] ?? '' });
      remaining = remaining.slice(best.match.index + best.match[0].length);
      continue;
    }

    tokens.push({ kind: best.spec.kind, value: best.match[1] ?? '' });
    remaining = remaining.slice(best.match.index + best.match[0].length);
  }
  return tokens;
}

function renderInline(text: string): ReactNode {
  const tokens = tokeniseInline(text);
  return tokens.map((t, i) => {
    switch (t.kind) {
      case 'bold':
        return <strong key={i}>{renderInline(t.value)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(t.value)}</em>;
      case 'code':
        return (
          <code
            key={i}
            style={{
              fontFamily: 'Consolas, "SF Mono", Menlo, monospace',
              fontSize: '0.92em',
              background: 'rgba(0,0,0,0.06)',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            {t.value}
          </code>
        );
      case 'link':
        return (
          <a
            key={i}
            href={t.href ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--doc-primary, #1a73e8)', textDecoration: 'underline' }}
          >
            {t.value}
          </a>
        );
      default:
        return <Fragment key={i}>{t.value}</Fragment>;
    }
  });
}

interface Block {
  kind: 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'code';
  level?: number; // for heading
  lines: string[];
}

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        code.push(lines[i] ?? '');
        i++;
      }
      blocks.push({ kind: 'code', lines: code });
      i++; // skip the closing fence
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1]!.length,
        lines: [headingMatch[2] ?? ''],
      });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'bullet', lines: items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'numbered', lines: items });
      continue;
    }
    if (line.trim().length === 0) {
      i++;
      continue;
    }
    // Plain paragraph — collect consecutive non-empty, non-special
    // lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim().length > 0 &&
      !/^#{1,6}\s+/.test(lines[i] ?? '') &&
      !/^\s*[-*]\s+/.test(lines[i] ?? '') &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').startsWith('```')
    ) {
      para.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ kind: 'paragraph', lines: para });
  }
  return blocks;
}

const headingStyles: Record<number, React.CSSProperties> = {
  1: { fontSize: 18, fontWeight: 600, margin: '6px 0 4px' },
  2: { fontSize: 16, fontWeight: 600, margin: '6px 0 4px' },
  3: { fontSize: 14, fontWeight: 600, margin: '6px 0 4px' },
  4: { fontSize: 13, fontWeight: 600, margin: '6px 0 4px' },
  5: { fontSize: 13, fontWeight: 600, margin: '6px 0 4px' },
  6: { fontSize: 13, fontWeight: 600, margin: '6px 0 4px' },
};

function MarkdownImpl({ text }: { text: string }) {
  // parseBlocks + renderInline are pure CPU work. For chat / live
  // previews / version-history activity rows the same text gets
  // rendered many times as siblings update. Without memoising we
  // re-parse every block on every parent render — quadratic on the
  // translate live-preview pane (N chunks × N renders per chunk
  // landing), which is the freeze the user reported. Memo wrapper
  // below collapses to one parse per unique `text`.
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const level = Math.max(1, Math.min(6, b.level ?? 3));
            const inner = renderInline(b.lines[0] ?? '');
            const style = headingStyles[level];
            switch (level) {
              case 1:
                return (
                  <h1 key={i} style={style}>
                    {inner}
                  </h1>
                );
              case 2:
                return (
                  <h2 key={i} style={style}>
                    {inner}
                  </h2>
                );
              case 3:
                return (
                  <h3 key={i} style={style}>
                    {inner}
                  </h3>
                );
              case 4:
                return (
                  <h4 key={i} style={style}>
                    {inner}
                  </h4>
                );
              case 5:
                return (
                  <h5 key={i} style={style}>
                    {inner}
                  </h5>
                );
              default:
                return (
                  <h6 key={i} style={style}>
                    {inner}
                  </h6>
                );
            }
          }
          case 'paragraph':
            return (
              <p key={i} style={{ margin: '0 0 6px' }}>
                {renderInline(b.lines.join(' '))}
              </p>
            );
          case 'bullet':
            return (
              <ul key={i} style={{ margin: '0 0 6px 18px', padding: 0 }}>
                {b.lines.map((li, j) => (
                  <li key={j}>{renderInline(li)}</li>
                ))}
              </ul>
            );
          case 'numbered':
            return (
              <ol key={i} style={{ margin: '0 0 6px 18px', padding: 0 }}>
                {b.lines.map((li, j) => (
                  <li key={j}>{renderInline(li)}</li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre
                key={i}
                style={{
                  margin: '4px 0 6px',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.06)',
                  fontFamily: 'Consolas, "SF Mono", Menlo, monospace',
                  fontSize: 12,
                  lineHeight: 1.4,
                  overflowX: 'auto',
                }}
              >
                {b.lines.join('\n')}
              </pre>
            );
        }
      })}
    </>
  );
}

// Memoise on the `text` prop. Same-string siblings collapse to one
// parse pass + reused VDOM. Equality is reference-then-string so React
// can shortcut identical refs without an N-char compare.
export const Markdown = memo(MarkdownImpl, (a, b) => a.text === b.text);
