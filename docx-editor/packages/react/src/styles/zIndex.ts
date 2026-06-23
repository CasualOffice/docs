/**
 * Z-index stacking order for editor chrome.
 *
 * Single source of truth so layered UI doesn't drift into ad-hoc numbers.
 *
 * Order, low to high:
 *   page content (default 0)
 *   HF inline editor      — sits above page content, below chrome
 *   ruler                 — must stay readable when HF editor is active
 *   dropdown / popover    — opens from toolbar buttons or HF options
 *   menubar trio          — File / Edit / View dropdown stack:
 *                            backdrop catches outside clicks,
 *                            panel renders above it,
 *                            trigger sits a notch above the panel so
 *                            an adjacent menu's trigger click reaches
 *                            it in a single pointer-down (the open
 *                            menu's backdrop would otherwise eat it).
 *   context menu / modal  — top-most, transient surfaces
 */
export const Z_INDEX = {
  hfInlineEditor: 10,
  ruler: 30,
  // Version-history preview overlay — covers the live canvas (incl. the
  // ruler) but stays below dropdowns/menus so chrome remains usable.
  versionPreview: 40,
  dropdown: 100,
  menubarBackdrop: 9998,
  menubarPanel: 9999,
  contextMenu: 10000,
  menubarTrigger: 10001,
} as const;
