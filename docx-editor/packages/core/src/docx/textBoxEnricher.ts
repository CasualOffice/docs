/**
 * Text Box Enrichment
 *
 * During initial paragraph parsing, `w:drawing` elements that contain a
 * text box (`wps:wsp` with `wps:txbx`) are skipped because the image
 * parser returns `null` for non-image drawings. This module does a
 * second pass over the raw XML of a parsed paragraph, finds those text
 * box drawings, parses them with their inner content, and injects them
 * back into the parsed paragraph as `ShapeContent` on the matching run.
 *
 * Used by:
 * - `documentParser.parseBlockContent` for the document body.
 * - `headerFooterParser.parseHeaderFooterContent` for headers/footers
 *   (issue #318 — without this call, textboxes inside headers/footers
 *   silently disappear).
 */

import type {
  Paragraph,
  Shape,
  ShapeContent,
  Theme,
  RelationshipMap,
  MediaFile,
} from '../types/document';
import type { StyleMap } from './styleParser';
import type { NumberingMap } from './numberingParser';
import {
  findDeep,
  getChildElements,
  getLocalName,
  type XmlElement,
} from './xmlParser';
import { parseParagraph } from './paragraphParser';
import {
  isTextBoxDrawing,
  parseTextBox,
  getTextBoxContentElement,
  parseTextBoxContent,
} from './textBoxParser';

/**
 * Enrich a parsed paragraph with text-box content from its raw XML.
 */
export function enrichParagraphTextBoxes(
  paragraph: Paragraph,
  paraXml: XmlElement,
  styles: StyleMap | null,
  theme: Theme | null,
  numbering: NumberingMap | null,
  rels: RelationshipMap | null,
  media: Map<string, MediaFile> | null
): void {
  // Early exit: skip paragraphs with no runs (most paragraphs have no text boxes)
  if (paragraph.content.length === 0) return;

  const xmlChildren = getChildElements(paraXml);

  // Track which run we're on (to match XML runs with parsed runs)
  let runIndex = 0;

  for (const xmlChild of xmlChildren) {
    if (getLocalName(xmlChild.name ?? '') !== 'r') continue;

    // Find w:drawing children in this run
    const runElements = getChildElements(xmlChild);
    for (const runEl of runElements) {
      if (getLocalName(runEl.name ?? '') === 'drawing' && isTextBoxDrawing(runEl)) {
        // Parse the text box structure
        const textBox = parseTextBox(runEl);
        if (textBox) {
          // Navigate to wps:wsp to get the txbxContent element
          const wsp = findDeep(runEl, 'wps', 'wsp');
          if (wsp) {
            const txbxContentEl = getTextBoxContentElement(wsp);
            if (txbxContentEl) {
              textBox.content = parseTextBoxContent(
                txbxContentEl,
                parseParagraph,
                null, // table parser not needed for most text boxes
                styles,
                theme,
                numbering,
                rels ?? undefined,
                media ?? undefined
              );
            }
          }

          // Convert to Shape with textBody and inject as ShapeContent
          const shape: Shape = {
            type: 'shape',
            shapeType: 'rect',
            size: textBox.size,
            position: textBox.position,
            wrap: textBox.wrap,
            fill: textBox.fill,
            outline: textBox.outline,
            textBody: {
              content: textBox.content,
              margins: textBox.margins,
            },
          };
          if (textBox.id) shape.id = textBox.id;

          const shapeContent: ShapeContent = { type: 'shape', shape };

          // Find the matching parsed run and inject the ShapeContent
          if (runIndex < paragraph.content.length) {
            const parsedContent = paragraph.content[runIndex];
            if (parsedContent.type === 'run') {
              parsedContent.content.push(shapeContent);
            }
          }
        }
      }
    }

    runIndex++;
  }
}
