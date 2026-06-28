/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Math Extension — inline/block math equation node (OMML)
 *
 * Represents Office Math Markup Language equations as atomic nodes.
 * Stores the raw OMML XML for round-trip fidelity and shows a plain
 * text fallback in the editor.
 */

import { createNodeExtension } from '../create';

export const MathExtension = createNodeExtension({
  name: 'math',
  schemaNodeName: 'math',
  nodeSpec: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: {
      /** Whether this is a block (oMathPara) or inline (oMath) equation */
      display: { default: 'inline' },
      /** Raw OMML XML for round-trip preservation */
      ommlXml: { default: '' },
      /** Plain text representation for fallback display */
      plainText: { default: '' },
      /** LaTeX source — the canonical, re-editable form for equations
       *  AUTHORED in the editor (Word-imported ones keep ommlXml only). */
      latex: { default: '' },
      /** MathML — the rendered form. Authored equations carry it so the
       *  painter draws real math and the saver derives OMML from it. */
      mathml: { default: '' },
    },
    parseDOM: [
      {
        tag: 'span.docx-math',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            display: el.dataset.display || 'inline',
            ommlXml: el.dataset.ommlXml || '',
            plainText: el.textContent || '',
            latex: el.dataset.latex || '',
            mathml: el.dataset.mathml || '',
          };
        },
      },
    ],
    toDOM(node) {
      const { display, ommlXml, plainText, latex, mathml } = node.attrs as {
        display: string;
        ommlXml: string;
        plainText: string;
        latex: string;
        mathml: string;
      };

      const text = plainText || '[equation]';

      return [
        'span',
        {
          class: `docx-math docx-math-${display}`,
          'data-display': display,
          'data-omml-xml': ommlXml,
          ...(latex ? { 'data-latex': latex } : {}),
          ...(mathml ? { 'data-mathml': mathml } : {}),
          style:
            'font-style: italic; font-family: "Cambria Math", "Latin Modern Math", serif; ' +
            'background: rgba(200,200,255,0.1); padding: 0 2px; border-radius: 2px;',
        },
        text,
      ];
    },
  },
});
