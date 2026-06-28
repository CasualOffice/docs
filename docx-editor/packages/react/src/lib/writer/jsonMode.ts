/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * JSON-mode helper for the writer pipeline.
 *
 * Llama-3.2-1B is too small to write coherent free-form documents on
 * its own — but WebLLM's `response_format: { type: 'json_object',
 * schema }` clamps the model's vocabulary at every decoding step so
 * it can only emit tokens that keep the output syntactically valid.
 * That turns the 1B into a workable *structured* extractor: given a
 * topic, it can decide which fields to populate in a fixed schema,
 * which is exactly what tools like `insertTable` and the intent
 * classifier need.
 *
 * Two helpers:
 *
 *   - `runJsonChat<T>(messages, jsonSchema)` — wraps the controller's
 *     `runChat` with `responseFormat`, parses the reply, validates
 *     it's an object, and returns it typed.
 *   - `tryParseJson` — defensive parser for the (rare) case where the
 *     constrained engine still emits unparseable output (model OOM,
 *     truncation at `max_tokens`). Returns `null` instead of throwing
 *     so callers can fall back gracefully.
 */

import { runChat } from './controller';

export interface JsonChatOptions {
  /** Stringified JSON Schema. Optional — `json_object` alone keeps
   *  the model in JSON but lets it pick its own keys. */
  schema?: object;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export async function runJsonChat<T = unknown>(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: JsonChatOptions = {}
): Promise<T> {
  const raw = await runChat(messages, {
    responseFormat: {
      type: 'json_object',
      schema: opts.schema ? JSON.stringify(opts.schema) : undefined,
    },
    maxTokens: opts.maxTokens ?? 512,
    // Lower temperature for structured generation — variety hurts
    // when the schema already pins the shape.
    temperature: opts.temperature ?? 0.2,
    signal: opts.signal,
  });
  const parsed = tryParseJson<T>(raw);
  if (parsed === null) {
    throw new Error(`Model returned invalid JSON: ${raw.slice(0, 120)}`);
  }
  return parsed;
}

export function tryParseJson<T = unknown>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Strip ``` fences if a model wraps the JSON despite response_format
  // (older WebLLM builds occasionally do for the first chunk).
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Try to recover by finding the first JSON object substring.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
