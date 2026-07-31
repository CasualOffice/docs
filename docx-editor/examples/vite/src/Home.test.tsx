/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, expect, mock, test } from 'bun:test';

GlobalRegistrator.register();
mock.module('@casualoffice/docs', () => ({
  AutosaveStatus: () => null,
  DocxEditor: () => null,
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

const { act, cleanup, fireEvent, render, within } = await import('@testing-library/react');
const { Home } = await import('./Home');

afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  GlobalRegistrator.unregister();
});

test('new cards use the DOCX and Markdown creation seams', async () => {
  const onNewDocument = mock(() => {});
  const onSelectTemplate = mock(() => {});
  const view = render(
    <Home onNewDocument={onNewDocument} onSelectTemplate={onSelectTemplate} onOpenFile={() => {}} />
  );
  await act(async () => {
    await Promise.resolve();
  });
  const createNew = view.getByRole('region', { name: 'Create new' });

  expect(view.getAllByRole('button', { name: 'Blank document — Personal' })).toHaveLength(1);
  expect(view.getAllByRole('button', { name: 'Blank Markdown — Personal' })).toHaveLength(1);

  fireEvent.click(within(createNew).getByRole('button', { name: 'Blank document — Personal' }));
  fireEvent.click(within(createNew).getByRole('button', { name: 'Blank Markdown — Personal' }));

  expect(onNewDocument).toHaveBeenCalledTimes(1);
  expect(onSelectTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'blank-markdown', source: { kind: 'text', textKind: 'markdown' } })
  );
});
