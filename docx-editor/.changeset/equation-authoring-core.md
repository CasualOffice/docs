---
'@casualoffice/docs': patch
---

Equation authoring foundation: the math node now carries an optional LaTeX source + MathML, the painter renders authored equations directly from their MathML, and on save the MathML is converted to native OMML (`<m:oMath>`/`<m:oMathPara>`) via a new dependency-free MathML→OMML converter — so equations authored in the editor round-trip into the .docx as real math, never images. (The Insert → Equation UI lands next.)
