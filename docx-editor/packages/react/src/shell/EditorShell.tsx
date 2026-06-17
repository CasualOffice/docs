import type { CSSProperties, ReactNode } from 'react';
import { EditorTitleBar, type EditorTitleBarProps } from './EditorTitleBar';
import { EditorToolbar, type EditorToolbarProps } from './EditorToolbar';
import { Ruler, EditorStatusBar, type RulerProps, type EditorStatusBarProps } from './EditorChrome';

export interface EditorShellProps {
  titleBar?: EditorTitleBarProps | null;
  toolbar?: EditorToolbarProps | null;
  ruler?: RulerProps | null;
  statusBar?: EditorStatusBarProps | null;
  /** The document canvas — typically the DocxEditor mounted into this slot. */
  children?: ReactNode;
  style?: CSSProperties;
}

/**
 * Cohesive editor chrome — stacks EditorTitleBar / EditorToolbar / Ruler /
 * canvas / EditorStatusBar with the design-system pixel heights. Each strip
 * can be hidden by passing `null`. The canvas slot accepts the existing
 * `<DocxEditor>` or any other content the consumer wants to mount.
 */
export function EditorShell({
  titleBar,
  toolbar,
  ruler,
  statusBar,
  children,
  style,
}: EditorShellProps) {
  return (
    <div
      className="ce-editor-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      {titleBar && <EditorTitleBar {...titleBar} />}
      {toolbar && <EditorToolbar {...toolbar} />}
      {ruler && <Ruler {...ruler} />}
      <div
        className="ce-canvas-slot"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          background: 'var(--color-bg)',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
      {statusBar && <EditorStatusBar {...statusBar} />}
    </div>
  );
}
