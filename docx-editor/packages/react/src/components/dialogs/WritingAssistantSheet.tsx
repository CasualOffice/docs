/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

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
import { RightDockPanel } from '../RightDockPanel';
import { MaterialSymbol } from '../ui/Icons';
import { useTranslation } from '../../i18n';

export interface WritingAssistantSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// Layout (root + header + close) moved to RightDockPanel — the sheet
// now docks with the same geometry as every other right-side panel
// (chat, AI suggestion, version history). Width is the canonical
// RIGHT_PANEL_WIDTH (340) from sidebar/constants.ts; the previous
// bespoke 360 was just one more drift point.

const bodyStyle: CSSProperties = {
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

// Toggle switch geometry — matches Google Material's small switch
// (36 × 20 track, 16 px handle). Lives inline rather than a separate
// component for P1 so we keep the diff focused; promoted to
// `components/ui/Toggle.tsx` once a second consumer appears.
const toggleTrackStyle: CSSProperties = {
  position: 'relative',
  width: 36,
  height: 20,
  borderRadius: 999,
  background: 'var(--doc-border, #d1d5db)',
  flexShrink: 0,
  marginTop: 2,
  transition: 'background-color var(--doc-anim-base)',
  cursor: 'pointer',
};

const toggleTrackOnStyle: CSSProperties = {
  ...toggleTrackStyle,
  background: 'var(--doc-primary, #1a73e8)',
};

const toggleHandleStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  left: 2,
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'white',
  boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08)',
  transition: 'transform var(--doc-anim-base)',
};

const toggleHandleOnStyle: CSSProperties = {
  ...toggleHandleStyle,
  transform: 'translateX(16px)',
};

const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
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
    transition: 'width var(--doc-anim-base)',
  };
}

