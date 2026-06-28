/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/** Sidebar width in pixels. */
export const SIDEBAR_WIDTH = 340;

/** Gap between the page's right edge and the sidebar (px). */
export const SIDEBAR_PAGE_GAP = 12;

/** How far left the viewport shifts to center doc + sidebar as a unit. */
export const SIDEBAR_DOCUMENT_SHIFT = (SIDEBAR_PAGE_GAP + SIDEBAR_WIDTH) / 2;

/** Minimum gap between stacked cards to avoid overlap. */
export const MIN_CARD_GAP = 8;

/**
 * Canonical width for every right-edge dockable panel — chat, AI
 * suggestion, version history, future explore/citations panels.
 * Keeps the geometry uniform so the doc area shifts by the same amount
 * regardless of which panel the user opens, and the rail never
 * disappears behind a panel taller than the layout intended.
 */
export const RIGHT_PANEL_WIDTH = 340;
