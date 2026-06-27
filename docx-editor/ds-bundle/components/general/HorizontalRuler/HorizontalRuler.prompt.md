HorizontalRuler from @casualoffice/docs. Use via `window.CasualOfficeDocs.HorizontalRuler` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface HorizontalRulerProps {
  sectionProps?: SectionProperties;
  zoom?: number;
  editable?: boolean;
  onLeftMarginChange?: (marginTwips: number) => void;
  onRightMarginChange?: (marginTwips: number) => void;
  onFirstLineIndentChange?: (indentTwips: number) => void;
  showFirstLineIndent?: boolean;
  firstLineIndent?: number;
  hangingIndent?: boolean;
  indentLeft?: number;
  indentRight?: number;
  onIndentLeftChange?: (indentTwips: number) => void;
  onIndentRightChange?: (indentTwips: number) => void;
  unit?: "inch" | "cm";
  /** Fired with `true` when a margin/indent marker drag starts and `false` when it ends, so the host can freeze the editor sc */
  onDragStateChange?: (dragging: boolean) => void;
  className?: string;
  style?: React__default.CSSProperties;
  tabStops?: TabStop[];
  onTabStopRemove?: (positionTwips: number) => void;
}
```