export function WritingAssistantSheet({ isOpen, onClose }: WritingAssistantSheetProps) {
  const { t } = useTranslation();
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
    // `busyId` is a per-row guard so the same row's checkbox doesn't
    // double-fire mid-load. We deliberately let a different row toggle
    // through — they get queued by the controller's state machine.
    if (busyId === feature.id) return;
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

  const footer = (
    <div style={footerStyle}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={state.autoLoad}
          onChange={(e) => setAutoLoad(e.target.checked)}
          data-testid="writer-autoload"
        />
        {t('dialogs.writingAssistant.reenableAutoLabel')}
      </label>
      <button
        type="button"
        style={secondaryBtnStyle}
        data-testid="writer-clear-cache"
        onClick={() => void clearCachedModels()}
      >
        {t('dialogs.writingAssistant.clearCachedModels')}
      </button>
    </div>
  );

  return (
    <>
      <RightDockPanel
        title={t('dialogs.writingAssistant.panelTitle')}
        icon={<MaterialSymbol name="auto_awesome" size={16} />}
        onClose={onClose}
        testId="writing-assistant-sheet"
        ariaLabel={t('dialogs.writingAssistant.panelTitle')}
        footer={footer}
      >
        <div style={bodyStyle}>
          <p style={introStyle}>{t('dialogs.writingAssistant.intro')}</p>

          <FeatureSection
            title={t('dialogs.writingAssistant.featuresHeading')}
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
      </RightDockPanel>

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
  const { t } = useTranslation();
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
        {t('dialogs.writingAssistant.advancedToggle')}
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
  const { t } = useTranslation();
  const support = featureSupport(feature);
  const checked = state.enabledFeatures.includes(feature.id);
  const disabled = !support.supported || busy;
  const reason = support.reason ?? '';
  return (
    <label
      style={disabled ? rowDisabledStyle : rowStyle}
      title={!support.supported ? reason : undefined}
    >
      <span style={checked ? toggleTrackOnStyle : toggleTrackStyle} aria-hidden="true">
        <span style={checked ? toggleHandleOnStyle : toggleHandleStyle} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        style={visuallyHiddenStyle}
        data-testid={`writer-feature-${feature.id}`}
        aria-label={feature.label}
      />
      <span style={featureLabelStyle}>
        <span style={featureNameStyle}>{feature.label}</span>
        <span style={featureMetaStyle}>{feature.description}</span>
        <span style={subtleStyle}>
          {t('dialogs.writingAssistant.sizeAndModels', {
            size: feature.sizeMb,
            count: feature.modelIds.length,
          })}
          {!support.supported && ` · ${reason}`}
        </span>
        {checked && state.phase === 'downloading' && (
          <span style={subtleStyle} data-testid={`writer-progress-${feature.id}`}>
            {t('dialogs.writingAssistant.downloadingProgress', {
              percent: Math.round(state.progress * 100),
            })}
          </span>
        )}
        {checked && state.phase === 'loading' && (
          <span style={subtleStyle}>{t('dialogs.writingAssistant.loadingModel')}</span>
        )}
      </span>
    </label>
  );
}

function DeviceSection({ state }: { state: WriterState }) {
  const { t } = useTranslation();
  const caps = state.capabilities;
  return (
    <section>
      <p style={sectionHeadingStyle}>{t('dialogs.writingAssistant.deviceHeading')}</p>
      {!caps && <p style={subtleStyle}>{t('dialogs.writingAssistant.detectingCapabilities')}</p>}
      {caps && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, lineHeight: 1.6 }}>
          <li>
            {caps.webgpu ? '✓' : '·'} WebGPU{' '}
            <span style={subtleStyle}>
              {caps.webgpu
                ? t('dialogs.writingAssistant.available')
                : t('dialogs.writingAssistant.unavailable')}
            </span>
          </li>
          <li>
            {caps.wasmSimd ? '✓' : '·'} WebAssembly SIMD{' '}
            <span style={subtleStyle}>
              {caps.wasmSimd
                ? t('dialogs.writingAssistant.available')
                : t('dialogs.writingAssistant.unavailable')}
            </span>
          </li>
          {caps.deviceMemoryGb !== null && (
            <li>
              · {t('dialogs.writingAssistant.deviceMemoryLabel')}{' '}
              <span style={subtleStyle}>
                {t('dialogs.writingAssistant.deviceMemoryValue', { gb: caps.deviceMemoryGb })}
              </span>
            </li>
          )}
          {caps.storageQuotaMb !== null && caps.storageUsedMb !== null && (
            <li>
              · {t('dialogs.writingAssistant.browserStorageLabel')}{' '}
              <span style={subtleStyle}>
                {t('dialogs.writingAssistant.browserStorageValue', {
                  used: Math.round(caps.storageUsedMb),
                  total: Math.round(caps.storageQuotaMb),
                })}
              </span>
            </li>
          )}
          <li>
            · {t('dialogs.writingAssistant.backendLabel')}{' '}
            <span style={subtleStyle}>{caps.recommendedBackend}</span>
          </li>
          {caps.effectiveNet !== 'unknown' && (
            <li>
              · {t('dialogs.writingAssistant.networkLabel')}{' '}
              <span style={subtleStyle}>{caps.effectiveNet}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function StatusSection({ state }: { state: WriterState }) {
  const { t } = useTranslation();
  return (
    <section>
      <p style={sectionHeadingStyle}>{t('dialogs.writingAssistant.statusHeading')}</p>
      <span style={statusBadgeStyle} data-testid="writer-status-badge">
        {renderStatusLabel(state, t)}
      </span>
      {state.phase === 'downloading' && (
        <div
          style={progressBarStyle}
          aria-label={t('dialogs.writingAssistant.downloadProgressAriaLabel')}
        >
          <div style={progressFillStyle(state.progress)} />
        </div>
      )}
      {state.phase === 'error' && state.errorMessage && (
        <p style={{ ...subtleStyle, marginTop: 6 }}>{state.errorMessage}</p>
      )}
    </section>
  );
}

function renderStatusLabel(state: WriterState, t: ReturnType<typeof useTranslation>['t']): string {
  switch (state.phase) {
    case 'idle':
      return state.enabledFeatures.length === 0
        ? t('dialogs.writingAssistant.statusNoFeatures')
        : t('dialogs.writingAssistant.statusReadyToLoad');
    case 'checking-caps':
      return t('dialogs.writingAssistant.statusCheckingDevice');
    case 'confirming':
      return t('dialogs.writingAssistant.statusWaitingConfirmation');
    case 'downloading':
      return t('dialogs.writingAssistant.downloadingProgress', {
        percent: Math.round(state.progress * 100),
      });
    case 'loading':
      return t('dialogs.writingAssistant.loadingModel');
    case 'ready':
      return state.lastInferenceMs !== null
        ? t('dialogs.writingAssistant.statusReadyTiming', { ms: state.lastInferenceMs })
        : t('dialogs.writingAssistant.statusReady');
    case 'busy':
      return t('dialogs.writingAssistant.statusRunning');
    case 'evicting':
      return t('dialogs.writingAssistant.statusUnloadingModel');
    case 'error':
      return t('dialogs.writingAssistant.statusPaused');
  }
}

function ConsentDialog({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      style={consentOverlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogs.writingAssistant.consentTitle')}
    >
      <div style={consentDialogStyle} data-testid="writer-consent-dialog">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {t('dialogs.writingAssistant.consentTitle')}
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
          {t('dialogs.writingAssistant.consentBody')}
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 8, color: 'var(--doc-text-muted)' }}>
          {t('dialogs.writingAssistant.consentLicense')}
        </p>
        <div style={btnRowStyle}>
          <button
            type="button"
            style={secondaryBtnStyle}
            onClick={onCancel}
            data-testid="writer-consent-cancel"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            style={primaryBtnStyle}
            onClick={onAccept}
            data-testid="writer-consent-accept"
          >
            {t('dialogs.writingAssistant.downloadAndContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WritingAssistantSheet;
