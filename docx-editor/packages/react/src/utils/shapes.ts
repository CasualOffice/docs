/**
 * C2 v0 — basic inline shapes. Each shape is generated as an SVG string,
 * encoded as a `data:` URL, and inserted as a regular image node. The
 * full drawing canvas the parity note sketches (Google-Docs-style)
 * is out of scope for v0; this lands the headline action so users can
 * drop a rectangle / ellipse / line / arrow inline without leaving
 * the editor.
 *
 * Defaults are tuned for the average paragraph: 200×120 for filled
 * shapes, 200×60 for line/arrow. The user can resize via the existing
 * image handles and recolor via the image-properties dialog.
 */

export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'arrow';

interface ShapeDefaults {
  width: number;
  height: number;
  /** SVG body — must include any `width` / `height` placeholders {{W}} / {{H}}. */
  body: string;
}

const STROKE = '#1a73e8';
const FILL = '#a8c7fa';
const STROKE_WIDTH = 2;

const SHAPES: Record<ShapeType, ShapeDefaults> = {
  rectangle: {
    width: 200,
    height: 120,
    body: `<rect x="${STROKE_WIDTH}" y="${STROKE_WIDTH}" width="{{W}}" height="{{H}}" fill="${FILL}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" />`,
  },
  ellipse: {
    width: 200,
    height: 120,
    body: `<ellipse cx="{{CX}}" cy="{{CY}}" rx="{{RX}}" ry="{{RY}}" fill="${FILL}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" />`,
  },
  line: {
    width: 200,
    height: 30,
    body: `<line x1="${STROKE_WIDTH}" y1="{{CY}}" x2="{{X2}}" y2="{{CY}}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" />`,
  },
  arrow: {
    width: 200,
    height: 30,
    body: `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="${STROKE}" />
        </marker>
      </defs>
      <line x1="${STROKE_WIDTH}" y1="{{CY}}" x2="{{X2_ARROW}}" y2="{{CY}}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" marker-end="url(#arrowhead)" />`,
  },
};

export interface GeneratedShape {
  svg: string;
  dataUrl: string;
  width: number;
  height: number;
  altText: string;
}

export function generateShape(type: ShapeType): GeneratedShape {
  const { width, height, body } = SHAPES[type];
  const innerW = width - STROKE_WIDTH * 2;
  const innerH = height - STROKE_WIDTH * 2;
  const filled = body
    .replace(/\{\{W\}\}/g, String(innerW))
    .replace(/\{\{H\}\}/g, String(innerH))
    .replace(/\{\{CX\}\}/g, String(width / 2))
    .replace(/\{\{CY\}\}/g, String(height / 2))
    .replace(/\{\{RX\}\}/g, String(innerW / 2))
    .replace(/\{\{RY\}\}/g, String(innerH / 2))
    .replace(/\{\{X2\}\}/g, String(width - STROKE_WIDTH))
    .replace(/\{\{X2_ARROW\}\}/g, String(width - 12));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${filled}</svg>`;
  // `encodeURIComponent` keeps the SVG human-readable in the inserted
  // image's `src` (useful for debugging via DevTools) and is well-
  // supported across browsers.
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const altText =
    type === 'rectangle'
      ? 'Rectangle'
      : type === 'ellipse'
        ? 'Ellipse'
        : type === 'line'
          ? 'Line'
          : 'Arrow';
  return { svg, dataUrl, width, height, altText };
}
