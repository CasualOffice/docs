---
'@casualoffice/docs': minor
---

Mode 3 (Personal/Standalone) now talks to the collab server's auth + files contract instead of the legacy Go gateway. `PersonalFileSource`, `AuthClient`, and the personal-auth UI cut over to collab's shapes: wrapped envelopes (`{ user }` / `{ files }` / `{ file }` / `{ profile }`), the `{ error }` error envelope, `id`/`name`/`etag`/`modifiedAt` file fields, multipart `POST /files` create, `POST /files/:id` replace with `If-Match`, and `PATCH /auth/profile`. Authentication is now by **username** (collab has no email login); the profile dialog's language preference moves into `preferences.locale`. `AuthCredentials` is now `{ username, password }` and `PersonalFileSourceOptions.user` is `{ id, username }`.
