# CasualOfficeDocs (@casualoffice/docs@1.1.7)

This design system is the published @casualoffice/docs React library, bundled as a single
browser global. All 73 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.CasualOfficeDocs`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.CasualOfficeDocs.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AgentPanel } = window.CasualOfficeDocs;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AgentPanel />);
```

## Tokens

0 CSS custom properties from @casualoffice/docs. Names are
preserved verbatim from upstream. None detected — this DS may compute styles at runtime (CSS-in-JS).



## Components

### general
- `AgentPanel`
- `AlignmentButtons` — Alignment dropdown component  single button with popover panel
- `AuthClient`
- `BrowserFileSource` — BrowserFileSource  the FileSource implementation for Mode 1
- `CasualEditor`
- `CasualEditorIframe`
- `ColorPicker`
- `ContextMenu`
- `DocumentAgent` — DocumentAgent provides a fluent API for document manipulation
- `DocxEditor` — DocxEditor - Complete DOCX editor component
- `DrawnSignaturePad`
- `EditorToolbar` (compound: `EditorToolbar.TitleBar`, `EditorToolbar.Logo`, `EditorToolbar.DocumentName`, `EditorToolbar.MenuBar`, `EditorToolbar.TitleBarRight`, `EditorToolbar.FormattingBar`)
- `EmbedTransport`
- `ErrorBoundary` — Error Boundary class component
- `ErrorProvider` — Error notification provider
- `FileSourceProvider`
- `FocusTrap`
- `FontPicker`
- `FontSizePicker`
- `FormattingBar` — Icon-based formatting toolbar  undo/redo, zoom, styles, fonts,
- `HorizontalRuler`
- `LineSpacingPicker`
- `ListButtons` — List buttons component for bullet/numbered list controls
- `LoadingIndicator`
- `LocaleProvider`
- `ParseErrorDisplay` — Parse error display component
- `PersonalAuthGateModal`
- `PersonalFileSource`
- `PersonalFileSourceError` — Error raised when a server response isn't 2xx. Carries the parsed
- `PluginRegistry` — Plugin Registry
- `PresenceCluster`
- `PrintButton` — PrintButton - Standalone print button for toolbar
- `PrintStyles` — PrintStyles - Injects print-specific CSS
- `ResponsePreview`
- `ResponsiveToolbar`
- `ResponsiveToolbarGroup`
- `StylePicker`
- `TableBorderColorPicker`
- `TableBorderPicker`
- `TableBorderWidthPicker`
- `TableCellFillPicker`
- `TableInsertButtons`
- `TableMergeButton`
- `TableMoreDropdown`
- `TableToolbar` — TableToolbar - Shows table manipulation controls when cursor is in a table
- `TextContextMenu`
- `Toolbar` — Classic single-row formatting toolbar: menus + formatting icons.
- `ToolbarButton` — Individual toolbar button with shadcn styling
- `ToolbarGroup` — Toolbar button group with modern styling
- `ToolbarSeparator` — Toolbar separator
- `TypedSignatureField`
- `UnsavedIndicator`
- `UnsupportedFeatureWarning` — Unsupported feature warning component
- `UploadedSignatureField`
- `WopiFileSource`
- `WopiNotSupportedError` — Thrown by operations WOPI mode doesn't support. Surfaces in
- `WopiSaveConflictError` — Thrown when PutFile is rejected because the host's item version no
- `ZoomControl`

### file-source
- `AutosaveStatus`
- `PersonalAuthGate`
- `ProfileSettingsDialog`
- `UserMenu`

### dialogs
- `FindReplaceDialog` — FindReplaceDialog component - Modal for finding and replacing text
- `HyperlinkDialog`
- `InsertImageDialog` — InsertImageDialog - Modal for inserting images with preview and sizing
- `InsertSymbolDialog` — InsertSymbolDialog - Modal for inserting special characters
- `InsertTableDialog` — InsertTableDialog - Modal for inserting tables with visual grid selector
- `KeyboardShortcutsDialog`
- `PasteSpecialDialog`

### plugin-api
- `PluginHost` — PluginHost Component

### signing
- `SigningPane`
- `SigningProvider`

### sidebar
- `VersionHistoryPanel`
