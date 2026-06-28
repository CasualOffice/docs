/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Font Family Resolver
 *
 * Maps DOCX font names to Google Fonts equivalents with proper CSS fallback stacks.
 *
 * DOCX files often use fonts that aren't freely available (Calibri, Cambria, etc.)
 * This module provides mappings to metrically-compatible Google Fonts alternatives.
 */

import type { ThemeFontScheme, ThemeFont } from '../types';

/**
 * Result of resolving a font family
 */
export interface ResolvedFont {
  /** Google Font name to load (null if no mapping available) */
  googleFont: string | null;
  /** CSS font-family value with proper fallback stack */
  cssFallback: string;
  /** Original font name from the DOCX */
  originalFont: string;
  /** Whether this font has a Google Fonts equivalent */
  hasGoogleEquivalent: boolean;
  /** OS/2 single-line ratio: (usWinAscent + usWinDescent) / unitsPerEm (no external leading) */
  singleLineRatio: number;
}

/**
 * Font category for fallback selection
 */
type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'cursive' | 'fantasy' | 'system-ui';

/**
 * Font mapping entry
 */
interface FontMapping {
  googleFont: string;
  category: FontCategory;
  fallbackStack: string[];
  /** OS/2 single-line ratio: (usWinAscent + usWinDescent) / unitsPerEm (no external leading) */
  singleLineRatio: number;
}

/**
 * Default OS/2 single-line ratio for unmapped fonts.
 * Middle of the common range (1.07–1.27) for standard DOCX fonts.
 */
export const DEFAULT_SINGLE_LINE_RATIO = 1.15;

/**
 * Mapping of common DOCX fonts to Google Fonts equivalents
 *
 * These are metrically compatible fonts that preserve document layout.
 * See: https://wiki.archlinux.org/title/Metric-compatible_fonts
 *
 * singleLineRatio values are derived from each font's OS/2 table:
 * (usWinAscent + usWinDescent) / unitsPerEm
 * These define the Windows GDI "single line" height that OOXML lineRule="auto" uses.
 * sTypoLineGap (external leading) is NOT included — Word excludes it from the
 * lineRule="auto" calculation (ECMA-376 §17.3.1.33).
 */
