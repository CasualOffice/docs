/**
 * ChatPanel — right-docked chat surface for the on-device LLM.
 * Streams Llama-3.2-1B's reply tokens into the message bubble as
 * they arrive so the UX matches a hosted chat assistant. Optional
 * "Use document context" sends a truncated snapshot of the open
 * document as system context so the user can ask "what does this
 * doc say about …" / "summarise section 3" without copy-paste.
 *
 * Chat is gated on the Advanced LLM tier being loaded — the flan-t5
 * small model isn't conversational and would produce nonsense, so
 * the panel renders a hint pointing the user at the Writing
 * Assistant sheet when the LLM isn't resident.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { runChat, useWriterState } from '../lib/writer/controller';
import type { ChatMessage } from '../lib/writer/messages';

export interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Snapshot of the active doc, used when "Use doc context" is on. */
  getDocText: () => string;
  /**
   * Drop the assistant's reply into the doc at the user's current
   * cursor position as a tracked-change suggestion. The host wires
   * this through `applyInsertAsSuggestion` so the inserted text
   * lands underlined-green and survives the same Accept / Reject
   * review every other AI change does.
   */
  onInsertAtCursor: (text: string) => void;
}

const panelWidth = 380;

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'transparent',
  zIndex: 9000,
  pointerEvents: 'none',
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: panelWidth,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderLeft: '1px solid var(--doc-border, #e0e0e0)',
  boxShadow: '-2px 0 12px rgba(60,64,67,0.12)',
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'auto',
  zIndex: 9001,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
  flexShrink: 0,
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
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  color: 'var(--doc-text-muted, #6b7280)',
  fontSize: 12,
  textAlign: 'center',
  padding: 24,
  gap: 8,
};

const bubbleBase: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  maxWidth: '88%',
};

const userBubbleStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: 'flex-end',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  borderBottomRightRadius: 4,
};

const assistantBubbleStyle: CSSProperties = {
  ...bubbleBase,
  alignSelf: 'flex-start',
  background: 'var(--doc-surface-sunken, #f1f3f4)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  borderBottomLeftRadius: 4,
};

const ctxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--doc-text-muted, #6b7280)',
  padding: '4px 16px',
  borderBottom: '1px solid var(--doc-border, #e0e0e0)',
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 8,
  padding: '10px 12px',
  borderTop: '1px solid var(--doc-border, #e0e0e0)',
  flexShrink: 0,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  resize: 'none',
  minHeight: 36,
  maxHeight: 140,
  padding: '8px 10px',
  fontSize: 13,
  lineHeight: 1.4,
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 8,
  background: 'var(--doc-surface, white)',
  color: 'var(--doc-text-on-surface, #1f2937)',
  fontFamily: 'inherit',
};

const sendBtnStyle: CSSProperties = {
  padding: '7px 14px',
  fontSize: 13,
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid var(--doc-primary, #1a73e8)',
  background: 'var(--doc-primary, #1a73e8)',
  color: 'white',
  fontWeight: 500,
};

const stopBtnStyle: CSSProperties = {
  ...sendBtnStyle,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface, #1f2937)',
};

const subtleStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--doc-text-muted, #6b7280)',
  alignSelf: 'flex-start',
};

const SYSTEM_PROMPT =
  'You are a helpful writing assistant inside a .docx editor. Be concise, ' +
  "cite the user's document when relevant, and answer in plain prose. " +
  'Do not add meta-commentary about being an AI.';

function buildSystemPrompt(useDocContext: boolean, docText: string): string {
  if (!useDocContext) return SYSTEM_PROMPT;
  // Cap context to ~6 KB so the prompt fits Llama-3.2-1B's 128 K
  // context window comfortably and inference stays fast.
  const trimmed = docText.length > 6000 ? `${docText.slice(0, 6000)}\n[…truncated]` : docText;
  return `${SYSTEM_PROMPT}\n\nThe user is currently editing this document:\n\n"""\n${trimmed}\n"""`;
}

const msgActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 4,
  alignSelf: 'flex-start',
};

const msgActionBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--doc-border, #d1d5db)',
  background: 'transparent',
  color: 'var(--doc-text-on-surface-muted, #5f6368)',
  cursor: 'pointer',
};

