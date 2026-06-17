/**
 * @schnsrw/docx-js-editor/shell — editor chrome lifted from the Casual
 * Office design bundle, consuming `@schnsrw/design-system` primitives.
 * Consumers compose these strips with `<DocxEditor>` (the canvas) inside
 * `<EditorShell>`'s child slot.
 *
 * Tokens must be loaded once at app entry:
 *
 *   import '@schnsrw/design-system/tokens.css';
 */

export { EditorTitleBar } from './EditorTitleBar';
export type { EditorMenuDescriptor, EditorTitleBarProps } from './EditorTitleBar';

export { EditorToolbar } from './EditorToolbar';
export type {
  EditorFormatState,
  EditorToolbarCallbacks,
  EditorToolbarProps,
} from './EditorToolbar';

export { Ruler, EditorStatusBar } from './EditorChrome';
export type { RulerProps, EditorStatusBarProps } from './EditorChrome';

export { EditorShell } from './EditorShell';
export type { EditorShellProps } from './EditorShell';
