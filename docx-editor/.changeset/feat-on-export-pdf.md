---
'@casualoffice/docs': minor
---

Add an `onExportPdf` hook to `DocxEditor`. When set and it resolves true, the host handled "Export as PDF" (the Casual Office desktop shell uses its native webview print-to-PDF for selectable-text output reliable on WebKitGTK) and the browser print-dialog fallback is skipped. Unset / false falls back to the existing print pipeline.
