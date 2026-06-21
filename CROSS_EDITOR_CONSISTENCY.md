# Cross-editor consistency — sheet → doc (sister editors)

For the **doc-editor Claude session**. The sheet repo set several conventions
over the last 1–2 days for the **SDK model**, **visual design system**, and
**UX patterns**. Mirror these in the doc editor so the sibling apps (sheet /
doc / slides) feel like one product. The doc editor is its own stack (not
Univer) and its **content-UX bar is Google Docs**, but the *chrome*, *design
system*, *SDK contract shape*, and *cross-cutting UX* should match sheet.

---

## 1. Design system — adopt `@schnsrw/design-system` verbatim

- **Single source of truth:** `@schnsrw/design-system`, distributed as a **git
  submodule** → `git@github.com:CasualOffice/design-book.git` (public; built
  `dist/` is committed, so consumers need no build step). Sheet wires it via
  `pnpm.overrides` `"@schnsrw/design-system": "link:vendor/design-system"`. The
  doc editor should consume the **same package** (same submodule), not re-invent
  tokens.
- **Tokens** (CSS custom properties, in `dist/tokens/*.css`): `colors.css`,
  `editor-theme.css`, `fonts.css`, `motion.css`, `spacing.css`, `typography.css`.
  Import them once at app boot; never hardcode hex/px — reference the vars.
  - **Color (light / dark):** `--color-accent` `#0e7490`/`#22d3ee` ·
    `--color-surface` (zone-0 white) `#ffffff`/`#1b1e23` · `--color-surface-strip`
    (zone-2 chrome) `#eef1f5`/`#2a2e35` · `--color-divider` `#edeff3`/`#24272d` ·
    `--color-text` `#201f1e`/`#e6e6e6` · `--color-text-secondary`
    `#605e5c`/`#b0b3ba` · `--color-hover`, `--color-selected`.
    > Note: `editor-theme.css` overrides accent **only** under `[data-app='docs']`
    > (docs accent ≠ sheet accent by design) — keep using that scoping hook.
  - **Spacing scale:** `--space-1..10` = 2,4,6,8,12,16,20,24,32,48 px.
  - **Radius:** `--radius-sm` 4 (chips) · `--radius-md` 6 (buttons/inputs) ·
    `--radius-lg` 10 (cards/menus/popovers) · `--radius-xl` 14 (dialogs/command
    palette) · `--radius-pill` 999.
  - **Shadow:** `--shadow-1..4` (1 = subtle card, 2 = panel/menu, 3 = dialog,
    4 = modal/overlay).
- **Fonts:** **Inter** via Google Fonts for all chrome text. **Icons: Material
  Symbols Outlined** (variable font), axes `'opsz' 20–24, 'wght' 400, 'FILL' 0,
  'GRAD' 0`. **Never** text glyphs or another icon library. (Memory:
  `feedback_design_system`.) iOS Safari: inputs ≥16px font to avoid focus-zoom.
- **Components:** the package ships Button / IconButton / Badge / etc. Use them
  for chrome controls instead of hand-rolled buttons.

---

## 2. Visual language (the chrome look sheet shipped — match it)

- **Grey chrome, white content.** Every chrome strip (title bar, toolbar/menu
  bar, formula/equiv bar, footer/status bar, the "desk" behind the canvas) uses
  one consistent grey = `--color-surface-strip`. Only the **content surface +
  side panels** are white cards = `--color-surface`.
- **Floating-card treatment:** content area + side panels are cards —
  `border-radius: var(--radius-lg)` + `box-shadow: var(--shadow-2)`, **borderless
  in light mode**. In **dark mode use a hairline `1px solid var(--color-border)`
  and NO shadow** (shadows muddy dark surfaces). The toolbar is also a floating
  card with uniform spacing around the canvas.
- **Controls:** `--radius-md`; menus/popovers `--radius-lg` + `--shadow-2`;
  dialogs/command-palette `--radius-xl` + `--shadow-3/4`.
- **Status bar** is its own strip at the very bottom (split out from the
  tab/footer row); chrome heights live as `--*-h` vars so they're tunable.
- **Collaboration cluster:** group presence avatars + Share + room status into
  one visual unit on the right of the title bar, separated from status pills and
  account controls by thin `1px var(--color-divider)` dividers (Docs/Excel-online
  style). Sheet just did this — mirror the grouping.
- **Theme:** light/dark via a `data-theme` attribute swapping the DS tokens; the
  canvas engine may not be theme-aware (sheet's Univer canvas isn't) — chrome
  still themes correctly.

---

## 3. SDK model (the contract shape to mirror — Excalidraw model)

Sheet's SDK is `@casualoffice/sheets` (published npm). The doc editor's SDK
should follow the **same shape** (adapted to its stack), so hosts integrate both
the same way:

