ErrorBoundary from @casualoffice/docs. Use via `window.CasualOfficeDocs.ErrorBoundary` (bundle loaded from the root `_ds_bundle.js`).

Error Boundary class component

Catches render errors in child components and displays fallback UI.

## Props

```ts
interface ErrorBoundaryProps {
  /** Child components to render */
  children: React.ReactNode;
  /** Custom fallback UI */
  fallback?: unknown;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show error details */
  showDetails?: boolean;
}
```
