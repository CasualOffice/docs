/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocOpsPanel — AI document assistant backed by the JSON DocOps IR.
 *
 * Phase 0: in-process Anthropic tool loop, user-supplied API key.
 * Phase 2: pluggable transport (DirectTransport / CollabTransport /
 *           DesktopTransport) — the panel no longer calls Anthropic
 *           directly; it delegates to whatever transport is passed in.
 *
 * Architecture: the panel sends messages via the transport with the
 * DOCOPS_CATALOG tools. When the model calls a tool, DocsBridge
 * reads/writes the PM doc. The loop continues until stop_reason =
 * 'end_turn'.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RightDockPanel } from '../components/RightDockPanel';
import { MaterialSymbol } from '../components/ui/Icons';
import { useTranslation, type TranslationKey } from '../i18n';
import type { DocsBridge } from './bridge';
import {
  DOCOPS_CATALOG,
  runAgent,
  type AgentEvent,
  type AgentTask,
  type McpClient,
  type ToolSource,
} from '@casualoffice/docops';
import {
  createAgentRegistry,
  createMcpClient,
  friendlyLlmError,
  transportLlm,
} from './agentRuntime';
import {
  DirectTransport,
  type DocOpsTransport,
  type LlmCallPayload,
  type ToolExecutor,
} from './transport';
import { setWorkspaceDocs } from './workspaceStore';

/** The desktop shell exposes Tauri's invoke on the top-level window; returns it
 *  when running inside Casual Desktop, else null (web / iframe). */
function desktopInvoke():
  | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>)
  | null {
  const inv = (
    window as {
      __TAURI__?: {
        core?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<unknown> };
      };
    }
  ).__TAURI__?.core?.invoke;
  return typeof inv === 'function' ? inv : null;
}

interface McpServerState {
  id: string;
  url: string;
  status: 'connecting' | 'connected' | 'error';
  toolCount: number;
  source: McpClient | null;
  error?: string;
}

// ── LLM wire types (messages-API shape) ───────────────────────────────────

type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContentBlock[] | string;
}

interface LlmResponse {
  content: LlmContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

// ── Display message types ──────────────────────────────────────────────────

type DisplayMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool_step'; toolName: string; status: 'running' | 'done' | 'error' }
  | { kind: 'error'; text: string }
  | { kind: 'cap'; rounds: number }
  | { kind: 'plan'; tasks: AgentTask[] };

// ── Constants ─────────────────────────────────────────────────────────────

export const API_KEY_STORAGE = 'casual_docops_api_key';
const MCP_STORAGE = 'casual_docops_mcp_servers';
const MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOOL_ROUNDS = 12;

type StoredMcp = { url: string; token?: string };

/** Configured MCP servers persist across reloads (URL + optional auth token). */
function loadStoredMcp(): StoredMcp[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MCP_STORAGE) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((s): s is StoredMcp => !!s && typeof s.url === 'string')
      : [];
  } catch {
    return [];
  }
}
function saveStoredMcp(list: StoredMcp[]): void {
  try {
    localStorage.setItem(MCP_STORAGE, JSON.stringify(list));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

const SYSTEM_PROMPT = `You are DocOps, an AI assistant inside a .docx editor.

IMPORTANT: You do not have the document text. It is not in this chat. You are the one who calls tools — the user never runs tools. When you need information about the document, YOU emit a <tool_call> block and the editor runs it and returns the result to you.

Read tools (inspect the document — never mutate):
- search_document(query) — returns the passages most relevant to the query, each with its heading path and blockIds. Use this to summarize, describe, or answer questions — it works on documents of any length.
- search_workspace(query) — searches the user's OTHER local files (when a folder is open), returning passages tagged with their source file to cite. Use for questions that span multiple documents.
- get_doc_stats() — word/paragraph/table/image counts + a short preview (NOT the full text).
- get_outline() — returns the heading tree.
- get_selection() — returns the user's currently selected text.
- find_text(query) — exact-phrase search; returns blockIds + snippets.
- list_styles() — lists paragraph styles and fonts used.

Write tools — direct edits (immediately visible):
- convert_range_to_table — user must have the text selected first
- insert_toc — inserts at the cursor position

Write tools — suggestion mode (user reviews in the sidebar):
- suggest_text_change, set_paragraph_style, add_comment, rewrite_selection (call get_selection first), delete_paragraphs (pass paraIds from get_outline/find_text), insert_paragraph_after, harmonize_styles (call list_styles first), insert_report_from_data, create_document (call get_doc_stats first, confirm wordCount === 0)

Rules:
- To summarize, describe, or answer ANY question about the document, your VERY FIRST response must be a <tool_call> for search_document with a query built from the user's request. Do not write prose first. Do not ask the user to do anything. Do not assume or invent the document's content.
- Emit exactly this and nothing else, then stop (replace the query with the topic asked about; for a whole-document summary use the main subject or "overview"):
<tool_call>
{"name": "search_document", "arguments": {"query": "overview main topics"}}
</tool_call>
- After the tool result arrives, write a short, plain-language answer grounded only in the retrieved passages.
- Always read before you write. For suggest_text_change the search text must be exact (case-sensitive) — call find_text first. For rewrite_selection, call get_selection first.
- Tracked changes appear in the comments sidebar — tell the user to open it to review.
- Keep responses short. Users want results, not explanations.`;

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

const msgCapStyle: CSSProperties = {
  alignSelf: 'center',
  fontSize: 11.5,
  color: 'var(--doc-text-muted)',
  padding: '3px 10px',
  borderRadius: 6,
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  border: '1px solid var(--doc-border-light)',
};

const msgPlanStyle: CSSProperties = {
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  border: '1px solid var(--doc-border-light)',
};

const msgPlanTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--doc-text-muted)',
  marginBottom: 2,
};

const planPendingDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  border: '1.5px solid var(--doc-text-muted, #9aa0a6)',
  flexShrink: 0,
};

const msgPlanTaskStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--doc-text)',
};

const agentToggleRowStyle: CSSProperties = {
  display: 'flex',
  padding: '4px 12px 0',
};

const agentToggleStyle = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11.5,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  cursor: 'pointer',
  color: active ? '#fff' : 'var(--doc-text-muted)',
  background: active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-surface-sunken, #f8f9fa)',
  border: `1px solid ${active ? 'var(--doc-primary, #1a73e8)' : 'var(--doc-border-light)'}`,
});

const mcpAddBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11.5,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  cursor: 'pointer',
  color: 'var(--doc-text-muted)',
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  border: '1px solid var(--doc-border-light)',
  marginLeft: 6,
};

const mcpSectionStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '4px 12px 0',
};

const mcpChipStyle = (status: 'connecting' | 'connected' | 'error'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 6,
  color: status === 'error' ? 'var(--doc-danger, #c62828)' : 'var(--doc-text-muted)',
  background: 'var(--doc-surface-sunken, #f8f9fa)',
  border: '1px solid var(--doc-border-light)',
});

const mcpRemoveStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  color: 'inherit',
  opacity: 0.7,
};

const mcpInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 200,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--doc-border-light)',
  background: 'var(--doc-surface, #fff)',
  color: 'var(--doc-text)',
};

const inputRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '10px 12px',
  alignItems: 'flex-end',
};

// One-tap prompts for the most common document actions, so the panel isn't a
// blank chat box. Each seeds a natural-language prompt the model + DocOps tool
// catalog (summarize, rewrite_selection, convert-to-table, outline/TOC) handle.
const QUICK_ACTIONS: ReadonlyArray<{ id: string; labelKey: TranslationKey; prompt: string }> = [
  {
    id: 'summarize',
    labelKey: 'docops.quickActions.summarizeLabel',
    prompt: 'Summarize this document in a few clear sentences.',
  },
  {
    id: 'rewrite',
    labelKey: 'docops.quickActions.rewriteLabel',
    prompt: 'Rewrite the currently selected text to be clearer and more polished.',
  },
  {
    id: 'table',
    labelKey: 'docops.quickActions.tableLabel',
    prompt: 'Convert the currently selected text into a well-structured table.',
  },
  {
    id: 'outline',
    labelKey: 'docops.quickActions.outlineLabel',
    prompt: 'Give me a concise outline of this document.',
  },
];

/** Parse a GitHub-flavored markdown table into columns + rows for insertion. */
function parseMarkdownTable(md: string): { columns: string[]; rows: string[][] } | null {
  const cellLines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  if (cellLines.length < 2) return null;
  const cells = (l: string): string[] =>
    l
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const columns = cells(cellLines[0]);
  const rows = cellLines
    .slice(1)
    .filter((l) => !/^[\s|:-]+$/.test(l)) // drop the |---| separator row(s)
    .map(cells);
  if (!columns.length || !rows.length) return null;
  return { columns, rows };
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  padding: '8px 12px 0',
};

const chipStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  padding: '5px 10px',
  border: '1px solid var(--doc-border, #d1d5db)',
  borderRadius: 999,
  background: 'var(--doc-surface, #ffffff)',
  color: 'var(--doc-text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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
  /** LLM transport — defaults to DirectTransport (browser fetch to Anthropic). */
  transport?: DocOpsTransport;
  /**
   * Maximum number of LLM tool-call rounds per message before the loop is
   * stopped and the user is notified. Defaults to 12.
   */
  maxToolRounds?: number;
}

