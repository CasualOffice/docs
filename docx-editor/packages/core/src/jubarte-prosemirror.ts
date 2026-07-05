/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import {
	createHeadlessEditor,
	docxSchema,
	openDocx,
	wireProseMirrorEngine,
} from "../../../../../../src/prosemirror/index.js";
import { DocumentAgent } from "./agent/DocumentAgent";
import {
	attemptSelectiveSave,
	type SelectiveSaveOptions,
} from "./docx/selectiveSave";
import type { Document } from "./types/document";
import { toArrayBuffer, type DocxInput } from "./utils/docxInput";

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

async function normalizeInput(input: DocxInput): Promise<Uint8Array> {
	const arrayBuffer = await toArrayBuffer(input);
	return Uint8Array.from(new Uint8Array(arrayBuffer));
}

async function createDocumentAgent(input: DocxInput): Promise<DocumentAgent> {
	return DocumentAgent.fromBuffer(input);
}

async function attemptParagraphSelectiveSave(
	document: Document,
	originalBuffer: ArrayBuffer,
	options: SelectiveSaveOptions,
): Promise<Uint8Array | null> {
	const saved = await attemptSelectiveSave(document, originalBuffer, options);
	return saved == null ? null : new Uint8Array(saved);
}

export const casualOfficeJubarteProseMirror = Object.freeze({
	name: "jubarte-prosemirror-docx",
	family: "casualoffice",
	editor: "casualoffice-docx-editor",
	formats: ["docx", "json", "text"] as const,
	schema: docxSchema,
	createHeadlessEditor,
	openDocx,
	wireProseMirrorEngine,
	integration: Object.freeze({
		kind: "document-agent",
		normalizeInput,
		createDocumentAgent,
		attemptParagraphSelectiveSave,
		selectiveSaveStrategy: "casualoffice-w14-paraid",
		changedParagraphIdentity: "w14:paraId",
	}),
});

export type CasualOfficeJubarteProseMirrorAdapter =
	typeof casualOfficeJubarteProseMirror;
