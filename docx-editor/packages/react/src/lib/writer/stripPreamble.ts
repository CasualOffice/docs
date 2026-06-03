/**
 * Strip Llama-1B "preamble pollution" — sentences the model
 * compulsively prepends to its answers despite system prompts telling
 * it not to.
 *
 * JSON-mode + `response_format` keeps the OUTER shape valid, but the
 * model still writes `{"rewrite": "Here is the rewritten passage: …"}`
 * because the schema only constrains the JSON tree, not the natural
 * language inside a string value.
 *
 * Strategy: a leading-line regex that matches the common preamble
 * shapes — "Here is …", "Sure, here's …", "I'd be happy to …",
 * "Below is …", "Here are …". Removes ONLY when the preamble appears
 * at the very start, and the cleaned remainder is non-empty. Never
 * touches the middle of the text.
 *
 * Also drops a trailing "Let me know if …" tail, which is the other
 * polite-assistant flourish the model can't resist.
 */

const LEADING_PREAMBLE = new RegExp(
  '^\\s*(?:' +
    // "Here is the rewritten passage:" / "Here is the rewrite:" / "Here is a summary:"
    "Here(?:'s| is| are) (?:the|an?|your)?\\s*(?:rewritten\\s+)?(?:passage|rewrite|summary|translation|outline|version|paragraph|text)(?:\\s+(?:rewritten\\s+)?(?:in[^:]+))?\\s*:?" +
    '|' +
    // "Sure, here's the rewrite:" / "Sure! Here is …"
    "Sure[!,.]*\\s+here(?:'s| is| are)[^:.]*:?" +
    '|' +
    // "I'd be happy to help. Here's:" / "Of course! …"
    "(?:I'd be happy to help|Of course|Certainly|Absolutely)[!,.]*\\s+here(?:'s| is| are)?[^:.]*:?" +
    '|' +
    // "Below is the rewrite:" / "Following is …"
    "Below(?:'s| is| are)?[^:.]*:?" +
    '|' +
    // "Here's a rewritten version:" / "Here's an outline:"
    "Here(?:'s| is| are)\\s+(?:a|an|the)\\s+\\w+(?:\\s+\\w+){0,4}\\s*:?" +
    ')\\s*\\n*\\s*',
  'i'
);

const TRAILING_FLOURISH = new RegExp(
  '\\n*\\s*(?:' +
    "Let me know if[^\\n]*" +
    '|' +
    "Feel free to[^\\n]*" +
    '|' +
    "Hope (?:that|this) (?:helps?|works?)[^\\n]*" +
    '|' +
    "Is there anything[^\\n]*" +
    ')\\s*$',
  'i'
);

const WRAPPING_QUOTES = /^["'`«]\s*([\s\S]*?)\s*["'`»]$/;

export function stripModelPreamble(text: string): string {
  if (!text) return text;
  let out = text;
  const before = out;
  out = out.replace(LEADING_PREAMBLE, '');
  out = out.replace(TRAILING_FLOURISH, '');
  out = out.trim();
  // If the model wrapped the whole reply in quotes after stripping
  // the preamble, peel them off.
  const wrapped = out.match(WRAPPING_QUOTES);
  if (wrapped) out = wrapped[1]!.trim();
  // Safety net — if stripping ate too much, return the original.
  // (e.g. the model's actual reply IS "Here is what …" and that's the
  // whole content.)
  if (!out) return before.trim();
  return out;
}
