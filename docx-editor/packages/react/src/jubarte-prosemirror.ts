/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import {
	createHeadlessEditor,
	docxSchema,
	openDocx,
	wireProseMirrorEngine,
} from "../../../../../../src/prosemirror/index.js";
import { casualOfficeJubarteProseMirror } from "../../core/src/jubarte-prosemirror";

export {
	clipboardHtmlToDoc,
	createHeadlessEditor,
	docToClipboardHtml,
	docxSchema,
	openDocx,
	proseDocJsonToAst,
	proseDocJsonToDocx,
	propTreeFromXml,
	wireProseMirrorEngine,
	wmlToProseDocJson,
} from "../../../../../../src/prosemirror/index.js";
export type {
	ClipboardDomOptions,
	DocxSchema,
	HeadlessEditor,
	HeadlessExportFormat,
	ProseDocToDocxOptions,
} from "../../../../../../src/prosemirror/index.js";

export const casualOfficeReactJubarteProseMirror = Object.freeze({
	name: "jubarte-prosemirror-docx",
	family: "casualoffice",
	editor: "casualoffice-react-docx-editor",
	formats: ["docx", "json", "text"] as const,
	schema: docxSchema,
	createHeadlessEditor,
	openDocx,
	wireProseMirrorEngine,
	integration: Object.freeze({
		kind: "react-docx-editor",
		core: casualOfficeJubarteProseMirror,
		normalizeInput: casualOfficeJubarteProseMirror.integration.normalizeInput,
		defaultSurface: "DocxEditor",
		acceptsBrowserFileInputs: true,
	}),
});

export type CasualOfficeReactJubarteProseMirrorAdapter =
	typeof casualOfficeReactJubarteProseMirror;
