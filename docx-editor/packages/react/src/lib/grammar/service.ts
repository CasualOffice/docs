/**
 * Grammar-check service — the React-side state + engine the core
 * `GrammarExtension` plugs into via `setGrammarChecker`. Mirrors
 * `lib/spellcheck/service.ts`, minus the async dictionary: the default engine
 * is a synchronous, dependency-free rule set (`rules.ts`), so toggling on is
 * instant (no download).
 *
 * Swapping engines later (server / LLM) means replacing `checkImpl` here; the
 * extension and UI are unaffected.
 */
import type { GrammarChecker, GrammarMatch } from '@eigenpal/docx-core/prosemirror/extensions';
import { checkText } from './rules';

let enabled = false;
let version = 0;

export function isGrammarEnabled(): boolean {
  return enabled;
}

/** Flip grammar-check on/off. Bumps the version so the plugin invalidates its
 *  decoration set on the next transaction (or an explicit refresh). */
export function setGrammarEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  version += 1;
}

export function getGrammarVersion(): number {
  return version;
}

/** Pluggable analysis. Default: the curated rule set. */
let checkImpl: (text: string) => GrammarMatch[] = checkText;

/** Replace the analysis engine (e.g. a Writing-Assistant LLM pass). */
export function setGrammarEngine(impl: (text: string) => GrammarMatch[]): void {
  checkImpl = impl;
  version += 1;
}

export function getGrammarCheckerImpl(): GrammarChecker {
  return {
    isEnabled: isGrammarEnabled,
    check: (text: string) => (enabled ? checkImpl(text) : []),
    version: getGrammarVersion,
  };
}