export function ChatPanel({ isOpen, onClose, getDocText, onInsertAtCursor }: ChatPanelProps) {
  const writer = useWriterState();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [useDocContext, setUseDocContext] = useState(false);
  const [streaming, setStreaming] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const llmReady = useMemo(
    () =>
      writer.phase === 'ready' &&
      writer.loadedModelId !== null &&
      writer.enabledFeatures.includes('advanced-llm'),
    [writer.phase, writer.loadedModelId, writer.enabledFeatures]
  );

  // Auto-scroll on every history change / streaming chunk.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, streaming]);

  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    setStreaming('');
    setBusy(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy || !llmReady) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setInput('');
    setBusy(true);
    setStreaming('');
    const controller = new AbortController();
    abortRef.current = controller;
    const system: ChatMessage = {
      role: 'system',
      content: buildSystemPrompt(useDocContext, getDocText()),
    };
    try {
      const full = await runChat([system, ...nextHistory], {
        signal: controller.signal,
        onDelta: (chunk) => setStreaming((prev) => prev + chunk),
      });
      setHistory([...nextHistory, { role: 'assistant', content: full }]);
      setStreaming('');
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        setHistory([
          ...nextHistory,
          {
            role: 'assistant',
            content: `Error: ${e.message || 'Failed to reach the model.'}`,
          },
        ]);
      }
      setStreaming('');
    } finally {
      setBusy(false);
    }
  };

  const onStop = () => {
    abortRef.current?.abort();
    if (streaming) {
      // Persist whatever streamed so far so the user keeps the partial.
      setHistory((prev) => [...prev, { role: 'assistant', content: streaming }]);
      setStreaming('');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  return (
    <>
      <div style={overlayStyle} aria-hidden="true" />
      <aside role="complementary" aria-label="Ask AI" data-testid="chat-panel" style={panelStyle}>
        <div style={headerStyle}>
          <span aria-hidden="true">💬</span>
          <span style={titleStyle}>Ask AI</span>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={onClose}
            aria-label="Close"
            data-testid="chat-close"
          >
            ✕
          </button>
        </div>

        <label style={ctxRowStyle}>
          <input
            type="checkbox"
            checked={useDocContext}
            onChange={(e) => setUseDocContext(e.target.checked)}
            data-testid="chat-use-doc-context"
          />
          Use document context
        </label>

        <div ref={bodyRef} style={bodyStyle}>
          {!llmReady && (
            <div style={emptyStyle}>
              <strong>Chat needs the Advanced LLM tier.</strong>
              <span>
                Open the Writing Assistant from the rail and enable
                <em> Advanced (Llama-3.2-1B) </em>
                to start a conversation. ~880 MB one-time download.
              </span>
            </div>
          )}
          {llmReady && history.length === 0 && !streaming && (
            <div style={emptyStyle}>
              <strong>Ready when you are.</strong>
              <span>
                Ask anything about the open document, request rewrites, or brainstorm. Toggle "Use
                document context" above to send the doc text along with your question.
              </span>
            </div>
          )}
          {history.map((m, i) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                <div
                  style={isUser ? userBubbleStyle : assistantBubbleStyle}
                  data-testid={`chat-msg-${m.role}`}
                >
                  {m.content}
                </div>
                {!isUser && m.content.trim() && (
                  <div style={msgActionsStyle}>
                    <button
                      type="button"
                      style={msgActionBtnStyle}
                      onClick={() => onInsertAtCursor(m.content)}
                      title="Insert this reply at the cursor as a tracked suggestion"
                      data-testid={`chat-msg-insert-${i}`}
                    >
                      ↩ Insert
                    </button>
                    <button
                      type="button"
                      style={msgActionBtnStyle}
                      onClick={() => void navigator.clipboard?.writeText(m.content).catch(() => {})}
                      data-testid={`chat-msg-copy-${i}`}
                    >
                      ⧉ Copy
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {streaming && (
            <div style={assistantBubbleStyle} data-testid="chat-msg-streaming">
              {streaming}
              <span style={{ opacity: 0.4 }}>▍</span>
            </div>
          )}
          {busy && !streaming && <div style={subtleStyle}>Thinking…</div>}
        </div>

        <div style={inputRowStyle}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              llmReady
                ? 'Ask anything… (Enter to send, Shift+Enter for newline)'
                : 'LLM not loaded.'
            }
            disabled={!llmReady || busy}
            style={textareaStyle}
            rows={1}
            data-testid="chat-input"
          />
          {busy ? (
            <button type="button" style={stopBtnStyle} onClick={onStop} data-testid="chat-stop">
              Stop
            </button>
          ) : (
            <button
              type="button"
              style={sendBtnStyle}
              onClick={() => void onSend()}
              disabled={!llmReady || !input.trim()}
              data-testid="chat-send"
            >
              Send
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default ChatPanel;
