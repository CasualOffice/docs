---
'@casualoffice/docs': patch
---

Fix the vertical ruler's top/bottom margin marker staying pinned while the page reflowed when dragged. The marker read initialSectionProperties (sections[0].properties) but margin drags only update finalSectionProperties, so on any document with a section the marker didn't follow the pointer. It now reads the live finalSectionProperties, matching the horizontal ruler.
