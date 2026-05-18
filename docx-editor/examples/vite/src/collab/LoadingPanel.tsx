// Centered card shown while the collab app fetches the seed doc.
// The Yjs sync plugin can't paint anything until the .docx has
// been loaded into the editor at least once, so we block on the
// fetch and surface a friendly progress state instead of letting
// the user stare at an empty page.
import type { CSSProperties } from 'react';

const styles: Record<string, CSSProperties> = {
  shell: {
    position: 'fixed',
    inset: 0,
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    minWidth: 280,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.08)',
    textAlign: 'center',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid #e2e8f0',
    borderTopColor: '#2563eb',
    borderRadius: '50%',
    margin: '0 auto 14px',
    animation: 'spin 0.8s linear infinite',
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: '#0f172a',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 6,
  },
};

export function LoadingPanel({ message = 'Joining session…' }: { message?: string }) {
  return (
    <div style={styles.shell}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.title}>{message}</p>
        <p style={styles.subtitle}>Loading the shared document…</p>
      </div>
    </div>
  );
}
