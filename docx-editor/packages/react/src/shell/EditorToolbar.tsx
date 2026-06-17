import type { CSSProperties, ReactNode } from 'react';
import { IconButton, Select, type SelectOption } from '@schnsrw/design-system';

export interface EditorFormatState {
  block?: string;
  font?: string | null;
  size?: number | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  ul?: boolean;
  ol?: boolean;
  link?: boolean;
}

export interface EditorToolbarCallbacks {
  onUndo?: () => void;
  onRedo?: () => void;
  onClearFormat?: () => void;

  onSetParaStyle?: (block: string) => void;
  onSetFont?: (font: string) => void;
  onSetSize?: (size: number) => void;

  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onToggleUnderline?: () => void;
  onToggleStrike?: () => void;

  onSetTextColor?: () => void;
  onToggleHighlight?: () => void;
  onInsertLink?: () => void;

  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onJustify?: () => void;

  onToggleBulletList?: () => void;
  onToggleNumberedList?: () => void;
  onOutdent?: () => void;
  onIndent?: () => void;

  onInsertImage?: () => void;
  onInsertTable?: () => void;
  onComment?: () => void;
}

export interface EditorToolbarProps extends EditorToolbarCallbacks {
  fmt?: EditorFormatState;
  paragraphStyles?: string[];
  fonts?: string[];
  sizes?: number[];
  style?: CSSProperties;
}

const DEFAULT_PARA_STYLES = ['Normal', 'Title', 'Heading 1', 'Heading 2', 'Quote'];
const DEFAULT_FONTS = ['Georgia', 'Inter', 'Calibri', 'Arial', 'Times New Roman', 'JetBrains Mono'];
const DEFAULT_SIZES = [10, 11, 12, 14, 18, 24, 36];

export function EditorToolbar({
  fmt = {},
  paragraphStyles = DEFAULT_PARA_STYLES,
  fonts = DEFAULT_FONTS,
  sizes = DEFAULT_SIZES,
  style,
  ...cb
}: EditorToolbarProps) {
  const paraOptions: SelectOption[] = paragraphStyles.map((p) => ({ value: p, label: p }));
  const fontOptions: SelectOption[] = fonts.map((f) => ({ value: f, label: f }));
  const sizeOptions: SelectOption[] = sizes.map((n) => ({
    value: String(n),
    label: String(n),
  }));

  return (
    <div
      style={{
        height: 50,
        flex: '0 0 50px',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-divider)',
        padding: '0 14px',
        gap: 0,
        overflowX: 'auto',
        ...style,
      }}
    >
      <Cluster>
        <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={cb.onUndo} />
        <IconButton icon="redo" label="Redo (Ctrl+Y)" onClick={cb.onRedo} />
        <IconButton icon="format_paint" label="Clear formatting" onClick={cb.onClearFormat} />
      </Cluster>
      <Sep />

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Select
          options={paraOptions}
          value={fmt.block ?? 'Normal'}
          width={116}
          onChange={(e) => cb.onSetParaStyle?.(e.currentTarget.value)}
        />
        <Select
          options={fontOptions}
          value={fmt.font ?? 'Georgia'}
          width={132}
          onChange={(e) => cb.onSetFont?.(e.currentTarget.value)}
        />
        <Select
          options={sizeOptions}
          value={String(fmt.size ?? 11)}
          width={56}
          onChange={(e) => cb.onSetSize?.(Number(e.currentTarget.value))}
        />
      </div>
      <Sep />

      <Cluster>
        <IconButton
          icon="format_bold"
          label="Bold (Ctrl+B)"
          pressed={!!fmt.bold}
          onClick={cb.onToggleBold}
        />
        <IconButton
          icon="format_italic"
          label="Italic (Ctrl+I)"
          pressed={!!fmt.italic}
          onClick={cb.onToggleItalic}
        />
        <IconButton
          icon="format_underlined"
          label="Underline (Ctrl+U)"
          pressed={!!fmt.underline}
          onClick={cb.onToggleUnderline}
        />
        <IconButton
          icon="strikethrough_s"
          label="Strikethrough"
          pressed={!!fmt.strike}
          onClick={cb.onToggleStrike}
        />
      </Cluster>
      <Sep />

      <Cluster>
        <IconButton icon="format_color_text" label="Text colour" onClick={cb.onSetTextColor} />
        <IconButton icon="ink_highlighter" label="Highlight" onClick={cb.onToggleHighlight} />
        <IconButton icon="link" label="Insert link (Ctrl+K)" onClick={cb.onInsertLink} />
      </Cluster>
      <Sep />

      <Cluster>
        <IconButton
          icon="format_align_left"
          label="Align left"
          pressed={fmt.align === 'left'}
          onClick={cb.onAlignLeft}
        />
        <IconButton
          icon="format_align_center"
          label="Center"
          pressed={fmt.align === 'center'}
          onClick={cb.onAlignCenter}
        />
        <IconButton
          icon="format_align_right"
          label="Align right"
          pressed={fmt.align === 'right'}
          onClick={cb.onAlignRight}
        />
        <IconButton
          icon="format_align_justify"
          label="Justify"
          pressed={fmt.align === 'justify'}
          onClick={cb.onJustify}
        />
      </Cluster>
      <Sep />

      <Cluster>
        <IconButton
          icon="format_list_bulleted"
          label="Bulleted list"
          pressed={!!fmt.ul}
          onClick={cb.onToggleBulletList}
        />
        <IconButton
          icon="format_list_numbered"
          label="Numbered list"
          pressed={!!fmt.ol}
          onClick={cb.onToggleNumberedList}
        />
        <IconButton icon="format_indent_decrease" label="Decrease indent" onClick={cb.onOutdent} />
        <IconButton icon="format_indent_increase" label="Increase indent" onClick={cb.onIndent} />
      </Cluster>
      <Sep />

      <Cluster>
        <IconButton icon="image" label="Insert image" onClick={cb.onInsertImage} />
        <IconButton icon="table" label="Insert table" onClick={cb.onInsertTable} />
        <IconButton icon="add_comment" label="Comment" onClick={cb.onComment} />
      </Cluster>
    </div>
  );
}

function Cluster({ children }: { children: ReactNode }) {
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        padding: 2,
        background: 'var(--color-surface-alt)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      {children}
    </div>
  );
}

function Sep() {
  return (
    <span
      style={{
        width: 1,
        height: 22,
        background: 'var(--color-divider)',
        margin: '0 6px',
        flex: '0 0 auto',
      }}
    />
  );
}
