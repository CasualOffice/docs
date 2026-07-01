/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocOpsPanel — AI document assistant backed by the JSON DocOps IR.
 *
 * Phase 0: in-process Anthropic tool loop, user-supplied API key
 * (stored in localStorage). Proves the full LLM → tool → PM loop
 * with zero server or Rust work.
 *
 * Architecture: the panel sends messages to the Anthropic API with the
 * DOCOPS_CATALOG tools attached. When the model calls a tool, the call
 * is routed through DocsBridge which reads/writes the PM doc. The loop
 * continues until stop_reason = 'end_turn'.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RightDockPanel } from '../components/RightDockPanel';
import { MaterialSymbol } from '../components/ui/Icons';
import type { DocsBridge } from './bridge';
import { DOCOPS_CATALOG } from '@casualoffice/docops';

// ── Anthropic wire types ───────────────────────────────────────────────────

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[] | string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

// ── Display message types ──────────────────────────────────────────────────

type DisplayMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool_step'; toolName: string; status: 'running' | 'done' | 'error' }
  | { kind: 'error'; text: string };

// ── Constants ─────────────────────────────────────────────────────────────

const API_KEY_STORAGE = 'casual_docops_api_key';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_ROUNDS = 12;

const SYSTEM_PROMPT = `You are DocOps, an AI document assistant embedded in Casual Docs.

You help users read and edit their .docx documents using a structured tool catalog.

Guidelines:
- Before making changes, read the document first (get_outline, get_doc_stats).
- Mutations are applied directly to the document and can be undone with Ctrl+Z.
- Keep responses short. Users want results, not lengthy explanations.
- If a write tool needs a selection, tell the user to select the text first.
- Never invent content about what's in the document — always call a read tool first.`;

// ── Styles ────────────────────────────────────────────────────────────────

const messagesStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const msgUserStyle: CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '85%',
  background: 'var(--doc-primary, #1a73e8)',
  color: '#fff',
  borderRadius: '12px 12px 2px 12px',
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  wordBreak: 'break-word',
};

const msgAssistantStyle: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '95%',
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  color: 'var(--doc-text)',
  border: '1px solid var(--doc-border-light)',
  borderRadius: '2px 12px 12px 12px',
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.55,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
};

const msgToolStyle: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11.5,
  color: 'var(--doc-text-muted)',
  padding: '2px 0',
};

const msgErrorStyle: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '95%',
  background: 'var(--doc-danger-bg, #fef2f2)',
  color: 'var(--doc-danger, #c62828)',
  border: '1px solid var(--doc-danger-border, #fca5a5)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  lineHeight: 1.45,
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '10px 12px',
  alignItems: 'flex-end',
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  lineHeight: 1.45,
  padding: '8px 10px',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 8,
  outline: 'none',
  resize: 'none',
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  font: 'inherit',
  maxHeight: 120,
  overflowY: 'auto',
};

const sendBtnStyle = (busy: boolean): CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  background: busy ? 'var(--doc-border, #d1d5db)' : 'var(--doc-primary, #1a73e8)',
  color: busy ? 'var(--doc-text-muted)' : '#fff',
  cursor: busy ? 'not-allowed' : 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 120ms',
});

const keySetupStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 16px',
};

const keyInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 8,
  outline: 'none',
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  font: 'inherit',
  boxSizing: 'border-box',
};

const saveBtnStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '7px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--doc-primary, #1a73e8)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

// ── Spinner ────────────────────────────────────────────────────────────────

const spinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  border: '2px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'docops-spin 0.7s linear infinite',
};

// ── Component ─────────────────────────────────────────────────────────────

export interface DocOpsPanelProps {
  bridge: DocsBridge;
  onClose: () => void;
}