- **The package IS the editor.** A single React component (sheet:
  `<CasualSheets>`) renders the full editor. A `chrome` prop selects built-in
  UI: `chrome="none" | "minimal" | "full"`.
  - `chrome="full"` = batteries-included shell for 3rd-party hosts.
  - `chrome="none"` = the power host (the app) brings its **own** rich shell and
    consumes only the editor core. (Sheet's `apps/web` uses `chrome="none"`.)
- **Imperative API via `onReady(api)`** (sheet: `CasualSheetsAPI`): `getSnapshot`
  / `loadSnapshot` / `getSelection` / `executeCommand` / `setTheme` /
  `importXlsx` / `exportXlsx` (doc equiv: `importDocx`/`exportDocx`) / `univer`
  (escape hatch, not semver-covered). Keep the doc API names parallel.
- **Host-owned persistence — the SDK stores NOTHING.** It emits `onChange`
  (debounced snapshot), `onSave` (Ctrl/Cmd+S), `onExit` (unmount). The host
  decides where bytes go (localStorage demo / WOPI / backend). No
  `localStorage`/`FileSource` baked into the SDK.
- **Opt-in collab:** one call `attachCollab(api, { room, server, password? })`
  returning a **detach handle**; editor is collab-unaware until attached. Yjs +
  Hocuspocus is the realtime transport; the authoritative doc is saved via the
  host/WOPI, not a browser store. (Doc editor: same pattern.)
- **Embed path:** an in-iframe runtime + a `postMessage` transport
  (`EmbedHostTransport` host-side) with `load`/`save`/`exit`/`command` messages —
  for hosts that only do `<iframe src=embed.html>`. Ship a self-contained
  `embed-runtime.js` + `embed.html`.
- **Bundle discipline (important):** externalize peer-provided deps (the engine,
  react, yjs) so the host resolves a single copy (duplicate engine/redi/yjs
  copies break DI / Y.Doc identity). For lazy features that must stay separate
  chunks under a no-code-split build, import them via the **externalized package
  subpath** (e.g. `@casualoffice/sheets/xlsx`), not a relative import (which gets
  inlined). Keeps the editor entry small.

---

## 4. UX patterns to mirror (cross-cutting; not content-specific)

- **Save status pill** + **Activity pill** (error log with **per-entry Retry**)
  in the title-bar actions row.
- **Properties dialog:** show the **real file** — actual on-disk byte size (not
  an in-memory serialization estimate), the file Name, and sanitized metadata
  (drop placeholder junk like `Unknown`/`null`, guard `Invalid Date`).
- **Sharing model (sheet just built §6.1 — reuse the same model):**
  - Roles `view` / `comment` / `edit`. Personal-mode files only (WOPI hosts own
    their own perms).
  - **Link tokens** are room-bound `(workbookId, roomId, token, role, expiresAt?,
    passwordHash?)` rows in the personal SQLite store; owner/admin-gated CRUD;
    optional bcrypt password (`?sp=`).
  - **Server-authoritative join enforcement:** a pure `resolveJoinRole(token,
    room, sharePassword, …)` decides the role at the collab join — the client's
    asserted role is ignored when a token is present; token must resolve, be
    bound to the room (replay-proof), and pass its password. No token → legacy
    anonymous behavior unchanged. Public `GET …/shares/link/:token/meta` for
    pre-join password discovery (never leaks the hash).
  - Client: a "Link" section in the share dialog (mint view/edit, expiry,
    password, copy URL `…/r/<room>?share=<token>`, list, revoke).
  - Deferred everywhere: fine-grained `comment` mode (engine-permission work);
    member ACLs (§6.2) are the next phase.
- **Command palette** (Ctrl/Cmd+Shift+P), keyboard-shortcuts dialog,
  `formatShortcut` util for correct Mac rendering. **Compact chrome toggle** in
  the View menu (sheet: compact ribbon).

---

## 5. Conventions / gotchas (apply in the doc repo too)

- **No Claude attribution** in commits/PRs.
- **Verify UI via Playwright + green CI** before pushing; full local gate =
  lint + format:check + typecheck + test:unit + build + relevant e2e.
- **Releases:** Changesets → `version-packages` → commit → push → dispatch the
  npm release workflow (publishes when changesets are empty). App (Docker) and
  SDK (npm) are **independent release lines** — don't conflate versions.
- Personal-mode state (users / files / share tokens / member ACLs) lives in
  **SQLite**, not the byte-storage host backends.
- Identity / drive across the suite is moving to a separate **Casual Drive**
  product (users/workspaces/files); editors consume it via WOPI. Don't rebuild
  team/identity inside the doc editor — align with that direction.

---

_Source: casual-sheets repo as of 2026-06-21. SDK published `@casualoffice/sheets@0.11.1`._
