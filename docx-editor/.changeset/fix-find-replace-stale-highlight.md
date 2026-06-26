---
'@casualoffice/docs': patch
---

Fix Find & Replace leaving a stale highlight after the last match is replaced. Replacing the final occurrence cleared the result but left the previous match still highlighted on the page; the highlight is now cleared when no matches remain, matching the search path's behaviour.
