TableMoreDropdown from @casualoffice/docs. Use via `window.CasualOfficeDocs.TableMoreDropdown` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TableMoreDropdownProps {
  onAction: (action: TableAction) => void;
  disabled?: boolean;
  tableContext?: { isInTable: boolean; rowCount?: number; columnCount?: number; columnIndex?: number; canSplitCell?: boolean; hasMultiCellSelection?: boolean; currentRowIsHeader?: boolean; table?: { attrs?: { justification?: string; }; }; };
}
```