export function DocOpsPanel({ bridge, onClose }: DocOpsPanelProps) {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [showKeySetup, setShowKeySetup] = useState(() => !localStorage.getItem(API_KEY_STORAGE));

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Anthropic conversation history (separate from display)
  const historyRef = useRef<AnthropicMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const appendDisplay = useCallback((msg: DisplayMessage) => {
    setDisplayMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastToolStep = useCallback((status: 'done' | 'error') => {
    setDisplayMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].kind === 'tool_step') {
          copy[i] = { ...(copy[i] as Extract<DisplayMessage, { kind: 'tool_step' }>), status };
          break;
        }
      }
      return copy;
    });
  }, []);

  const saveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setKeyDraft('');
    setShowKeySetup(false);
  }, [keyDraft]);

  const send = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || busy || !apiKey) return;

    setInputValue('');
    setBusy(true);

    appendDisplay({ kind: 'user', text });
    historyRef.current = [...historyRef.current, { role: 'user', content: text }];

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      let messages = [...historyRef.current];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: DOCOPS_CATALOG,
            messages,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? `API error ${res.status}`);
        }

        const data = (await res.json()) as AnthropicResponse;

        // Add full assistant response to history
        messages = [...messages, { role: 'assistant', content: data.content }];

        // Extract and display any text blocks
        for (const block of data.content) {
          if (block.type === 'text' && block.text.trim()) {
            appendDisplay({ kind: 'assistant', text: block.text });
          }
        }

        if (data.stop_reason !== 'tool_use') break;

        // Process tool calls
        const toolResults: AnthropicContentBlock[] = [];
        for (const block of data.content) {
          if (block.type !== 'tool_use') continue;

          appendDisplay({ kind: 'tool_step', toolName: block.name, status: 'running' });
          try {
            const result = await bridge.callTool(block.name, block.input);
            updateLastToolStep('done');
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            updateLastToolStep('error');
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({
                ok: false,
                code: 'UNSUPPORTED',
                message: err instanceof Error ? err.message : String(err),
                retryable: false,
              }),
            });
          }
        }

        messages = [...messages, { role: 'user', content: toolResults }];
      }

      historyRef.current = messages;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      appendDisplay({ kind: 'error', text: msg });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [inputValue, busy, apiKey, bridge, appendDisplay, updateLastToolStep]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setDisplayMessages([]);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const headerActions = (
    <>
      {displayMessages.length > 0 && (
        <button
          type="button"
          onClick={clearHistory}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--doc-text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '2px 6px',
            borderRadius: 4,
          }}
          title="Clear conversation"
          disabled={busy}
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowKeySetup((v) => !v)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--doc-text-muted)',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          display: 'inline-flex',
          alignItems: 'center',
        }}
        title={showKeySetup ? 'Back to chat' : 'API key settings'}
      >
        <MaterialSymbol name="settings" size={15} />
      </button>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes docops-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <RightDockPanel
        title="DocOps AI"
        icon={<MaterialSymbol name="auto_awesome" size={16} />}
        headerActions={headerActions}
        onClose={onClose}
        testId="docops-panel"
        footer={
          showKeySetup ? undefined : (
            <div style={inputRowStyle}>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={busy ? 'Working…' : 'Ask about your document… (Enter to send)'}
                rows={1}
                style={textareaStyle}
                disabled={busy}
                data-testid="docops-input"
              />
              {busy ? (
                <button
                  type="button"
                  style={sendBtnStyle(false)}
                  onClick={stop}
                  title="Stop"
                  data-testid="docops-stop"
                >
                  <MaterialSymbol name="close" size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  style={sendBtnStyle(!inputValue.trim())}
                  onClick={() => void send()}
                  disabled={!inputValue.trim()}
                  title="Send (Enter)"
                  data-testid="docops-send"
                >
                  <MaterialSymbol name="keyboard_arrow_right" size={16} />
                </button>
              )}
            </div>
          )
        }
      >
        {showKeySetup ? (
          <div style={keySetupStyle}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--doc-text)', lineHeight: 1.5 }}>
              DocOps uses the Anthropic API. Bring your own key — it&apos;s stored only in this
              browser&apos;s localStorage.
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey();
              }}
              placeholder={apiKey ? '••••••••  (key saved — paste new to replace)' : 'sk-ant-…'}
              style={keyInputStyle}
              autoFocus
              data-testid="docops-api-key-input"
            />
            <button
              type="button"
              style={saveBtnStyle}
              onClick={saveKey}
              disabled={!keyDraft.trim()}
            >
              Save key
            </button>
            {apiKey && (
              <button
                type="button"
                style={{
                  ...saveBtnStyle,
                  background: 'transparent',
                  color: 'var(--doc-danger, #c62828)',
                  border: '1px solid var(--doc-danger, #c62828)',
                  marginTop: 4,
                }}
                onClick={() => {
                  localStorage.removeItem(API_KEY_STORAGE);
                  setApiKey('');
                  setShowKeySetup(true);
                }}
              >
                Remove key
              </button>
            )}
          </div>
        ) : (
          <div style={messagesStyle}>
            {displayMessages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 16px',
                  color: 'var(--doc-text-muted)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <MaterialSymbol
                  name="auto_awesome"
                  size={28}
                  style={{ marginBottom: 8, opacity: 0.5 }}
                />
                <p style={{ margin: '8px 0 0' }}>
                  Ask anything about your document — outline, stats, styles, find text — or have it
                  convert a selection to a table or insert a TOC.
                </p>
              </div>
            )}

            {displayMessages.map((msg, i) => {
              if (msg.kind === 'user') {
                return (
                  <div key={i} style={msgUserStyle}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === 'assistant') {
                return (
                  <div key={i} style={msgAssistantStyle}>
                    {msg.text}
                  </div>
                );
              }
              if (msg.kind === 'tool_step') {
                return (
                  <div key={i} style={msgToolStyle}>
                    {msg.status === 'running' ? (
                      <span style={spinnerStyle} aria-hidden="true" />
                    ) : msg.status === 'done' ? (
                      <MaterialSymbol name="check" size={12} />
                    ) : (
                      <MaterialSymbol name="close" size={12} />
                    )}
                    <span>{TOOL_LABELS[msg.toolName] ?? msg.toolName}</span>
                  </div>
                );
              }
              if (msg.kind === 'error') {
                return (
                  <div key={i} style={msgErrorStyle}>
                    {msg.text}
                  </div>
                );
              }
              return null;
            })}

            {!apiKey && displayMessages.length === 0 && (
              <div
                style={{
                  margin: '0 0 8px',
                  padding: '10px 12px',
                  background: 'var(--doc-surface-sunken, #f8f9fa)',
                  border: '1px solid var(--doc-border-light)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--doc-text-muted)',
                }}
              >
                No API key saved. Click the settings icon above to add one.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </RightDockPanel>
    </>
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_outline: 'Reading outline…',
  get_selection: 'Reading selection…',
  get_doc_stats: 'Reading stats…',
  list_styles: 'Reading styles…',
  find_text: 'Searching…',
  convert_range_to_table: 'Converting to table…',
  insert_toc: 'Inserting TOC…',
};

export default DocOpsPanel;
