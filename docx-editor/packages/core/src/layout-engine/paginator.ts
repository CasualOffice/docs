/**
 * Paginator - manages page state during layout
 *
 * Tracks the current page, cursor position, and available space.
 * Creates new pages when content doesn't fit.
 */

import type { Page, PageMargins, Fragment, ColumnLayout } from './types';

/**
 * Current state of a page being laid out.
 */
export type PageState = {
  /** The page being built. */
  page: Page;
  /** Current Y position (cursor) from page top. */
  cursorY: number;
  /** Current column index (0-based). */
  columnIndex: number;
  /** Top margin of content area. */
  topMargin: number;
  /** Bottom boundary of content area (page height - bottom margin). */
  contentBottom: number;
  /** Accumulated trailing spacing (space after previous block). */
  trailingSpacing: number;
};

/**
 * Options for creating a paginator.
 */
export type PaginatorOptions = {
  /** Page size (width, height). */
  pageSize: { w: number; h: number };
  /** Page margins. */
  margins: PageMargins;
  /** Column configuration (optional). */
  columns?: ColumnLayout;
  /** Per-page footnote reserved heights (pageNumber → height in pixels). */
  footnoteReservedHeights?: Map<number, number>;
  /** Callback when a new page is created. */
  onNewPage?: (state: PageState) => void;
};

/**
 * Calculate the width of a single column.
 */
function calculateColumnWidth(
  pageWidth: number,
  leftMargin: number,
  rightMargin: number,
  columns: ColumnLayout
): number {
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const totalGaps = (columns.count - 1) * columns.gap;
  return (contentWidth - totalGaps) / columns.count;
}

/**
 * Creates a paginator for managing page layout state.
 */
