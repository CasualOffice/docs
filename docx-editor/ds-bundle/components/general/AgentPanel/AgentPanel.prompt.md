AgentPanel from @casualoffice/docs. Use via `window.CasualOfficeDocs.AgentPanel` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface AgentPanelProps {
  /** Header title. Defaults to `t('agentPanel.defaultTitle')`. */
  title?: string;
  /** Header icon node. Defaults to a sparkle SVG. */
  icon?: React.ReactNode;
  /** Controlled width in pixels. Omit for uncontrolled (internal state + localStorage). */
  width?: number;
  /** Default width when uncontrolled. */
  defaultWidth?: number;
  /** Min drag width. */
  minWidth?: number;
  /** Max drag width. */
  maxWidth?: number;
  /** Width change callback (drag end and intermediate). */
  onWidthChange?: (w: number) => void;
  /** Header close button click. Omit to hide the close button. */
  onClose?: () => void;
  /** Panel content. Render whatever you want — a chat, tabs, settings, anything. */
  children: React.ReactNode;
  /** Optional class on the outer wrapper. */
  className?: string;
  /** When `true`, the panel collapses to zero width with an ease-out transition (the children are still mounted so chat state */
  closed?: boolean;
}
```
