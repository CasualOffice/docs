/**
 * Focus mode ambient bar.
 *
 * The signature element of focus mode — a single softly-pill bar
 * pinned to the bottom-center of the viewport that reports word
 * count + estimated reading time + the Esc hint. Everything else
 * (toolbar, title bar, rails, status bar) is hidden while focus
 * mode is active.
 *
 * Premium pass:
 *   - Soft pill shape (28 px corner radius), backdrop blur,
 *     low-opacity tint so the document stays the focus.
 *   - Three-zone typography rhythm: count · reading time · esc
 *     hint, separated by mid-dots at 0.45 opacity.
 *   - Fade-in on mount (220 ms cubic-bezier(0.16, 1, 0.3, 1))
 *     matching the panel + palette motion language.
 *   - Auto-fades after 4 s of idle mouse / keyboard activity so
 *     the doc has the whole viewport. Returns instantly on any
 *     pointer / key event.
 *   - Esc-affordance chip rendered as a monospace key cap so it
 *     reads like a real keyboard hint.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

const AUTO_HIDE_AFTER_MS = 4000;
const READ_WPM = 220; // average adult silent reading speed

const wrapStyle: CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  pointerEvents: 'none',
};

const pillStyle = (visible: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 14,
  padding: '8px 18px',
  borderRadius: 999,
  background: 'rgba(15, 23, 42, 0.66)',
  color: 'rgba(255, 255, 255, 0.92)',
  backdropFilter: 'blur(14px) saturate(140%)',
  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: '-0.005em',
  boxShadow:
    '0 1px 1px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.16), 0 24px 64px rgba(15, 23, 42, 0.22)',
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateY(0)' : 'translateY(8px)',
  transition:
    'opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
});

const dotStyle: CSSProperties = {
  opacity: 0.42,
};

const escKbdStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(255, 255, 255, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  marginRight: 6,
};

function formatReadTime(words: number): string {
  if (words < 50) return '< 1 min';
  const minutes = Math.max(1, Math.round(words / READ_WPM));
  return `~${minutes} min read`;
}

export interface FocusModeBarProps {
  wordCount: number;
  /** True when focus mode is active. The component returns null
   *  when false so the host can mount unconditionally. */
  isActive: boolean;
}

export function FocusModeBar({ wordCount, isActive }: FocusModeBarProps) {
  const [visible, setVisible] = useState(true);
  const idleTimerRef = useRef<number | null>(null);

  // Auto-fade after idle. Any pointer or key activity resets the timer
  // and re-shows the bar. Hidden completely when focus mode itself is
  // off (host unmounts then; this is the within-active guard).
  useEffect(() => {
    if (!isActive) return;
    const reset = () => {
      setVisible(true);
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setVisible(false), AUTO_HIDE_AFTER_MS);
    };
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('scroll', reset, true);
    return () => {
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('scroll', reset, true);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div style={wrapStyle} aria-hidden={!visible}>
      <div style={pillStyle(visible)} data-testid="focus-mode-bar">
        <span>
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
        </span>
        <span style={dotStyle}>·</span>
        <span>{formatReadTime(wordCount)}</span>
        <span style={dotStyle}>·</span>
        <span>
          <kbd style={escKbdStyle}>Esc</kbd>
          to exit
        </span>
      </div>
    </div>
  );
}

export default FocusModeBar;
