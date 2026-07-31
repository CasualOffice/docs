/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();

mock.module('@casualoffice/docs', () => ({
  AutosaveStatus: () => null,
  DocxEditor: ({ document }: { document?: { children?: ReadonlyArray<unknown> } }) => (
    <div data-testid="docx-editor" data-child-count={document?.children?.length ?? -1} />
  ),
  PersonalAuthGate: ({ children }: { children: React.ReactNode }) => children,
  PresenceCluster: () => null,
  UserMenu: () => null,
  convertToDocx: async () => new ArrayBuffer(0),
  createEmptyDocument: () => ({ type: 'document', children: [] }),
  deleteRecentFile: async () => undefined,
  formatFromFilename: () => 'docx',
  formatSize: (size: number) => `${size} B`,
  isForeignFormat: () => false,
  listRecentFiles: async () => [],
  recordRecentFile: async () => undefined,
  useFileSourceAutoSave: () => ({ status: 'idle' }),
}));
mock.module('./collab/useCollab', () => ({
  useCollab: () => ({ plugins: [], status: 'connected', peers: [], metaMap: new Map() }),
}));
mock.module('./collab/StatusBadge', () => ({ StatusBadge: () => null }));
mock.module('./collab/Share', () => ({ ShareDialog: () => null }));
mock.module('./collab/LoadingPanel', () => ({ LoadingPanel: () => null }));
mock.module('./collab/ErrorPanel', () => ({ ErrorPanel: () => null }));
mock.module('./collab/DisconnectedBanner', () => ({ DisconnectedBanner: () => null }));
mock.module('./markdown/MarkdownEditor', () => ({
  MarkdownEditor: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="markdown-editor">
      <button type="button" onClick={onBack}>Back</button>
    </div>
  ),
}));
mock.module('./markdown/MarkdownCollabApp', () => ({ MarkdownCollabApp: () => null }));
mock.module('./viewers/RtfViewer', () => ({ RtfViewer: () => null }));
mock.module('./viewers/EmlViewer', () => ({ EmlViewer: () => null }));
type LoadedTemplate = {
  kind: 'document';
  document: { type: string; children: ReadonlyArray<{ type: string }> };
  fileName: string;
};
let loadTemplateImpl: () => Promise<LoadedTemplate> = async () => ({
  kind: 'document' as const,
  document: { type: 'document', children: [] },
  fileName: 'Template.docx',
});
mock.module('./templates/loader', () => ({ loadTemplate: () => loadTemplateImpl() }));
mock.module('./router', () => ({
  navigate: () => undefined,
  useRoute: () => ({ kind: 'home' }),
}));

const { act, cleanup, fireEvent, render } = await import('@testing-library/react');
const { App } = await import('./App');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  delete window.__deskApp__;
  loadTemplateImpl = async () => ({
    kind: 'document' as const,
    document: { type: 'document', children: [] },
    fileName: 'Template.docx',
  });
});
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  GlobalRegistrator.unregister();
});

test('blank Markdown clears the desktop file binding', () => {
  window.history.replaceState(null, '', '/');
  const view = render(<App />);

  window.__deskApp__ = {
    isDesktop: true,
    filePath: 'C:\\previous.md',
  } as NonNullable<typeof window.__deskApp__>;
  fireEvent.click(view.getByRole('button', { name: 'Blank Markdown — Personal' }));
  expect(view.getByTestId('markdown-editor')).toBeTruthy();
  expect(document.title).toBe('Untitled.md — Casual Editor');
  expect(window.__deskApp__.filePath).toBeNull();
});

test('blank DOCX clears previous Markdown state and the desktop file binding', () => {
  window.history.replaceState(null, '', '/');
  window.confirm = () => true;
  const view = render(<App />);

  fireEvent.click(view.getByRole('button', { name: 'Blank Markdown — Personal' }));
  fireEvent.click(view.getByRole('button', { name: 'Back' }));
  window.__deskApp__ = {
    isDesktop: true,
    filePath: 'C:\\previous.docx',
  } as NonNullable<typeof window.__deskApp__>;
  fireEvent.click(view.getByRole('button', { name: 'Blank document — Personal' }));

  expect(view.queryByTestId('markdown-editor')).toBeNull();
  expect(view.getByTestId('docx-editor')).toBeTruthy();
  expect(window.__deskApp__.filePath).toBeNull();
});

test('a late template load cannot replace a newer blank document', async () => {
  let resolveTemplate!: (value: Awaited<ReturnType<typeof loadTemplateImpl>>) => void;
  loadTemplateImpl = () => new Promise((resolve) => {
    resolveTemplate = resolve;
  });
  const view = render(<App />);

  fireEvent.click(view.getAllByRole('button', { name: 'Resume — Career' })[0]);
  fireEvent.click(view.getByRole('button', { name: 'Blank document — Personal' }));
  await act(async () => {
    resolveTemplate({
      kind: 'document',
      document: { type: 'document', children: [{ type: 'paragraph' }] },
      fileName: 'Resume.docx',
    });
    await Promise.resolve();
  });

  expect(view.getByTestId('docx-editor').getAttribute('data-child-count')).toBe('0');
});
