FocusTrap from @casualoffice/docs. Use via `window.CasualOfficeDocs.FocusTrap` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface FocusTrapProps {
  /** Subtree to scope focus to. */
  children: React.ReactNode;
  /** When false, the trap is inactive (still renders children). Useful for dialogs that conditionally mount inside a sibling. */
  active?: boolean;
  /** Optional ref to focus on mount instead of the first focusable. */
  initialFocus?: React$1.RefObject<HTMLElement>;
  /** Optional class applied to the wrapper. */
  className?: string;
}
```
