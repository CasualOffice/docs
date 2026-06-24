/**
 * Spell-check service — lazy-loaded Hunspell engine (nspell + en_US
 * dictionary). Single module-level instance shared across the app.
 *
 * The PM `SpellcheckExtension` lives in `@eigenpal/docx-core` and has
 * no idea how to look words up; it calls into the shared accessors
 * below, which the React package wires once the dictionary download
 * has finished. Until then, `isMisspelled()` returns `false` for every
 * word — so the editor renders cleanly while the ~500 KB dict streams.
 *
 * Why a singleton: a casual editor only runs one document at a time,
 * the dictionary is identical for everyone, and loading it twice would
 * waste memory + bandwidth. The Tools-menu toggle flips
 * `setSpellEnabled` so the extension can early-return without throwing
 * decorations into the void.
 */

import NSpell from 'nspell';

// Asset URLs are injected at runtime by the consumer (see
// `setSpellAssetUrls`). The library can't pre-bundle them via `?url`
// because tsup — which builds the published package — has no loader
// for `.aff` / `.dic`, so any inline import here breaks `bun run
// build`. Vite-built apps (including our `examples/vite` demo)
// resolve `?url` natively and call `setSpellAssetUrls` on mount.
let affUrl: string | null = null;
let dicUrl: string | null = null;

/**
 * Tell the spell-check loader where to fetch the Hunspell dictionary.
 * Call this once at editor mount before the first `loadSpellChecker()`.
 * URLs can be absolute (CDN) or relative; the loader just `fetch()`es
 * them and treats the bodies as text.
 */
export function setSpellAssetUrls(aff: string, dic: string): void {
  affUrl = aff;
  dicUrl = dic;
}

let spell: NSpell | null = null;
let loadPromise: Promise<NSpell> | null = null;
let enabled = false;
// Bumps whenever the engine's view of the world changes (toggle flipped,
// dictionary just loaded, a word was ignored). The PM extension reads
// this and rebuilds its DecorationSet when it shifts.
let stateVersion = 0;

// `ignored` is the cache of words the user told us to ignore for this
// session. (We don't yet persist a personal dictionary — that's a v2 thing.)
const ignored = new Set<string>();

/**
 * True when the user has asked for spell-check (Tools → Spell check).
 * The PM extension reads this on every transaction; flipping it off
 * removes the decoration overhead immediately.
 */
export function isSpellEnabled(): boolean {
  return enabled;
}

/**
 * Flip the runtime toggle. Returns the new value so callers can do
 * `setSpellEnabled(!isSpellEnabled())` and use the result.
 */
export function setSpellEnabled(next: boolean): boolean {
  if (enabled !== next) {
    enabled = next;
    stateVersion++;
  }
  return enabled;
}

/** Version counter exposed to the PM extension so it can detect on/off + dict-load. */
export function getSpellVersion(): number {
  return stateVersion;
}

/**
 * Begin downloading the dictionary (idempotent). Resolves when the
 * engine is ready. Callers can `await` this before flipping `enabled`
 * if they want the user to see "Loading…" before the first squiggles.
 */
export function loadSpellChecker(): Promise<NSpell> {
  if (spell) return Promise.resolve(spell);
  if (loadPromise) return loadPromise;
  if (!affUrl || !dicUrl) {
    return Promise.reject(
      new Error(
        'spellcheck assets not configured — call setSpellAssetUrls(aff, dic) at editor mount'
      )
    );
  }
  const aff = affUrl;
  const dic = dicUrl;
  loadPromise = (async () => {
    const [affRes, dicRes] = await Promise.all([fetch(aff), fetch(dic)]);
    if (!affRes.ok || !dicRes.ok) throw new Error('dict-fetch-failed');
    const [affText, dicText] = await Promise.all([affRes.text(), dicRes.text()]);
    const engine = NSpell(affText, dicText);
    spell = engine;
    stateVersion++;
    return engine;
  })();
  return loadPromise;
}

/**
 * True when the word is **definitely** misspelled. Unknown / not-yet-
 * loaded state returns `false` so we never flag false-positives during
 * the dictionary download. Words the user told us to ignore are
 * silently treated as correct.
 */
export function isMisspelled(word: string): boolean {
  if (!enabled || !spell) return false;
  if (ignored.has(word)) return false;
  // Hunspell is case-sensitive by default; common proper nouns are
  // capitalised in the dict, but a user typing them lowercase would
  // see them flagged. Try both cases before giving up.
  if (spell.correct(word)) return false;
  const lower = word.toLowerCase();
  if (lower !== word && spell.correct(lower)) return false;
  return true;
}

/**
 * Return up to `limit` suggestions for the given word. Empty array if
 * the dictionary hasn't loaded yet or there are no suggestions.
 */
export function suggestionsFor(word: string, limit = 6): string[] {
  if (!spell) return [];
  return spell.suggest(word).slice(0, limit);
}

/**
 * Mark a word as "don't flag this again" for the current session.
 */
export function ignoreWord(word: string): void {
  ignored.add(word);
  stateVersion++;
}

/**
 * Bind the React-side service to the core extension. Call once at
 * editor mount; subsequent toggles flip through `setSpellEnabled`.
 */
export function getSpellCheckerImpl(): {
  isEnabled: () => boolean;
  isMisspelled: (word: string) => boolean;
  version: () => number;
} {
  return {
    isEnabled: isSpellEnabled,
    isMisspelled,
    version: getSpellVersion,
  };
}

/**
 * For tests: drop the loaded state.
 */
export function resetSpellCheckerForTests(): void {
  spell = null;
  loadPromise = null;
  enabled = false;
  ignored.clear();
}
