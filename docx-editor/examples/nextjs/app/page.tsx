'use client';
/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */


import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('./components/Editor').then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#666',
      }}
    >
      Loading DOCX Editor...
    </div>
  ),
});

export default function Page() {
  return <Editor />;
}
