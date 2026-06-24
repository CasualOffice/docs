---
'@casualoffice/docs': minor
---

Render equations in opened .docx files as real math (native MathML) instead of italic plain-text fallback. The stored OMML (`<m:oMath>`/`<m:oMathPara>`) is converted to MathML at layout time and painted as a native `<math>` element. Render-only: the equation's measured text and preserved OMML are unchanged, so round-trip is unaffected. Authoring (Insert → Equation) lands in a follow-up.
