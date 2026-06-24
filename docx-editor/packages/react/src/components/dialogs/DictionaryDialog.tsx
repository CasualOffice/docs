/**
 * Tools → Dictionary (A4). Looks up a word via the free public
 * `dictionaryapi.dev` endpoint and shows part-of-speech + the first
 * definition for each meaning. No API key, no auth — fine for a v0
 * demo; a host integration can swap the fetcher later.
 *
 * The dialog seeds its input from the selection passed in. Loading
 * and error states route through the shared `PanelState` helper so
 * they look the same as every other panel in the editor.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { PanelState } from '../ui/PanelState';

export interface DictionaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Word captured from the editor selection at open time. May be null. */
  initialWord: string | null;
}

interface DictionaryMeaning {
  partOfSpeech: string;
  definition: string;
}

interface DictionaryResult {
  word: string;
  meanings: DictionaryMeaning[];
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: 'var(--doc-surface, white)',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  minWidth: 460,
  maxWidth: 560,
  width: '100%',
  margin: 20,
};

const headerStyle: CSSProperties = {
  padding: '16px 20px 12px',
  borderBottom: '1px solid var(--doc-border, #ddd)',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const bodyStyle: CSSProperties = {
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxHeight: '60vh',
  overflowY: 'auto',
};

const lookupRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 4,
  outline: 'none',
};

const btnBase: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const primaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
};

const secondaryBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const meaningStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingBottom: 8,
  borderBottom: '1px solid var(--doc-border-light, #f0eee9)',
};

const posStyle: CSSProperties = {
  fontSize: 12,
  fontStyle: 'italic',
  color: 'var(--doc-text-muted, #6b7280)',
};

const definitionStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const wordHeadingStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
  margin: 0,
};

const footerStyle: CSSProperties = {
  padding: '12px 20px 16px',
  borderTop: '1px solid var(--doc-border, #ddd)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

interface ApiResponseMeaning {
  partOfSpeech?: string;
  definitions?: { definition?: string }[];
}

interface ApiResponseEntry {
  word?: string;
  meanings?: ApiResponseMeaning[];
}

async function lookupWord(word: string, signal: AbortSignal): Promise<DictionaryResult> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url, { signal });
  if (res.status === 404) {
    throw new Error('not-found');
  }
  if (!res.ok) {
    throw new Error('http-error');
  }
  const data = (await res.json()) as ApiResponseEntry[];
  const first = data[0];
  if (!first) throw new Error('not-found');
  const meanings: DictionaryMeaning[] = [];
  for (const m of first.meanings ?? []) {
    const def = m.definitions?.[0]?.definition;
    if (m.partOfSpeech && def) {
      meanings.push({ partOfSpeech: m.partOfSpeech, definition: def });
    }
  }
  if (meanings.length === 0) throw new Error('not-found');
  return { word: first.word ?? word, meanings };
}

export function DictionaryDialog({ isOpen, onClose, initialWord }: DictionaryDialogProps) {
  const [input, setInput] = useState(initialWord ?? '');
  const [activeQuery, setActiveQuery] = useState<string | null>(initialWord);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'not-found' | 'error'>(
    initialWord ? 'loading' : 'idle'
  );
  const [result, setResult] = useState<DictionaryResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInput(initialWord ?? '');
      setActiveQuery(initialWord);
      setStatus(initialWord ? 'loading' : 'idle');
      setResult(null);
    }
  }, [isOpen, initialWord]);

  useEffect(() => {
    if (!isOpen || !activeQuery) return;
    const controller = new AbortController();
    setStatus('loading');
    setResult(null);
    lookupWord(activeQuery.trim(), controller.signal)
      .then((r) => {
        setResult(r);
        setStatus('success');
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setStatus(err.message === 'not-found' ? 'not-found' : 'error');
      });
    return () => controller.abort();
  }, [isOpen, activeQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setActiveQuery(trimmed);
  };

  return (
    <div
      className="ep-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ep-dialog-shell"
        style={dialogStyle}
        role="dialog"
        aria-label="Dictionary"
        data-testid="dictionary-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>Dictionary</div>
        <div style={bodyStyle}>
          <div style={lookupRowStyle}>
            <input
              type="text"
              placeholder="Look up a word"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              data-testid="dictionary-input"
              style={inputStyle}
              autoFocus
            />
            <button
              type="button"
              style={primaryBtnStyle}
              data-testid="dictionary-lookup"
              disabled={input.trim().length === 0}
              onClick={submit}
            >
              Look up
            </button>
          </div>

          {status === 'loading' && (
            <PanelState kind="loading" message={`Looking up “${activeQuery ?? ''}”…`} />
          )}
          {status === 'not-found' && (
            <PanelState
              kind="error"
              message={`No definition found for “${activeQuery ?? ''}”.`}
              hint="Try a different spelling or root word."
            />
          )}
          {status === 'error' && (
            <PanelState
              kind="error"
              message="Couldn't reach the dictionary service."
              hint="Check your connection and try again."
              onRetry={() => setActiveQuery((q) => (q ? `${q}` : q))}
            />
          )}
          {status === 'success' && result && (
            <>
              <h3 style={wordHeadingStyle} data-testid="dictionary-word">
                {result.word}
              </h3>
              {result.meanings.map((m, i) => (
                <div key={`${m.partOfSpeech}-${i}`} style={meaningStyle}>
                  <span style={posStyle}>{m.partOfSpeech}</span>
                  <span style={definitionStyle}>{m.definition}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div style={footerStyle}>
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DictionaryDialog;
