/**
 * WritingAssistantSheet — right-docked panel that exposes the on-
 * device writing assistant: per-feature toggles, device capability
 * readout, download progress, consent flow, and the model cache
 * control.
 *
 * See `docs/internal/10-writing-assistant-design.md` § 9.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import {
  bootWriterController,
  dismissConsent,
  disableFeature,
  enableFeature,
  featureSupport,
  recordConsent,
  setAdvancedOpen,
  setAutoLoad,
  useWriterState,
  type WriterState,
} from '../../lib/writer/controller';
import { FEATURES, type FeatureId, type FeatureSpec } from '../../lib/writer/registry';
import { clearCachedModels } from '../../lib/writer/storage';

export interface WritingAssistantSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const sheetWidth = 360;

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'transparent',
  zIndex: 9000,
  pointerEvents: 'none',
};

const sheetStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: sheetWidth,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
  boxShadow: '-2px 0 12px rgba(60,64,67,0.12)',
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
  transition: 'transform 0.18s ease',
  zIndex: 9001,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
};

const titleStyle: CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
};

const closeBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: 4,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  color: 'var(--doc-text-muted, #6b7280)',
  margin: '0 0 6px',
};

const introStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  margin: 0,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--doc-border, #e0e0e0)',
  background: 'var(--doc-surface, white)',
};

const rowDisabledStyle: CSSProperties = {
  ...rowStyle,
  opacity: 0.55,
};

const checkboxStyle: CSSProperties = {
  marginTop: 2,
  flexShrink: 0,
};

const featureLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  fontSize: 13,
};

const featureNameStyle: CSSProperties = {
  fontWeight: 500,
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const featureMetaStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
};

const subtleStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-muted, #6b7280)',
};

const advancedToggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  cursor: 'pointer',
  fontSize: 12,
  padding: 0,
};

const footerStyle: CSSProperties = {
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  padding: '10px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const statusBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 99,
  background: 'var(--doc-bg-hover, #f1f3f4)',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const consentOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9100,
};

const consentDialogStyle: CSSProperties = {
  width: 420,
  maxWidth: '90vw',
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderRadius: 8,
  padding: 20,
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
};

const btnRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 14,
};

const secondaryBtnStyle: CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderRadius: 4,
  cursor: 'pointer',
};

const primaryBtnStyle: CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
};

const progressBarStyle: CSSProperties = {
  height: 4,
  background: 'var(--doc-border, #e0e0e0)',
  borderRadius: 2,
  overflow: 'hidden',
  marginTop: 6,
};

function progressFillStyle(progress: number): CSSProperties {
  return {
    height: '100%',
    width: `${Math.max(2, Math.min(100, progress * 100))}%`,
    background: 'var(--doc-primary, #1a73e8)',
    transition: 'width 0.15s linear',
  };
}

export function WritingAssistantSheet({ isOpen, onClose }: WritingAssistantSheetProps) {
  const state = useWriterState();
  const [pendingFeature, setPendingFeature] = useState<FeatureId | null>(null);
  const [busyId, setBusyId] = useState<FeatureId | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void bootWriterController();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleFeature = async (feature: FeatureSpec, checked: boolean) => {
    if (busyId) return;
    setBusyId(feature.id);
    try {
      if (checked) {
        if (!state.consented) {
          setPendingFeature(feature.id);
          await enableFeature(feature.id, { skipConsentCheck: false });
        } else {
          await enableFeature(feature.id, { skipConsentCheck: true });
        }
      } else {
        await disableFeature(feature.id);
      }
    } catch {
      // Errors surface via the state machine; nothing to render here.
    } finally {
      setBusyId(null);
    }
  };

  const onConsentAccept = async () => {
    recordConsent();
    if (pendingFeature) {
      await enableFeature(pendingFeature, { skipConsentCheck: true });
    }
    setPendingFeature(null);
  };

  const onConsentCancel = () => {
    dismissConsent();
    setPendingFeature(null);
  };

  return (
    <>
      <div style={overlayStyle} aria-hidden="true" />
      <aside
        role="complementary"
        aria-label="Writing Assistant"
        data-testid="writing-assistant-sheet"
        style={sheetStyle}
      >
        <div style={headerStyle}>
          <span style={titleStyle}>Writing Assistant</span>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={onClose}
            aria-label="Close Writing Assistant"
            data-testid="writer-sheet-close"
          >
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          <p style={introStyle}>
            Runs entirely in your browser. Your document is never sent to a server.
          </p>

          <FeatureSection
            title="Features"
            features={FEATURES.filter((f) => !f.advanced)}
            state={state}
            busyId={busyId}
            onToggle={toggleFeature}
          />

          <AdvancedSection
            features={FEATURES.filter((f) => f.advanced)}
            state={state}
            busyId={busyId}
            onToggle={toggleFeature}
          />

          <DeviceSection state={state} />

          <StatusSection state={state} />
        </div>

        <div style={footerStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={state.autoLoad}
              onChange={(e) => setAutoLoad(e.target.checked)}
              data-testid="writer-autoload"
            />
            Re-enable automatically next time
          </label>
          <button
            type="button"
            style={secondaryBtnStyle}
            data-testid="writer-clear-cache"
            onClick={() => void clearCachedModels()}
          >
            Clear cached models
          </button>
        </div>
      </aside>

      {state.phase === 'confirming' && pendingFeature && (
        <ConsentDialog onAccept={onConsentAccept} onCancel={onConsentCancel} />
      )}
    </>
  );
}

function FeatureSection({
  title,
  features,
  state,
  busyId,
  onToggle,
}: {
  title: string;
  features: FeatureSpec[];
  state: WriterState;
  busyId: FeatureId | null;
  onToggle: (f: FeatureSpec, checked: boolean) => void;
}) {
  return (
    <section>
      <p style={sectionHeadingStyle}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {features.map((f) => (
          <FeatureRow
            key={f.id}
            feature={f}
            state={state}
            busy={busyId === f.id}
            onToggle={(c) => onToggle(f, c)}
          />
        ))}
      </div>
    </section>
  );
}

function AdvancedSection({
  features,
  state,
  busyId,
  onToggle,
}: {
  features: FeatureSpec[];
  state: WriterState;
  busyId: FeatureId | null;
  onToggle: (f: FeatureSpec, checked: boolean) => void;
}) {
  return (
    <section>
      <button
        type="button"
        style={advancedToggleStyle}
        onClick={() => setAdvancedOpen(!state.advancedOpen)}
        data-testid="writer-advanced-toggle"
        aria-expanded={state.advancedOpen}
      >
        <span aria-hidden="true">{state.advancedOpen ? '▾' : '▸'}</span>
        Advanced (off by default)
      </button>
      {state.advancedOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {features.map((f) => (
            <FeatureRow
              key={f.id}
              feature={f}
              state={state}
              busy={busyId === f.id}
              onToggle={(c) => onToggle(f, c)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FeatureRow({
  feature,
  state,
  busy,
  onToggle,
}: {
  feature: FeatureSpec;
  state: WriterState;
  busy: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const support = featureSupport(feature);
  const checked = state.enabledFeatures.includes(feature.id);
  const disabled = !support.supported || busy;
  const reason = support.reason ?? '';
  return (
    <label
      style={disabled ? rowDisabledStyle : rowStyle}
      title={!support.supported ? reason : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        style={checkboxStyle}
        data-testid={`writer-feature-${feature.id}`}
      />
      <span style={featureLabelStyle}>
        <span style={featureNameStyle}>{feature.label}</span>
        <span style={featureMetaStyle}>{feature.description}</span>
        <span style={subtleStyle}>
          {feature.sizeMb} MB · {feature.modelIds.length} model
          {feature.modelIds.length === 1 ? '' : 's'}
          {!support.supported && ` · ${reason}`}
        </span>
      </span>
    </label>
  );
}

function DeviceSection({ state }: { state: WriterState }) {
  const caps = state.capabilities;
  return (
    <section>
      <p style={sectionHeadingStyle}>Your device</p>
      {!caps && <p style={subtleStyle}>Detecting capabilities…</p>}
      {caps && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, lineHeight: 1.6 }}>
          <li>
            {caps.webgpu ? '✓' : '·'} WebGPU{' '}
            <span style={subtleStyle}>{caps.webgpu ? 'available' : 'unavailable'}</span>
          </li>
          <li>
            {caps.wasmSimd ? '✓' : '·'} WebAssembly SIMD{' '}
            <span style={subtleStyle}>{caps.wasmSimd ? 'available' : 'unavailable'}</span>
          </li>
          {caps.deviceMemoryGb !== null && (
            <li>
              · Device memory <span style={subtleStyle}>{caps.deviceMemoryGb} GB reported</span>
            </li>
          )}
          {caps.storageQuotaMb !== null && caps.storageUsedMb !== null && (
            <li>
              · Browser storage{' '}
              <span style={subtleStyle}>
                {Math.round(caps.storageUsedMb)} MB used of {Math.round(caps.storageQuotaMb)} MB
              </span>
            </li>
          )}
          <li>
            · Backend <span style={subtleStyle}>{caps.recommendedBackend}</span>
          </li>
          {caps.effectiveNet !== 'unknown' && (
            <li>
              · Network <span style={subtleStyle}>{caps.effectiveNet}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function StatusSection({ state }: { state: WriterState }) {
  return (
    <section>
      <p style={sectionHeadingStyle}>Status</p>
      <span style={statusBadgeStyle} data-testid="writer-status-badge">
        {renderStatusLabel(state)}
      </span>
      {state.phase === 'downloading' && (
        <div style={progressBarStyle} aria-label="Download progress">
          <div style={progressFillStyle(state.progress)} />
        </div>
      )}
      {state.phase === 'error' && state.errorMessage && (
        <p style={{ ...subtleStyle, marginTop: 6 }}>{state.errorMessage}</p>
      )}
    </section>
  );
}

function renderStatusLabel(state: WriterState): string {
  switch (state.phase) {
    case 'idle':
      return state.enabledFeatures.length === 0 ? 'No features enabled' : 'Ready to load on demand';
    case 'checking-caps':
      return 'Checking your device…';
    case 'confirming':
      return 'Waiting for confirmation';
    case 'downloading':
      return `Downloading… ${Math.round(state.progress * 100)}%`;
    case 'loading':
      return 'Loading model…';
    case 'ready':
      return state.lastInferenceMs !== null
        ? `Ready · last call ${state.lastInferenceMs} ms`
        : 'Ready';
    case 'busy':
      return 'Running…';
    case 'evicting':
      return 'Unloading model…';
    case 'error':
      return 'Paused — see message below';
  }
}

function ConsentDialog({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  return (
    <div
      style={consentOverlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Download writing assistant"
    >
      <div style={consentDialogStyle} data-testid="writer-consent-dialog">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Download writing assistant</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
          This downloads a ~95 MB model to your browser cache so the assistant can run on your
          device. Your document is never sent to a server.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 8, color: 'var(--doc-text-muted)' }}>
          The model is open-source (Apache-2.0).
        </p>
        <div style={btnRowStyle}>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={onCancel}
            data-testid="writer-consent-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            style={primaryBtnStyle}
            onClick={onAccept}
            data-testid="writer-consent-accept"
          >
            Download and continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default WritingAssistantSheet;
