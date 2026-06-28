/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Share button + modal. The "start collaborating" entry point.
//
// Flow:
//   1. User clicks "Share for collaboration".
//   2. We mint a transient room on the collab server (POST /api/rooms)
//      and seed it with the current document bytes
//      (POST /api/rooms/{id}/seed).
//   3. We build a full URL: `${location.origin}/?room=${roomId}&backend=${ws}`.
//   4. Display in a modal with a copy-to-clipboard button.
//   5. On the same page, optionally redirect into collab mode by
//      navigating to the share URL so the local user joins
//      immediately too.
//
// The room + seed live on the Node CasualOffice/collab server, not the
// legacy Go gateway — joiners fetch the seed bytes on connect and the
// live Y.Doc (filename included, via its meta map) takes over once
// Hocuspocus sync completes.
//
// The modal is intentionally simple — no portal, no animations,
// just inline-styled markup so it doesn't require a CSS-in-JS
// layer or extra deps.
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export interface ShareDialogProps {
  /** Current document buffer (the bytes the user is editing). */
  documentBuffer: ArrayBuffer | null;
  /** Filename to seed the room with (the live Y.Doc meta map carries the
   *  canonical name to joiners once Hocuspocus sync completes). */
  fileName: string;
  /** Collab server REST base URL (its `/api/rooms` surface). */
  collabHttp: string;
  /** Collab ws URL the share URL should embed. */
  backendWs: string;
  open: boolean;
  onClose: () => void;
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '24px 28px',
    maxWidth: 460,
    width: '90%',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    fontSize: 17,
    fontWeight: 600,
    margin: 0,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    margin: '6px 0 20px 0',
    lineHeight: 1.5,
  },
  urlRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
    marginBottom: 16,
  },
  urlInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
    color: '#0f172a',
    background: '#f8fafc',
    outline: 'none',
  },
  copyBtn: {
    padding: '10px 16px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  copyBtnOk: {
    background: '#16a34a',
  },
  footerRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 13,
    color: '#475569',
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  errorBanner: {
    background: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    marginBottom: 16,
  },
  spinner: {
    border: '2px solid #e2e8f0',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    width: 18,
    height: 18,
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
  },
};

export function ShareDialog({
  documentBuffer,
  fileName,
  collabHttp,
  backendWs,
  open,
  onClose,
}: ShareDialogProps) {
  const [state, setState] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Kick off the upload as soon as the dialog opens.
  useEffect(() => {
    if (!open) {
      setState('idle');
      setShareUrl('');
      setErrorMsg('');
      setCopied(false);
      return;
    }
    if (!documentBuffer) {
      setErrorMsg('No document loaded yet.');
      setState('error');
      return;
    }
    setState('uploading');

    const mintRoom = async (): Promise<string> => {
      // 1. Create a fresh transient room. No password — a casual share
      //    link is open-by-URL; the room drains when everyone leaves.
      const createRes = await fetch(`${collabHttp}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!createRes.ok) {
        throw new Error(`HTTP ${createRes.status}: ${await createRes.text().catch(() => '')}`);
      }
      const { roomId } = (await createRes.json()) as { roomId: string };

      // 2. Seed the room with the current document bytes. Joiners GET
      //    these on connect to start from the same state; future edits
      //    flow through the Y.Doc.
      const formData = new FormData();
      const blob = new Blob([documentBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      formData.append('file', blob, fileName || 'Untitled.docx');
      const seedRes = await fetch(`${collabHttp}/api/rooms/${encodeURIComponent(roomId)}/seed`, {
        method: 'POST',
        body: formData,
      });
      if (!seedRes.ok) {
        throw new Error(`HTTP ${seedRes.status}: ${await seedRes.text().catch(() => '')}`);
      }
      return roomId;
    };

    mintRoom()
      .then((roomId) => {
        const url = new URL(window.location.origin);
        url.searchParams.set('room', roomId);
        url.searchParams.set('backend', backendWs);
        setShareUrl(url.toString());
        setState('ready');
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setState('error');
      });
  }, [open, documentBuffer, fileName, collabHttp, backendWs]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [shareUrl]);

  const joinNow = useCallback(() => {
    if (shareUrl) {
      window.location.href = shareUrl;
    }
  }, [shareUrl]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Share for collaboration</h3>
        <p style={styles.subtitle}>
          Anyone with this link can open the document and edit it live. The session lives only while
          someone has it open — when everyone leaves, the document is dropped.
        </p>

        {state === 'error' && <div style={styles.errorBanner}>{errorMsg}</div>}

        {state === 'uploading' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#64748b',
              fontSize: 13,
            }}
          >
            <span style={styles.spinner} />
            Preparing share link…
          </div>
        )}

        {state === 'ready' && (
          <>
            <div style={styles.urlRow}>
              <input
                style={styles.urlInput}
                value={shareUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                style={{ ...styles.copyBtn, ...(copied ? styles.copyBtnOk : {}) }}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <div style={styles.footerRow}>
              <button style={styles.secondaryBtn} onClick={onClose}>
                Stay in single-user mode
              </button>
              <button style={styles.primaryBtn} onClick={joinNow}>
                Join the session
              </button>
            </div>
          </>
        )}

        {state === 'error' && (
          <div style={styles.footerRow}>
            <button style={styles.secondaryBtn} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
