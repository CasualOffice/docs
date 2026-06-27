PluginHost from @casualoffice/docs. Use via `window.CasualOfficeDocs.PluginHost` (bundle loaded from the root `_ds_bundle.js`).

PluginHost Component

Wraps the editor and provides:
- Plugin state management
- Panel rendering for each plugin
- CSS injection for plugin styles
- Callbacks for editor interaction

## Props

```ts
interface PluginHostProps {
  /** Plugins to enable */
  plugins: EditorPlugin<any>[];
  /** The editor component (passed as child) */
  children: React$1.ReactElement<unknown, string | React$1.JSXElementConstructor<any>>;
  /** Class name for the host container */
  className?: string;
}
```
