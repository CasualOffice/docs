---
'@casualoffice/docs': minor
---

WopiFileSource now talks directly to the collab server's WOPI host endpoints (`/wopi/files/:id` CheckFileInfo, `/wopi/files/:id/contents` GetFile/PutFile) instead of the legacy Go gateway's `/api/docs/{id}/download`. `save()` is now implemented as a WOPI PutFile (client-push, with `X-WOPI-ItemVersion` optimistic-write guard) rather than throwing; a host-side version conflict surfaces as the new exported `WopiSaveConflictError`.
