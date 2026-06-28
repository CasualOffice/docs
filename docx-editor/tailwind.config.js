/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Tailwind v3 resolves `content` globs relative to process.cwd(), not
// to this config file's directory. When the build runs from
// `examples/vite/`, the previous relative globs resolved to
// `examples/vite/packages/...` (which doesn't exist) and no utility
// classes were generated. Anchor the globs at this config's directory
// so the scan works regardless of where postcss is invoked from.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Honor the existing `[data-theme="dark"]` attribute used by editor.css
  // for the CSS-variable dark theme, so Tailwind `dark:` variants fire in
  // the same conditions. The literal 'class' fallback still works for any
  // app that prefers to flip a class on <html> instead.
  darkMode: ['variant', ['&:where(.dark, .dark *)', '&:where([data-theme="dark"], [data-theme="dark"] *)']],
  // Absolute, cwd-independent globs (see header comment) so the desktop
  // `--base=./` build run from docx-editor/ still scans the right sources.
  content: [
    join(__dirname, 'packages/react/src/**/*.{ts,tsx}'),
    join(__dirname, 'examples/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Document editor color system
        'doc-bg': 'var(--doc-bg)',
        'doc-primary': 'var(--doc-primary)',
        'doc-primary-hover': 'var(--doc-primary-hover)',
        'doc-primary-light': 'var(--doc-primary-light)',
        'doc-text': 'var(--doc-text)',
        'doc-text-muted': 'var(--doc-text-muted)',
        'doc-text-subtle': 'var(--doc-text-subtle)',
        'doc-text-placeholder': 'var(--doc-text-placeholder)',
        'doc-border': 'var(--doc-border)',
        'doc-border-light': 'var(--doc-border-light)',
        'doc-border-dark': 'var(--doc-border-dark)',
        'doc-border-input': 'var(--doc-border-input)',
        'doc-bg-subtle': 'var(--doc-bg-subtle)',
        'doc-bg-hover': 'var(--doc-bg-hover)',
        'doc-bg-input': 'var(--doc-bg-input)',
        'doc-error': 'var(--doc-error)',
        'doc-error-bg': 'var(--doc-error-bg)',
        'doc-success': 'var(--doc-success)',
        'doc-success-bg': 'var(--doc-success-bg)',
        'doc-warning': 'var(--doc-warning)',
        'doc-warning-bg': 'var(--doc-warning-bg)',
        'doc-link': 'var(--doc-link)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