export function createPaginator(options: PaginatorOptions) {
  let pageSize = { ...options.pageSize };
  let margins = { ...options.margins };
  let columns: ColumnLayout = options.columns ?? { count: 1, gap: 0 };
  let warnedOversizedFragment = false;

  // Geometry queued by a continuous section break — applied when the next
  // page is naturally created so the current page keeps the old section's
  // size and margins per ECMA-376 §17.6.22.
  let pendingPageSize: { w: number; h: number } | undefined;
  let pendingMargins: PageMargins | undefined;

  const pages: Page[] = [];
  const states: PageState[] = [];

  function getContentBottom(): number {
    return pageSize.h - margins.bottom;
  }

  function getContentHeight(): number {
    return getContentBottom() - margins.top;
  }

  function getContentWidth(): number {
    return pageSize.w - margins.left - margins.right;
  }

  if (getContentHeight() <= 0) {
    throw new Error('Paginator: page size and margins yield no content area');
  }

  // Calculate column width
  let columnWidth = calculateColumnWidth(pageSize.w, margins.left, margins.right, columns);

  // Track where column content starts on the current page.
  // Defaults to topMargin but gets updated when columns change mid-page
  // (continuous section break). When advanceColumn moves to the next column,
  // it resets cursorY to this value instead of topMargin.
  let columnRegionTop = margins.top;
  // Deepest cursorY any column in the current region reached. Column 0 usually
  // ends lower than later columns, so when a multi-column region ends we must
  // resume below THIS, not below the last column's (higher) cursor — otherwise
  // the following single-column content paints over column 0.
  let columnRegionMaxBottom = margins.top;

  /**
   * Get the body width of a specific column. Equal columns return the uniform
   * `columnWidth`; unequal columns (`w:equalWidth="0"`) return that column's
   * explicit width.
   */
  function getColumnWidthAt(columnIndex: number): number {
    const cw = columns.columnWidths;
    if (cw && cw.length === columns.count) {
      const w = cw[Math.min(columnIndex, columns.count - 1)]?.width;
      if (typeof w === 'number' && w > 0) return w;
    }
    return columnWidth;
  }

  /**
   * Get X position (page-absolute) for a given column index.
   *
   * Unequal columns sum the preceding columns' widths + their trailing spaces;
   * equal columns use the uniform stride (width + gap).
   */
  function getColumnX(columnIndex: number): number {
    const cw = columns.columnWidths;
    if (cw && cw.length === columns.count) {
      let x = margins.left;
      for (let c = 0; c < columnIndex && c < cw.length; c++) {
        x += cw[c].width + cw[c].space;
      }
      return x;
    }
    return margins.left + columnIndex * (columnWidth + columns.gap);
  }

  /**
   * Create a new page and add it to the list.
   */
  function createNewPage(): PageState {
    // Apply any geometry queued by a continuous section break before
    // computing the new page's size / margins.
    if (pendingPageSize || pendingMargins) {
      if (pendingPageSize) pageSize = pendingPageSize;
      if (pendingMargins) margins = pendingMargins;
      pendingPageSize = undefined;
      pendingMargins = undefined;
      columnWidth = calculateColumnWidth(pageSize.w, margins.left, margins.right, columns);
    }
    const pageNumber = pages.length + 1;
    const topMargin = margins.top;
    const contentBottom = getContentBottom();

    // Reduce content bottom by footnote reserved height for this page
    const footnoteHeight = options.footnoteReservedHeights?.get(pageNumber) ?? 0;
    const pageContentBottom = contentBottom - footnoteHeight;

    const page: Page = {
      number: pageNumber,
      fragments: [],
      margins: { ...margins },
      size: { ...pageSize },
      footnoteReservedHeight: footnoteHeight > 0 ? footnoteHeight : undefined,
      // Set initial columns; may be overwritten by updateColumns() for continuous section breaks
      columns: columns.count > 1 ? { ...columns } : undefined,
    };

    const state: PageState = {
      page,
      cursorY: topMargin,
      columnIndex: 0,
      topMargin,
      contentBottom: pageContentBottom,
      trailingSpacing: 0,
    };

    pages.push(page);
    states.push(state);

    // Reset column region to page top on new page
    columnRegionTop = topMargin;
    columnRegionMaxBottom = topMargin;

    if (options.onNewPage) {
      options.onNewPage(state);
    }

    return state;
  }

  /**
   * Get the current page state, creating one if none exists.
   */
  function getCurrentState(): PageState {
    if (states.length === 0) {
      return createNewPage();
    }
    return states[states.length - 1];
  }

  /**
   * Get available height remaining on the current column.
   */
  function getAvailableHeight(state: PageState): number {
    return state.contentBottom - state.cursorY;
  }

  /**
   * Check if the given height fits in the current column.
   */
  function fits(height: number, state?: PageState): boolean {
    const s = state || getCurrentState();
    return getAvailableHeight(s) >= height;
  }

  /**
   * Advance to the next column, or create a new page if no more columns.
   */
  function advanceColumn(state: PageState): PageState {
    // Check if there are more columns on this page
    if (state.columnIndex < columns.count - 1) {
      // Remember how deep this column got before we jump back up to the region
      // top for the next column.
      columnRegionMaxBottom = Math.max(columnRegionMaxBottom, state.cursorY);
      state.columnIndex += 1;
      state.cursorY = columnRegionTop;
      state.trailingSpacing = 0;
      return state;
    }

    // No more columns, create new page
    return createNewPage();
  }

  /**
   * Ensure content of given height can fit.
   * Advances column or creates new page if needed.
   * Returns the state to use for placement.
   */
  function ensureFits(height: number): PageState {
    let state = getCurrentState();
    const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;

    while (!fits(safeHeight, state)) {
      // Oversized-fragment guard: re-checked each iteration because page
      // geometry can change between iterations (a continuous section break
      // queues new size/margins that take effect on `createNewPage`). If a
      // single fragment is taller than the content area of an EMPTY page or
      // column, place it with overflow rather than loop forever.
      const columnCapacity = state.contentBottom - state.topMargin;
      if (safeHeight > columnCapacity) {
        if (!warnedOversizedFragment) {
          warnedOversizedFragment = true;
          console.warn(
            `Paginator: fragment height ${safeHeight.toFixed(0)}px exceeds page content height ${columnCapacity.toFixed(0)}px; placing with overflow.`
          );
        }
        if (state.cursorY !== state.topMargin) {
          state = advanceColumn(state);
        }
        return state;
      }
      state = advanceColumn(state);
    }

    return state;
  }

  /**
   * Add a fragment to the current page at the cursor position.
   * Updates cursor position after placement.
   */
  function addFragment(
    fragment: Fragment,
    height: number,
    spaceBefore: number = 0,
    spaceAfter: number = 0
  ): { state: PageState; x: number; y: number } {
    // Word/LibreOffice ADD a paragraph's spaceBefore to the previous
    // paragraph's spaceAfter (this is the well-known Word "extra space
    // between paragraphs" — NOT CSS-style margin-collapse). Summing matches
    // the reference renderer; max() compressed every body→heading transition
    // by the smaller of the two values (e.g. a 6pt body-after lost against a
    // 10pt heading-before), accumulating ~1 line of drift per page.
    // Contextual-spacing suppression (same-style paragraphs) is applied
    // upstream by zeroing the relevant side, so it still works under summing.
    const effectiveSpaceBefore = spaceBefore + getCurrentState().trailingSpacing;
    const totalHeight = effectiveSpaceBefore + height;

    // Ensure we have space
    const state = ensureFits(totalHeight);

    // Word 2013+ (compatibilityMode ≥ 15) honors an explicit w:before on the
    // first paragraph of a page/column — it's not auto-suppressed. trailingSpacing
    // is already reset to 0 when a new page/column starts (so we don't carry
    // spacing across page breaks), so applying effectiveSpaceBefore here is safe.
    const actualSpaceBefore = effectiveSpaceBefore;

    // Calculate position
    const x = getColumnX(state.columnIndex);
    const y = state.cursorY + actualSpaceBefore;

    // Position the fragment
    fragment.x = x;
    fragment.y = y;

    // Add to page
    state.page.fragments.push(fragment);

    // Update cursor
    state.cursorY = y + height;
    state.trailingSpacing = spaceAfter;

    return { state, x, y };
  }

  /**
   * Force a page break - move to a new page.
   *
   * Idempotent when the current page is empty: a section break followed by
   * `pageBreakBefore` on the next paragraph (or any other chain of forced
   * breaks) collapses to a single break instead of leaving a phantom page.
   */
  function forcePageBreak(): PageState {
    if (states.length > 0) {
      const current = states[states.length - 1];
      if (current.page.fragments.length === 0 && current.cursorY === current.topMargin) {
        return current;
      }
    }
    return createNewPage();
  }

  /**
   * Force a column break - move to next column.
   *
   * In a multi-column layout this advances to the next column (or a new page
   * from the last column). In a single-column layout there is no next column,
   * so an explicit column break is a no-op for pagination — Word keeps the
   * following content on the same page. (This differs from `advanceColumn`,
   * which `ensureFits` calls on genuine overflow and which must still create a
   * new page in single-column.)
   */
  function forceColumnBreak(): PageState {
    const state = getCurrentState();
    if (columns.count <= 1) {
      return state;
    }
    return advanceColumn(state);
  }

  /**
   * Update column configuration mid-document (for section breaks).
   * Recalculates column width based on current page/margin dimensions.
   * Sets columnRegionTop to the current cursor position so that
   * column advancement stays below existing content (for continuous breaks).
   */
  function updateColumns(newColumns: ColumnLayout): void {
    columns = newColumns;
    columnWidth = calculateColumnWidth(pageSize.w, margins.left, margins.right, columns);

    // Update current page's column info for rendering
    const state = getCurrentState();
    state.page.columns = columns.count > 1 ? { ...columns } : undefined;

    // Start the new column region BELOW the deepest column of the region we're
    // leaving — not just where the current column's cursor sits. When a
    // multi-column region ends (a continuous section break dropping 2 columns
    // back to 1), the last column usually ends higher than column 0; resuming
    // at the current cursor would paint the next content over column 0.
    const regionStart = Math.max(state.cursorY, columnRegionMaxBottom);
    columnRegionTop = regionStart;
    state.cursorY = regionStart;
    columnRegionMaxBottom = regionStart;

    // Reset to column 0 for the new column layout
    state.columnIndex = 0;
  }

  /**
   * Keep a short multi-column region together: if the whole region (its
   * tallest column, `regionHeight`) won't fit in the space left on the current
   * page but WOULD fit on an empty page, break to a fresh page before the
   * region is laid out.
   *
   * Word/LibreOffice never split a balanced 2-column region across a page so
   * that one column's overflow continues as a stray narrow strip at the top of
   * the next page. Our column flow does exactly that when a region starts low
   * on the page: column 0 fills the few remaining pixels, the column break
   * jumps to column 1 which also overflows, and the overflow resumes in
   * column 0 of a brand-new page — wasting the bottom of the current page and
   * adding a page. Pushing the region whole avoids both.
   *
   * Only acts when the current page already has content (so we never emit a
   * leading blank page) and the region genuinely fits on a fresh page (so an
   * over-tall region that must split anyway isn't bounced forever). Must be
   * called AFTER `updateColumns` set `columnRegionTop` to the region's start Y.
   */
  function ensureColumnRegionFits(regionHeight: number): void {
    if (!Number.isFinite(regionHeight) || regionHeight <= 0) return;
    if (columns.count <= 1) return;
    const state = getCurrentState();
    if (state.page.fragments.length === 0) return;

    const available = state.contentBottom - columnRegionTop;
    const fullColumnCapacity = state.contentBottom - state.topMargin;
    if (regionHeight <= available) return;
    if (regionHeight > fullColumnCapacity) return; // can't fit anywhere; let it split

    const fresh = createNewPage();
    // The fresh page resets columnRegionTop/MaxBottom to its top margin and
    // column index to 0 in createNewPage(); re-anchor the region there.
    columnRegionTop = fresh.topMargin;
    columnRegionMaxBottom = fresh.topMargin;
    fresh.columnIndex = 0;
    fresh.page.columns = columns.count > 1 ? { ...columns } : undefined;
  }

  /**
   * Update page geometry for pages created after a section break.
   *
   * `applyImmediately = true` (default) swaps the active geometry so the
   * NEXT page created by `forcePageBreak`/`createNewPage` and the column
   * width on the current page both reflect the new section. Used by
   * `nextPage` / `evenPage` / `oddPage` breaks where the next content
   * starts on a fresh page anyway.
   *
   * `applyImmediately = false` defers the swap until `createNewPage`
   * actually fires. Used by `continuous` breaks: ECMA-376 §17.6.22 keeps
   * the current page in the OLD section's geometry but applies the new
   * section's page size / margins to the NEXT naturally-created page.
   * The current page's `columnWidth` is left intact under the old
   * geometry; columns for the new section are still applied via
   * `updateColumns`.
   */
  function updatePageLayout(
    newPageSize?: { w: number; h: number },
    newMargins?: PageMargins,
    applyImmediately = true
  ): void {
    if (!applyImmediately) {
      pendingPageSize = newPageSize ? { ...newPageSize } : pendingPageSize;
      pendingMargins = newMargins ? { ...newMargins } : pendingMargins;
      return;
    }
    if (newPageSize) {
      pageSize = { ...newPageSize };
    }
    if (newMargins) {
      margins = { ...newMargins };
    }
    if (getContentHeight() <= 0) {
      throw new Error('Paginator: section page size and margins yield no content area');
    }
    columnWidth = calculateColumnWidth(pageSize.w, margins.left, margins.right, columns);
    // A pending swap is now superseded by this immediate swap.
    pendingPageSize = undefined;
    pendingMargins = undefined;
  }

  return {
    /** All pages created so far. */
    pages,
    /** All page states. */
    states,
    /** Column width in pixels (use getColumnWidth() for current value after updates). */
    get columnWidth() {
      return columnWidth;
    },
    /** Get current column layout (returns copy to prevent external mutation). */
    get columns() {
      return { ...columns };
    },
    /** Get current state. */
    getCurrentState,
    /** Get available height in current column. */
    getAvailableHeight: () => getAvailableHeight(getCurrentState()),
    /** Get content width for the active section. */
    getContentWidth,
    /**
     * Width a paragraph fragment should occupy in the CURRENT column.
     *
     * For unequal multi-column regions (`w:equalWidth="0"`) this is the active
     * column's explicit width, so right/justified alignment and the fragment
     * box match the column the text was measured against. For single-column
     * and equal-column sections it returns the full content width — preserving
     * the long-standing behavior (equal columns position via `getColumnX` and
     * rely on pre-wrapped measure lines), so no existing fixture shifts.
     */
    getCurrentColumnContentWidth(): number {
      if (
        columns.count > 1 &&
        columns.columnWidths &&
        columns.columnWidths.length === columns.count
      ) {
        return getColumnWidthAt(getCurrentState().columnIndex);
      }
      return getContentWidth();
    },
    /** Check if height fits in current column. */
    fits: (height: number) => fits(height),
    /** Ensure height fits, advancing if needed. */
    ensureFits,
    /** Add a fragment to current page. */
    addFragment,
    /**
     * Reserve vertical flow space WITHOUT painting a fragment. Advances the
     * cursor by `height` so subsequent in-flow blocks start below the reserved
     * band. Used for behind-text anchored objects (e.g. the SDS hazard box)
     * that occupy a vertical band the flow must leave empty even though the
     * object paints behind the text. No-op for non-positive heights.
     */
    reserveSpace(height: number): void {
      if (!Number.isFinite(height) || height <= 0) return;
      const state = ensureFits(height);
      state.cursorY += height;
      // The reservation is hard space; don't let it collapse into a following
      // paragraph's spaceBefore the way trailing paragraph spacing does.
      state.trailingSpacing = 0;
    },
    /** Force a page break. */
    forcePageBreak,
    /** Force a column break. */
    forceColumnBreak,
    /** Get X position for column. */
    getColumnX,
    /** Update column layout (for section breaks). */
    updateColumns,
    /** Keep a short multi-column region together (push it whole if it won't fit). */
    ensureColumnRegionFits,
    /** Update page size/margins for subsequent pages. */
    updatePageLayout,
  };
}

export type Paginator = ReturnType<typeof createPaginator>;