export function DocOpsPanel({
  bridge,
  onClose,
  transport: transportProp,
  maxToolRounds: maxToolRoundsProp,
}: DocOpsPanelProps) {
  const { t } = useTranslation();
  const transport = transportProp ?? new DirectTransport();
  const maxToolRounds = maxToolRoundsProp ?? DEFAULT_MAX_TOOL_ROUNDS;
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  // Show setup screen only for transports that require a key AND none is stored.
  const [showKeySetup, setShowKeySetup] = useState(
    () => transport.requiresApiKey && !localStorage.getItem(API_KEY_STORAGE)
  );

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);
  // Agent mode: plan → execute → reflect instead of a single tool-loop reply.
  // Opt-in via the toggle; only available when the panel drives the loop
  // (Direct/Desktop, not collab where the server owns the loop).
  const [agentMode, setAgentMode] = useState(false);
  // External MCP servers whose tools join the agent's registry.
  const [mcpServers, setMcpServers] = useState<McpServerState[]>([]);
  const [mcpUrlDraft, setMcpUrlDraft] = useState('');
  const [mcpTokenDraft, setMcpTokenDraft] = useState('');
  const [showMcpAdd, setShowMcpAdd] = useState(false);

  // On-device workspace RAG (desktop only): { count, folder } once a local
  // folder is indexed; null otherwise. 'indexing' while the picker/read runs.
  const [workspace, setWorkspace] = useState<{ count: number; folder: string } | null>(null);
  const [indexingWorkspace, setIndexingWorkspace] = useState(false);
  const canIndexWorkspace = !!desktopInvoke();

  const indexWorkspace = useCallback(async () => {
    const invoke = desktopInvoke();
    if (!invoke || indexingWorkspace) return;
    setIndexingWorkspace(true);
    try {
      const folder = (await invoke('pick_workspace_folder')) as string | null;
      if (!folder) return; // dismissed
      const docs = (await invoke('read_workspace_folder', { path: folder })) as {
        id: string;
        name: string;
        text: string;
      }[];
      setWorkspaceDocs(docs);
      const folderName = folder.split(/[\\/]/).pop() || folder;
      setWorkspace(docs.length ? { count: docs.length, folder: folderName } : null);
    } catch {
      /* dialog cancelled or read failed — leave the current workspace as-is */
    } finally {
      setIndexingWorkspace(false);
    }
  }, [indexingWorkspace]);

  const clearWorkspaceFolder = useCallback(() => {
    setWorkspaceDocs([]);
    setWorkspace(null);
  }, []);

  const connectMcp = useCallback(
    async (rawUrl: string, rawToken?: string, persist = true) => {
      const url = rawUrl.trim();
      if (!url) return;
      const id = `mcp:${url}`;
      if (mcpServers.some((s) => s.id === id)) return;
      const token = rawToken?.trim();
      // On the web, browsers can't reach most external MCP servers (no CORS), so
      // route through the same-origin collab proxy. On desktop the Tauri webview
      // fetches cross-origin freely, so connect directly.
      const proxyUrl = desktopInvoke() ? undefined : '/api/mcp-proxy';
      const client = createMcpClient(
        url,
        id,
        token ? { Authorization: `Bearer ${token}` } : undefined,
        proxyUrl
      );
      setMcpServers((prev) => [
        ...prev,
        { id, url, status: 'connecting', toolCount: 0, source: client },
      ]);
      setMcpUrlDraft('');
      setMcpTokenDraft('');
      setShowMcpAdd(false);
      // Persist so the server reconnects on reload (token included if given).
      if (persist) {
        const stored = loadStoredMcp();
        if (!stored.some((s) => s.url === url)) {
          saveStoredMcp([...stored, { url, token: token || undefined }]);
        }
      }
      try {
        const tools = await client.listTools();
        setMcpServers((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, status: 'connected', toolCount: tools.length } : s
          )
        );
      } catch (err) {
        setMcpServers((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }
              : s
          )
        );
      }
    },
    [mcpServers]
  );

  const removeMcp = useCallback((id: string) => {
    setMcpServers((prev) => {
      const target = prev.find((s) => s.id === id);
      target?.source?.close();
      if (target) saveStoredMcp(loadStoredMcp().filter((s) => s.url !== target.url));
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  // Reconnect persisted MCP servers on mount.
  useEffect(() => {
    for (const s of loadStoredMcp()) void connectMcp(s.url, s.token, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Label for the "thinking" row shown while the (non-streaming) model runs,
  // so the user sees progress between click and reply.
  const [thinkingLabel, setThinkingLabel] = useState(t('docops.thinkingDefault'));

  // Anthropic conversation history (separate from display)
  const historyRef = useRef<LlmMessage[]>([]);
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

  // Mutate the tasks in the most recent 'plan' message (the live agent plan).
  const updatePlan = useCallback((mutate: (tasks: AgentTask[]) => AgentTask[]) => {
    setDisplayMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].kind === 'plan') {
          const msg = copy[i] as Extract<DisplayMessage, { kind: 'plan' }>;
          copy[i] = { ...msg, tasks: mutate(msg.tasks) };
          break;
        }
      }
      return copy;
    });
  }, []);

  // Translate the agent's event stream into the panel's display messages.
  const handleAgentEvent = useCallback(
    (ev: AgentEvent) => {
      switch (ev.type) {
        case 'plan':
          appendDisplay({ kind: 'plan', tasks: ev.tasks });
          break;
        case 'task-start':
          updatePlan((tasks) =>
            tasks.map((t) => (t.id === ev.taskId ? { ...t, status: 'running' } : t))
          );
          break;
        case 'task-tool':
          if (ev.status === 'running')
            appendDisplay({ kind: 'tool_step', toolName: ev.tool, status: 'running' });
          else updateLastToolStep(ev.status);
          break;
        case 'task-end':
          updatePlan((tasks) =>
            tasks.map((t) => (t.id === ev.taskId ? { ...t, status: ev.status } : t))
          );
          break;
        case 'reflect':
          if (ev.note) appendDisplay({ kind: 'assistant', text: ev.note });
          if (ev.addedTasks.length) updatePlan((tasks) => [...tasks, ...ev.addedTasks]);
          break;
        case 'error':
          appendDisplay({ kind: 'error', text: ev.message });
          break;
        // 'done' → the summary is appended by the caller.
      }
    },
    [appendDisplay, updateLastToolStep, updatePlan]
  );

  const saveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setKeyDraft('');
    setShowKeySetup(false);
  }, [keyDraft]);

  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? inputValue).trim();
      if (!text || busy) return;
      // Block send if key is required and missing — but tell the user why and
      // reopen the key setup, instead of a silent dead no-op.
      if (transport.requiresApiKey && !apiKey) {
        appendDisplay({ kind: 'error', text: t('docops.apiKeyRequiredError') });
        setShowKeySetup(true);
        return;
      }

      setInputValue('');
      setThinkingLabel(t('docops.thinkingDefault'));
      setBusy(true);

      appendDisplay({ kind: 'user', text });
      historyRef.current = [...historyRef.current, { role: 'user', content: text }];

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        if (agentMode && !transport.drivesLoop) {
          // ── Agent mode: plan → execute → reflect ─────────────────────────
          // The panel-driven agent decomposes the goal, runs each sub-task
          // through the tool loop, and reflects. Built-in DocOps tools plus any
          // external MCP tools flow through one ToolRegistry.
          const mcpSources = mcpServers
            .filter((s) => s.status === 'connected' && s.source)
            .map((s) => s.source as ToolSource);
          const registry = createAgentRegistry(bridge, mcpSources);
          const llm = transportLlm(transport, { model: MODEL, apiKey: apiKey || undefined });
          // Ground the planner with the heading outline so it plans against the
          // real document structure.
          let planningContext: string | undefined;
          try {
            const outline = await bridge.callTool('get_outline', {});
            if (outline.ok && outline.data)
              planningContext = JSON.stringify(outline.data).slice(0, 1500);
          } catch {
            /* outline is best-effort context */
          }
          const result = await runAgent(
            text,
            { llm, registry },
            { signal: ctrl.signal, onEvent: handleAgentEvent, planningContext }
          );
          if (result.summary) {
            appendDisplay({ kind: 'assistant', text: result.summary });
            historyRef.current = [
              ...historyRef.current,
              { role: 'assistant', content: result.summary },
            ];
          }
        } else if (transport.drivesLoop) {
          // ── Collab transport: server holds the LLM loop ──────────────────
          // tool_call messages are routed back over WS; we execute via
          // DocsBridge and return the results to the server.
          const toolExecutor: ToolExecutor = async (toolName, args) => {
            appendDisplay({ kind: 'tool_step', toolName, status: 'running' });
            try {
              const result = await bridge.callTool(toolName, args);
              updateLastToolStep('done');
              return result;
            } catch (err) {
              updateLastToolStep('error');
              throw err;
            }
          };

          const payload: LlmCallPayload = {
            model: MODEL,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: historyRef.current,
            tools: DOCOPS_CATALOG,
            apiKey: apiKey || undefined,
            signal: ctrl.signal,
            maxToolRounds,
            toolExecutor,
            onText: (text) => {
              if (text.trim()) appendDisplay({ kind: 'assistant', text });
            },
          };

          const { data, status, updatedHistory, capHit } = await transport.call(payload);

          if (status !== 200) {
            throw new Error(friendlyLlmError(status, data));
          }
          if (updatedHistory) historyRef.current = updatedHistory as LlmMessage[];
          if (capHit) appendDisplay({ kind: 'cap', rounds: maxToolRounds });
        } else {
          // ── Direct / Desktop transport: panel drives the loop ────────────
          let messages = [...historyRef.current];
          let panelCapHit = false;

          for (let round = 0; round < maxToolRounds; round++) {
            if (ctrl.signal.aborted) break;

            let streamedText = '';
            const payload: LlmCallPayload = {
              model: MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              messages,
              tools: DOCOPS_CATALOG,
              apiKey: apiKey || undefined,
              signal: ctrl.signal,
              maxToolRounds,
              onText: (tok) => {
                if (tok) {
                  streamedText += tok;
                  setStreamingText((prev) => prev + tok);
                }
              },
            };

            const { data, status } = await transport.call(payload);

            // Flush any streamed tokens as a single committed message,
            // then clear the in-flight indicator.
            if (streamedText.trim()) {
              appendDisplay({ kind: 'assistant', text: streamedText });
            }
            setStreamingText('');

            if (status !== 200) {
              throw new Error(friendlyLlmError(status, data));
            }

            const response = data as LlmResponse;
            const willContinue = response.stop_reason === 'tool_use';

            // Only persist tool_use blocks when we will follow them with
            // matching tool_result blocks this iteration. If the model emitted
            // tool_use but stopped for another reason (e.g. max_tokens), the
            // dangling tool_use would make every subsequent request 400 with
            // "tool_use ids were found without tool_result blocks". Strip them.
            const assistantContent = willContinue
              ? response.content
              : response.content.filter((block) => block.type !== 'tool_use');
            messages = [...messages, { role: 'assistant', content: assistantContent }];

            // Emit text blocks only when nothing was streamed via onText
            // (i.e. the transport returned a complete response at once).
            if (!streamedText) {
              for (const block of response.content) {
                if (block.type === 'text' && block.text.trim()) {
                  appendDisplay({ kind: 'assistant', text: block.text });
                }
              }
            }

            if (!willContinue) break;

            const toolResults: LlmContentBlock[] = [];
            for (const block of response.content) {
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

            if (round === maxToolRounds - 1) {
              panelCapHit = true;
            }
          }

          if (panelCapHit) appendDisplay({ kind: 'cap', rounds: maxToolRounds });
          historyRef.current = messages;
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : String(err);
        appendDisplay({ kind: 'error', text: msg });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [
      inputValue,
      busy,
      apiKey,
      transport,
      bridge,
      appendDisplay,
      updateLastToolStep,
      agentMode,
      handleAgentEvent,
      mcpServers,
    ]
  );

  // Quick actions bypass the tool-calling loop. A small local model can't
  // reliably orchestrate the 17-tool catalog (it ignores the "call get_doc_stats
  // first" instruction once the tool list gets long and hallucinates instead),
  // so we gather the context the action needs client-side — the editor already
  // has it — and send ONE completion with no tools. Robust regardless of model.
  const runQuickAction = useCallback(
    async (action: { id: string; labelKey: TranslationKey; prompt: string }) => {
      if (busy) return;
      if (transport.requiresApiKey && !apiKey) {
        appendDisplay({ kind: 'error', text: t('docops.apiKeyRequiredError') });
        return;
      }
      setThinkingLabel(
        action.id === 'rewrite'
          ? t('docops.quickActions.rewritingStatus')
          : action.id === 'table'
            ? t('docops.quickActions.buildingTableStatus')
            : action.id === 'summarize'
              ? t('docops.quickActions.summarizingStatus')
              : action.id === 'outline'
                ? t('docops.quickActions.outliningStatus')
                : t('docops.thinkingDefault')
      );
      setBusy(true);
      appendDisplay({ kind: 'user', text: t(action.labelKey) });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        let context = '';
        const readField = (res: unknown): string => {
          const d = (res as { data?: Record<string, unknown> })?.data ?? {};
          return String(d.text ?? d.selection ?? d.selectionText ?? '').trim();
        };
        if (action.id === 'summarize' || action.id === 'outline') {
          // RAG: retrieve representative passages (budget-bounded) instead of
          // dumping the whole document — grounds the answer and can't blow the
          // local model's context on a long doc. Broad query for a generic
          // summary; fall back to the doc preview if nothing matches.
          const search = await bridge.callTool('search_document', {
            query: 'overview summary introduction main points key findings results conclusion',
            k: 6,
          });
          const chunks =
            (search as { data?: { chunks?: Array<{ headingPath?: string[]; snippet?: string }> } })
              ?.data?.chunks ?? [];
          context = chunks
            .map(
              (c) =>
                (c.headingPath?.length ? c.headingPath.join(' › ') + '\n' : '') + (c.snippet ?? '')
            )
            .join('\n\n')
            .trim();
          if (!context) {
            const stats = (await bridge.callTool('get_doc_stats', {})) as {
              data?: { preview?: string };
            };
            context = String(stats?.data?.preview ?? '').trim();
          }
          if (!context) {
            appendDisplay({
              kind: 'assistant',
              text: t('docops.emptyDocumentError'),
            });
            return;
          }
        } else if (action.id === 'rewrite' || action.id === 'table') {
          context = readField(await bridge.callTool('get_selection', {}));
          if (!context) {
            appendDisplay({
              kind: 'assistant',
              text: t('docops.noSelectionError'),
            });
            return;
          }
        }
        const isTable = action.id === 'table';
        const isRewrite = action.id === 'rewrite';
        const system = isTable
          ? 'You convert content into a table. Output ONLY a GitHub-flavored markdown table: a header row, a |---| separator row, then data rows. No preamble, no commentary. Do NOT translate — keep every term exactly as written in the source.'
          : isRewrite
            ? 'You are a writing assistant. Rewrite the provided text per the instruction. Output ONLY the rewritten text — no preamble, no quotes, no commentary. Do NOT translate; keep the original language.'
            : 'You are a concise writing assistant inside a document editor. Follow the instruction using only the content provided below it. Return plain text only — no preamble, no markdown code fences. Do NOT translate any content.';
        const userMsg = context ? `${action.prompt}\n\n--- CONTENT ---\n${context}` : action.prompt;
        let streamed = '';
        const { data, status } = await transport.call({
          model: MODEL,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: userMsg }],
          tools: [],
          apiKey: apiKey || undefined,
          signal: ctrl.signal,
          onText: (t) => {
            if (t) {
              streamed += t;
              setStreamingText((p) => p + t);
            }
          },
        });
        setStreamingText('');
        if (status !== 200) {
          const e = (data as { error?: { message?: string } })?.error?.message;
          throw new Error(e ?? `AI error ${status}`);
        }
        let text = streamed.trim();
        if (!text) {
          const content = (data as { content?: Array<{ type: string; text?: string }> })?.content;
          if (Array.isArray(content)) {
            text = content
              .filter((b) => b.type === 'text' && b.text)
              .map((b) => b.text)
              .join('')
              .trim();
          }
        }
        // Write actions modify the document; read actions just reply in chat.
        const failed = (r: unknown) => (r as { ok?: boolean })?.ok === false;
        const errMsg = (r: unknown) =>
          (r as { message?: string })?.message ?? t('docops.genericFailed');
        if (isRewrite && text) {
          const r = await bridge.callTool('rewrite_selection', { new_text: text });
          appendDisplay(
            failed(r)
              ? { kind: 'error', text: t('docops.rewriteFailed', { message: errMsg(r) }) }
              : {
                  kind: 'assistant',
                  text: t('docops.rewriteSuccess'),
                }
          );
        } else if (isTable && text) {
          const parsed = parseMarkdownTable(text);
          if (parsed) {
            const r = await bridge.callTool('insert_report_from_data', {
              title: t('docops.defaultTableTitle'),
              columns: parsed.columns,
              rows: parsed.rows,
            });
            appendDisplay(
              failed(r)
                ? { kind: 'error', text: t('docops.tableInsertFailed', { message: errMsg(r) }) }
                : {
                    kind: 'assistant',
                    text: t('docops.tableInsertSuccess', {
                      rows: parsed.rows.length,
                      columns: parsed.columns.length,
                    }),
                  }
            );
          } else {
            appendDisplay({ kind: 'assistant', text });
          }
        } else {
          appendDisplay({ kind: 'assistant', text: text || t('docops.noResponse') });
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        appendDisplay({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, transport, apiKey, bridge, appendDisplay]
  );

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
          title={t('docops.clearConversationTitle')}
          disabled={busy}
        >
          {t('chat.clearButton')}
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
        title={showKeySetup ? t('docops.backToChatTitle') : t('docops.apiKeySettingsTitle')}
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
        title={t('docops.panelTitle')}
        icon={<MaterialSymbol name="auto_awesome" size={16} />}
        headerActions={headerActions}
        onClose={onClose}
        testId="docops-panel"
        footer={
          showKeySetup ? undefined : (
            <div>
              {!busy && (
                <div style={chipRowStyle}>
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      style={chipStyle}
                      onClick={() => void runQuickAction(a)}
                      disabled={busy || (transport.requiresApiKey && !apiKey)}
                      data-testid={`docops-quick-${a.id}`}
                    >
                      {t(a.labelKey)}
                    </button>
                  ))}
                </div>
              )}
              {!transport.drivesLoop && (
                <div style={agentToggleRowStyle}>
                  <button
                    type="button"
                    onClick={() => setAgentMode((v) => !v)}
                    style={agentToggleStyle(agentMode)}
                    data-testid="docops-agent-toggle"
                    aria-pressed={agentMode}
                    title={agentMode ? t('docops.agentModeTitle') : t('docops.chatModeTitle')}
                    disabled={busy}
                  >
                    <MaterialSymbol name="auto_awesome" size={13} />
                    {agentMode ? t('docops.agentModeLabel') : t('docops.chatModeLabel')}
                  </button>
                  {agentMode && (
                    <button
                      type="button"
                      onClick={() => setShowMcpAdd((v) => !v)}
                      style={mcpAddBtnStyle}
                      data-testid="docops-mcp-add"
                      title={t('docops.mcp.connectTitle')}
                    >
                      <MaterialSymbol name="link" size={13} />
                      {t('docops.mcp.buttonLabel')}
                    </button>
                  )}
                  {canIndexWorkspace &&
                    (workspace ? (
                      <button
                        type="button"
                        onClick={clearWorkspaceFolder}
                        style={mcpAddBtnStyle}
                        data-testid="docops-workspace-chip"
                        title={t('docops.workspace.indexedTitle', {
                          count: workspace.count,
                          folder: workspace.folder,
                        })}
                      >
                        <MaterialSymbol name="folder" size={13} />
                        {t('docops.workspace.indexedChip', { count: workspace.count })}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={indexWorkspace}
                        style={mcpAddBtnStyle}
                        disabled={indexingWorkspace}
                        data-testid="docops-workspace-add"
                        title={t('docops.workspace.addTitle')}
                      >
                        <MaterialSymbol name="folder" size={13} />
                        {indexingWorkspace
                          ? t('docops.workspace.indexing')
                          : t('docops.workspace.folderButton')}
                      </button>
                    ))}
                </div>
              )}
              {agentMode && !transport.drivesLoop && (mcpServers.length > 0 || showMcpAdd) && (
                <div style={mcpSectionStyle} data-testid="docops-mcp-section">
                  {mcpServers.map((s) => (
                    <div key={s.id} style={mcpChipStyle(s.status)}>
                      {s.status === 'connecting' ? (
                        <span style={spinnerStyle} aria-hidden="true" />
                      ) : s.status === 'connected' ? (
                        <MaterialSymbol name="check_circle" size={12} />
                      ) : (
                        <MaterialSymbol name="close" size={12} />
                      )}
                      <span title={s.error ?? s.url}>
                        {s.url.replace(/^https?:\/\//, '')}
                        {s.status === 'connected'
                          ? ` · ${t('docops.mcp.toolsSuffix', { count: s.toolCount })}`
                          : ''}
                        {s.status === 'error'
                          ? ` · ${(s.error ?? t('docops.mcp.unknownError')).slice(0, 40)}`
                          : ''}
                      </span>
                      {s.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => {
                            removeMcp(s.id);
                            void connectMcp(s.url);
                          }}
                          style={{ ...mcpRemoveStyle, fontSize: 10, fontWeight: 600 }}
                          aria-label={t('docops.mcp.retryAriaLabel')}
                          title={t('common.retry')}
                        >
                          {t('common.retry')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMcp(s.id)}
                        style={mcpRemoveStyle}
                        aria-label={t('docops.mcp.removeAriaLabel')}
                      >
                        <MaterialSymbol name="close" size={11} />
                      </button>
                    </div>
                  ))}
                  {showMcpAdd && (
                    <>
                      <input
                        value={mcpUrlDraft}
                        onChange={(e) => setMcpUrlDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void connectMcp(mcpUrlDraft, mcpTokenDraft);
                          }
                        }}
                        placeholder="https://mcp.example.com/rpc"
                        aria-label={t('docops.mcp.urlAriaLabel')}
                        style={mcpInputStyle}
                        data-testid="docops-mcp-input"
                      />
                      <input
                        type="password"
                        value={mcpTokenDraft}
                        onChange={(e) => setMcpTokenDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void connectMcp(mcpUrlDraft, mcpTokenDraft);
                          }
                        }}
                        placeholder={t('docops.mcp.tokenPlaceholder')}
                        aria-label={t('docops.mcp.tokenAriaLabel')}
                        style={mcpInputStyle}
                        data-testid="docops-mcp-token"
                      />
                      <button
                        type="button"
                        onClick={() => void connectMcp(mcpUrlDraft, mcpTokenDraft)}
                        style={mcpAddBtnStyle}
                        disabled={!mcpUrlDraft.trim()}
                        data-testid="docops-mcp-connect"
                      >
                        {t('docops.mcp.connectButton')}
                      </button>
                    </>
                  )}
                </div>
              )}
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
                  placeholder={
                    busy ? t('docops.placeholderWorking') : t('docops.placeholderAsk')
                  }
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
                    title={t('chat.stopButton')}
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
                    title={t('docops.sendTitle')}
                    data-testid="docops-send"
                  >
                    <MaterialSymbol name="keyboard_arrow_right" size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {showKeySetup ? (
          <div style={keySetupStyle} data-testid="docops-key-setup">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--doc-text)', lineHeight: 1.5 }}>
              {t('docops.keySetup.description')}
            </p>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey();
              }}
              placeholder={apiKey ? t('docops.keySetup.placeholderSaved') : 'sk-ant-…'}
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
              {t('docops.keySetup.saveButton')}
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
                {t('docops.keySetup.removeButton')}
              </button>
            )}
          </div>
        ) : (
          <div
            style={messagesStyle}
            data-testid="docops-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
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
                <p style={{ margin: '8px 0 0' }}>{t('docops.emptyStateDescription')}</p>
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
                    <span>
                      {TOOL_LABEL_KEYS[msg.toolName]
                        ? t(TOOL_LABEL_KEYS[msg.toolName] as TranslationKey)
                        : msg.toolName}
                    </span>
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
              if (msg.kind === 'cap') {
                return (
                  <div key={i} style={msgCapStyle}>
                    {t('docops.capMessage', { rounds: msg.rounds })}
                  </div>
                );
              }
              if (msg.kind === 'plan') {
                return (
                  <div key={i} style={msgPlanStyle} data-testid="docops-plan">
                    <div style={msgPlanTitleStyle}>{t('docops.planTitle')}</div>
                    {msg.tasks.map((t) => (
                      <div key={t.id} style={msgPlanTaskStyle}>
                        {t.status === 'running' ? (
                          <span style={spinnerStyle} aria-hidden="true" />
                        ) : t.status === 'done' ? (
                          <MaterialSymbol name="check" size={12} />
                        ) : t.status === 'failed' ? (
                          <MaterialSymbol name="close" size={12} />
                        ) : (
                          <span style={planPendingDotStyle} aria-hidden="true" />
                        )}
                        <span style={{ opacity: t.status === 'pending' ? 0.6 : 1 }}>{t.title}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })}

            {streamingText && (
              <div style={{ ...msgAssistantStyle, opacity: 0.85 }}>
                {streamingText}
                <span style={spinnerStyle} aria-hidden="true" />
              </div>
            )}

            {busy && !streamingText && (
              <div style={msgToolStyle} aria-live="polite">
                <span style={spinnerStyle} aria-hidden="true" />
                <span>{thinkingLabel}</span>
              </div>
            )}

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
                {t('docops.noApiKeyBanner')}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </RightDockPanel>
    </>
  );
}

const TOOL_LABEL_KEYS: Partial<Record<string, TranslationKey>> = {
  get_outline: 'docops.toolLabels.getOutline',
  get_selection: 'docops.toolLabels.getSelection',
  get_doc_stats: 'docops.toolLabels.getDocStats',
  list_styles: 'docops.toolLabels.listStyles',
  find_text: 'docops.toolLabels.findText',
  convert_range_to_table: 'docops.toolLabels.convertRangeToTable',
  insert_toc: 'docops.toolLabels.insertToc',
  suggest_text_change: 'docops.toolLabels.suggestTextChange',
  set_paragraph_style: 'docops.toolLabels.setParagraphStyle',
  add_comment: 'docops.toolLabels.addComment',
  rewrite_selection: 'docops.toolLabels.rewriteSelection',
  delete_paragraphs: 'docops.toolLabels.deleteParagraphs',
  insert_paragraph_after: 'docops.toolLabels.insertParagraphAfter',
  get_block: 'docops.toolLabels.getBlock',
  harmonize_styles: 'docops.toolLabels.harmonizeStyles',
  insert_report_from_data: 'docops.toolLabels.insertReportFromData',
  create_document: 'docops.toolLabels.createDocument',
};

export default DocOpsPanel;
