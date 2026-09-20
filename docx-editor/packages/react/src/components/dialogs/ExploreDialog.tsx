/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tools → Explore (A3). The stripped-down version of Google Docs'
 * Explore panel that the parity note sketches: pull a Wikipedia
 * summary for the selection text, surface the extract + a link, and
 * offer a "Cite this" button that drops a hyperlink at the cursor.
 *
 * Free public endpoint — no API key — so the dialog works on the demo
 * without any host integration. Image search and Drive results are
 * intentionally skipped per the parity note.
 *
 * Loading / error states route through `PanelState` so this dialog
 * looks like the rest of the editor.
 *
 * Migrated onto the shared <Dialog> shell — the shell owns the
 * backdrop / blur / scale-in motion / close X / focus trap / Esc +
 * backdrop dismissal. This file only describes the search body + the
 * footer Close action.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { PanelState } from '../ui/PanelState';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useTranslation } from '../../i18n';

export interface ExploreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Selection text captured at open time. `null` when no selection. */
  initialQuery: string | null;
  /** Called when the user clicks "Cite this" — host inserts a hyperlink. */
  onCite: (title: string, url: string) => void;
}

interface WikiResult {
  title: string;
  extract: string;
  url: string;
}

interface ApiResponse {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
  type?: string;
}

const bodyWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
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

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--doc-text-on-surface, #1f2937)',
  margin: 0,
};

const extractStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface, #1f2937)',
  margin: 0,
};

const linkStyle: CSSProperties = {
  color: 'var(--doc-primary, #1a73e8)',
  fontSize: 12,
  textDecoration: 'none',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};

const sourceLabelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted, #6b7280)',
};

const citeBtnStyle: CSSProperties = {
  ...btnBase,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'transparent',
  color: 'var(--doc-primary, #1a73e8)',
};

async function explore(query: string, signal: AbortSignal): Promise<WikiResult> {
  // Wikipedia's REST endpoint accepts a page title path. Convert spaces
  // to underscores (its convention) and let it 404 for unknown topics.
  const title = query.trim().replace(/\s+/g, '_');
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new Error('not-found');
  if (!res.ok) throw new Error('http-error');
  const data = (await res.json()) as ApiResponse;
  // Disambiguation pages have an empty extract — treat as not-found so
  // the user retries with a more specific query.
  if (data.type === 'disambiguation' || !data.extract) throw new Error('not-found');
  return {
    title: data.title ?? query,
    extract: data.extract,
    url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
  };
}

export function ExploreDialog({ isOpen, onClose, initialQuery, onCite }: ExploreDialogProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState(initialQuery ?? '');
  const [activeQuery, setActiveQuery] = useState<string | null>(initialQuery);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'not-found' | 'error'>(
    initialQuery ? 'loading' : 'idle'
  );
  const [result, setResult] = useState<WikiResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInput(initialQuery ?? '');
      setActiveQuery(initialQuery);
      setStatus(initialQuery ? 'loading' : 'idle');
      setResult(null);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen || !activeQuery) return;
    const controller = new AbortController();
    setStatus('loading');
    setResult(null);
    explore(activeQuery, controller.signal)
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

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setActiveQuery(trimmed);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('dialogs.explore.title')}
      width={600}
      testId="explore-dialog"
      footer={
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div style={bodyWrapStyle}>
        <div style={lookupRowStyle}>
          <input
            type="text"
            placeholder={t('dialogs.explore.searchPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            data-testid="explore-input"
            style={inputStyle}
            autoFocus
          />
          <button
            type="button"
            style={primaryBtnStyle}
            data-testid="explore-search"
            disabled={input.trim().length === 0}
            onClick={submit}
          >
            {t('dialogs.explore.searchButton')}
          </button>
        </div>

        {status === 'loading' && (
          <PanelState
            kind="loading"
            message={t('dialogs.explore.loading', { query: activeQuery ?? '' })}
          />
        )}
        {status === 'not-found' && (
          <PanelState
            kind="error"
            message={t('dialogs.explore.notFound', { query: activeQuery ?? '' })}
            hint={t('dialogs.explore.notFoundHint')}
          />
        )}
        {status === 'error' && (
          <PanelState
            kind="error"
            message={t('dialogs.explore.errorMessage')}
            hint={t('dialogs.explore.errorHint')}
            onRetry={() => setActiveQuery((q) => (q ? `${q}` : q))}
          />
        )}
        {status === 'success' && result && (
          <>
            <span style={sourceLabelStyle}>{t('dialogs.explore.sourceLabel')}</span>
            <h3 style={titleStyle} data-testid="explore-result-title">
              {result.title}
            </h3>
            <p style={extractStyle} data-testid="explore-result-extract">
              {result.extract}
            </p>
            <div style={actionRowStyle}>
              <a
                style={linkStyle}
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                data-testid="explore-open-link"
              >
                {t('dialogs.explore.openLink')}
              </a>
              <button
                type="button"
                style={citeBtnStyle}
                data-testid="explore-cite"
                onClick={() => {
                  onCite(result.title, result.url);
                  onClose();
                }}
              >
                {t('dialogs.explore.citeThis')}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export default ExploreDialog;
