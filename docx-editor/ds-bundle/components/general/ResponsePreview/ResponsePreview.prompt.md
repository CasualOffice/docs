ResponsePreview from @casualoffice/docs. Use via `window.CasualOfficeDocs.ResponsePreview` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ResponsePreviewProps {
  /** Original selected text */
  originalText: string;
  /** AI response (or null if loading/error) */
  response: AgentResponse;
  /** Action that was performed */
  action: "askAI" | "rewrite" | "expand" | "summarize" | "translate" | "explain" | "fixGrammar" | "makeFormal" | "makeCasual" | "custom";
  /** Whether the response is loading */
  isLoading: boolean;
  /** Error message if request failed */
  error?: string;
  /** Callback when user accepts the change */
  onAccept: (newText: string) => void;
  /** Callback when user rejects the change */
  onReject: () => void;
  /** Callback when user wants to retry */
  onRetry?: () => void;
  /** Allow editing before accepting */
  allowEdit?: boolean;
  /** Show diff view */
  showDiff?: boolean;
  /** Additional className */
  className?: string;
  /** Position for the preview */
  position?: { x: number; y: number; };
}
```