const FONT_MAPPINGS: Record<string, FontMapping> = {
  // Microsoft Office fonts -> Google equivalents (via Croscore)
  calibri: {
    googleFont: 'Carlito',
    category: 'sans-serif',
    fallbackStack: ['Calibri', 'Carlito', 'Arial', 'Helvetica', 'sans-serif'],
    // Carlito (LibreOffice's Calibri substitute) has OS/2 win/typo/hhea tables
    // that all give 2500/2048 = 1.2207, but LibreOffice's per-line layout
    // accumulates ~1.4% tighter. A VF sweep of the representative corpus peaks
    // at 1.205 (87.2 mean vs 83.0 at 1.2207); sharp falloff either side.
    singleLineRatio: 1.205, // calibrated to LibreOffice render (Carlito OS/2 = 2500/2048 = 1.2207)
  },
  cambria: {
    googleFont: 'Caladea',
    category: 'serif',
    fallbackStack: ['Cambria', 'Caladea', 'Georgia', 'serif'],
    singleLineRatio: 1.2676, // 2596/2048
  },
  arial: {
    googleFont: 'Arimo',
    category: 'sans-serif',
    // Liberation Sans (bundled, OFL) is metric-compatible with Arial and is
    // what LibreOffice substitutes — preferred over the CDN Arimo so the editor
    // matches the reference deterministically without a network fetch.
    fallbackStack: ['Arial', 'Liberation Sans', 'Arimo', 'Helvetica', 'sans-serif'],
    singleLineRatio: 1.1172, // (1854+434)/2048 — no sTypoLineGap
  },
  'times new roman': {
    googleFont: 'Tinos',
    category: 'serif',
    fallbackStack: ['Times New Roman', 'Liberation Serif', 'Tinos', 'Times', 'serif'],
    singleLineRatio: 1.1074, // (1825+443)/2048 — no sTypoLineGap
  },
  'courier new': {
    googleFont: 'Cousine',
    category: 'monospace',
    fallbackStack: ['Courier New', 'Liberation Mono', 'Cousine', 'Courier', 'monospace'],
    singleLineRatio: 1.1328, // 2320/2048
  },

  // Additional common fonts
  georgia: {
    googleFont: 'Tinos', // Similar but not perfect match
    category: 'serif',
    fallbackStack: ['Georgia', 'Tinos', 'Times New Roman', 'serif'],
    singleLineRatio: 1.1362, // 2327/2048
  },
  verdana: {
    googleFont: 'Open Sans', // Similar sans-serif
    category: 'sans-serif',
    fallbackStack: ['Verdana', 'Open Sans', 'Arial', 'sans-serif'],
    singleLineRatio: 1.2153, // 2489/2048
  },
  tahoma: {
    googleFont: 'Open Sans',
    category: 'sans-serif',
    fallbackStack: ['Tahoma', 'Open Sans', 'Arial', 'sans-serif'],
    singleLineRatio: 1.2075, // 2472/2048
  },
  'trebuchet ms': {
    googleFont: 'Fira Sans',
    category: 'sans-serif',
    fallbackStack: ['Trebuchet MS', 'Fira Sans', 'Arial', 'sans-serif'],
    singleLineRatio: 1.1431, // 2341/2048
  },
  'comic sans ms': {
    googleFont: 'Comic Neue',
    category: 'cursive',
    fallbackStack: ['Comic Sans MS', 'Comic Neue', 'cursive'],
    singleLineRatio: 1.3936, // 2854/2048
  },
  impact: {
    googleFont: 'Anton',
    category: 'sans-serif',
    fallbackStack: ['Impact', 'Anton', 'Arial Black', 'sans-serif'],
    singleLineRatio: 1.2197, // 2498/2048
  },
  'palatino linotype': {
    googleFont: 'EB Garamond',
    category: 'serif',
    fallbackStack: ['Palatino Linotype', 'EB Garamond', 'Palatino', 'Georgia', 'serif'],
    singleLineRatio: 1.0259, // 2101/2048
  },
  'book antiqua': {
    googleFont: 'EB Garamond',
    category: 'serif',
    fallbackStack: ['Book Antiqua', 'EB Garamond', 'Palatino', 'Georgia', 'serif'],
    singleLineRatio: 1.0259, // 2101/2048
  },
  garamond: {
    googleFont: 'EB Garamond',
    category: 'serif',
    fallbackStack: ['Garamond', 'EB Garamond', 'Georgia', 'serif'],
    singleLineRatio: 1.068, // 1068/1000
  },
  'century gothic': {
    googleFont: 'Questrial',
    category: 'sans-serif',
    fallbackStack: ['Century Gothic', 'Questrial', 'Arial', 'sans-serif'],
    singleLineRatio: 1.1611, // 2378/2048
  },
  'lucida sans': {
    googleFont: 'Open Sans',
    category: 'sans-serif',
    fallbackStack: ['Lucida Sans', 'Open Sans', 'Arial', 'sans-serif'],
    singleLineRatio: 1.1655, // 2387/2048
  },
  'lucida console': {
    googleFont: 'Cousine',
    category: 'monospace',
    fallbackStack: ['Lucida Console', 'Cousine', 'Courier New', 'monospace'],
    singleLineRatio: 1.1387, // 2332/2048
  },
  consolas: {
    googleFont: 'Inconsolata',
    category: 'monospace',
    fallbackStack: ['Consolas', 'Inconsolata', 'Cousine', 'Courier New', 'monospace'],
    singleLineRatio: 1.1626, // 2381/2048
  },

  // CJK fonts
  'ms mincho': {
    googleFont: 'Noto Serif JP',
    category: 'serif',
    fallbackStack: ['MS Mincho', 'Noto Serif JP', 'serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  'ms gothic': {
    googleFont: 'Noto Sans JP',
    category: 'sans-serif',
    fallbackStack: ['MS Gothic', 'Noto Sans JP', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  simhei: {
    googleFont: 'Noto Sans SC',
    category: 'sans-serif',
    fallbackStack: ['SimHei', 'Noto Sans SC', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  simsun: {
    googleFont: 'Noto Serif SC',
    category: 'serif',
    fallbackStack: ['SimSun', 'Noto Serif SC', 'serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  'malgun gothic': {
    googleFont: 'Noto Sans KR',
    category: 'sans-serif',
    fallbackStack: ['Malgun Gothic', 'Noto Sans KR', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  // Traditional-Chinese sans (Windows default). Unmapped, these fell through
  // to an arbitrary browser CJK fallback whose ideographs measured WIDER than
  // 1em, so long CJK runs (headings, table cells) over-wrapped and the whole
  // doc drifted downward vs LibreOffice (which falls back at a 1em advance).
  // Noto Sans TC sets ideographs at the canonical 1em advance — wrapping and
  // row positions line up. `Light` shares the family (weight handled by the
  // run's bold flag), so it maps to the same googleFont.
  'microsoft jhenghei': {
    googleFont: 'Noto Sans TC',
    category: 'sans-serif',
    fallbackStack: ['Microsoft JhengHei', 'Noto Sans TC', 'PingFang TC', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  'microsoft jhenghei light': {
    googleFont: 'Noto Sans TC',
    category: 'sans-serif',
    fallbackStack: ['Microsoft JhengHei Light', 'Noto Sans TC', 'PingFang TC', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  // Simplified-Chinese sans (Windows default). Same 1em-advance rationale.
  'microsoft yahei': {
    googleFont: 'Noto Sans SC',
    category: 'sans-serif',
    fallbackStack: ['Microsoft YaHei', 'Noto Sans SC', 'PingFang SC', 'sans-serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  // Traditional-Chinese serif (older Office default).
  pmingliu: {
    googleFont: 'Noto Serif TC',
    category: 'serif',
    fallbackStack: ['PMingLiU', 'Noto Serif TC', 'PingFang TC', 'serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },
  mingliu: {
    googleFont: 'Noto Serif TC',
    category: 'serif',
    fallbackStack: ['MingLiU', 'Noto Serif TC', 'PingFang TC', 'serif'],
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  },

  // Symbol / dingbat fonts. Their glyphs (form checkboxes, dingbats) have a
  // very tall ink box, so Word/LibreOffice give lines set in these fonts a
  // line height far above a normal text font. The browser almost never has
  // these fonts and falls back to a normal one whose metrics are wrong, which
  // collapsed form rows to ~half height (#11). We can't ship the proprietary
  // fonts, so we hardcode an empirically-calibrated line ratio instead.
  //
  // Wingdings 2 is calibrated against LibreOffice: a 16pt `w14:checkbox` cell
  // renders a 75px row → ratio ≈ 75px / ptToPx(16) ≈ 3.3. The sibling dingbat
  // fonts (Wingdings, Wingdings 2/3, Webdings) share the same tall-glyph
  // character, so they inherit the calibrated value pending per-font
  // measurement. `Symbol` (Greek/math) has normal text metrics and is left at
  // the default. fallbackStack keeps a normal font so substituted Unicode
  // glyphs (☐ ☒ ●) still render; only the line *metrics* are inflated.
  wingdings: {
    googleFont: '',
    category: 'sans-serif',
    fallbackStack: ['Wingdings', 'sans-serif'],
    singleLineRatio: 3.3, // empirical (dingbat glyph ink box), not OS/2-derived
  },
  'wingdings 2': {
    googleFont: '',
    category: 'sans-serif',
    fallbackStack: ['Wingdings 2', 'sans-serif'],
    singleLineRatio: 3.3, // calibrated: 16pt checkbox → 75px row in LibreOffice
  },
  'wingdings 3': {
    googleFont: '',
    category: 'sans-serif',
    fallbackStack: ['Wingdings 3', 'sans-serif'],
    singleLineRatio: 3.3,
  },
  webdings: {
    googleFont: '',
    category: 'sans-serif',
    fallbackStack: ['Webdings', 'sans-serif'],
    singleLineRatio: 3.3,
  },
};

/**
 * Default fallback stacks by category
 */
const DEFAULT_FALLBACKS: Record<FontCategory, string> = {
  'sans-serif': 'Arial, Helvetica, sans-serif',
  serif: 'Times New Roman, Times, serif',
  monospace: 'Courier New, Courier, monospace',
  cursive: 'cursive',
  fantasy: 'fantasy',
  'system-ui': 'system-ui, sans-serif',
};

/**
 * Detect font category from font name
 */
function detectFontCategory(fontName: string): FontCategory {
  const lower = fontName.toLowerCase();

  // Monospace indicators
  if (
    lower.includes('mono') ||
    lower.includes('courier') ||
    lower.includes('consolas') ||
    lower.includes('console') ||
    lower.includes('code') ||
    lower.includes('terminal')
  ) {
    return 'monospace';
  }

  // Serif indicators
  if (
    lower.includes('times') ||
    lower.includes('georgia') ||
    lower.includes('garamond') ||
    lower.includes('palatino') ||
    lower.includes('baskerville') ||
    lower.includes('bodoni') ||
    lower.includes('cambria') ||
    lower.includes('mincho') ||
    lower.includes('ming') ||
    lower.includes('song') ||
    lower.includes('serif')
  ) {
    return 'serif';
  }

  // Cursive/script indicators
  if (
    lower.includes('script') ||
    lower.includes('cursive') ||
    lower.includes('comic') ||
    lower.includes('brush') ||
    lower.includes('hand')
  ) {
    return 'cursive';
  }

  // Default to sans-serif
  return 'sans-serif';
}

/**
 * Resolve a DOCX font name to a Google Font and CSS fallback stack
 *
 * @param docxFontName - The font name from the DOCX file
 * @returns Resolved font information
 */
export function resolveFontFamily(docxFontName: string): ResolvedFont {
  const normalizedName = docxFontName.trim().toLowerCase();

  // Check if we have a direct mapping
  const mapping = FONT_MAPPINGS[normalizedName];

  if (mapping) {
    return {
      googleFont: mapping.googleFont,
      cssFallback: mapping.fallbackStack.map(quoteFontName).join(', '),
      originalFont: docxFontName,
      hasGoogleEquivalent: true,
      singleLineRatio: mapping.singleLineRatio,
    };
  }

  // No mapping - detect category and create fallback
  const category = detectFontCategory(docxFontName);
  const defaultFallback = DEFAULT_FALLBACKS[category];

  return {
    googleFont: null,
    cssFallback: `${quoteFontName(docxFontName)}, ${defaultFallback}`,
    originalFont: docxFontName,
    hasGoogleEquivalent: false,
    singleLineRatio: DEFAULT_SINGLE_LINE_RATIO,
  };
}

/**
 * Quote a font name if it contains spaces or special characters
 */
function quoteFontName(fontName: string): string {
  // If it's a generic family, don't quote
  if (
    ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'].includes(
      fontName.toLowerCase()
    )
  ) {
    return fontName;
  }

  // Quote if contains spaces or special characters
  if (/[\s,'"()]/.test(fontName)) {
    return `"${fontName.replace(/"/g, '\\"')}"`;
  }

  return fontName;
}

/**
 * Resolve a theme font reference to actual font names
 *
 * @param themeRef - Theme font reference (e.g., 'majorAscii', 'minorHAnsi')
 * @param fontScheme - Theme font scheme from the DOCX
 * @returns Resolved font name or null if not found
 */
export function resolveThemeFont(themeRef: string, fontScheme?: ThemeFontScheme): string | null {
  if (!fontScheme) {
    return null;
  }

  // Parse the theme reference
  const isMajor = themeRef.toLowerCase().startsWith('major');
  const themeFont: ThemeFont | undefined = isMajor ? fontScheme.majorFont : fontScheme.minorFont;

  if (!themeFont) {
    return null;
  }

  // Determine which script variant to use
  const ref = themeRef.toLowerCase();

  if (ref.includes('eastasia') || ref.includes('ea')) {
    return themeFont.ea ?? themeFont.latin ?? null;
  }

  if (ref.includes('cs') || ref.includes('bidi')) {
    return themeFont.cs ?? themeFont.latin ?? null;
  }

  // Default to Latin/Western font
  return themeFont.latin ?? null;
}

/**
 * Get all Google Font names needed for a list of DOCX fonts
 *
 * @param docxFonts - Array of font names from the DOCX
 * @returns Array of Google Font names to load
 */
export function getGoogleFontsToLoad(docxFonts: string[]): string[] {
  const googleFonts = new Set<string>();

  for (const font of docxFonts) {
    const resolved = resolveFontFamily(font);
    if (resolved.googleFont) {
      googleFonts.add(resolved.googleFont);
    }
  }

  return Array.from(googleFonts);
}

/**
 * Build a CSS font-family string from an array of font names
 *
 * @param fonts - Array of font names
 * @param category - Fallback category
 * @returns CSS font-family value
 */
export function buildFontFamilyString(
  fonts: string[],
  category: FontCategory = 'sans-serif'
): string {
  const quoted = fonts.map(quoteFontName);

  // Ensure we have the generic fallback
  const parts = [...quoted];
  if (!parts.some((p) => p.toLowerCase() === category)) {
    parts.push(category);
  }

  return parts.join(', ');
}

/**
 * Get the Google Font equivalent for a DOCX font (if any)
 *
 * @param docxFontName - The font name from the DOCX file
 * @returns Google Font name or null
 */
export function getGoogleFontEquivalent(docxFontName: string): string | null {
  const normalizedName = docxFontName.trim().toLowerCase();
  const mapping = FONT_MAPPINGS[normalizedName];
  return mapping?.googleFont ?? null;
}

/**
 * Check if a font has a known Google Fonts equivalent
 *
 * @param docxFontName - The font name from the DOCX file
 * @returns true if there's a Google Fonts equivalent
 */
export function hasGoogleFontEquivalent(docxFontName: string): boolean {
  const normalizedName = docxFontName.trim().toLowerCase();
  return normalizedName in FONT_MAPPINGS;
}
