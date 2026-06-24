/**
 * Shared fixture-selection for the visual-fidelity pipeline.
 *
 * Two env knobs, unioned:
 *   VF_ONLY=demo,with-tables   explicit fixture base-names
 *   VF_GROUP=real-world        named sets from groups.json
 *
 * `real-world` is the corpus of actual documents users bring (dense forms,
 * multi-page CJK safety data sheets) — the highest-value fidelity targets.
 * Add new such docs to groups.json so they stay in the pipeline rather than
 * being one-off manual runs.
 */
import { readFileSync } from 'node:fs';

const GROUPS = JSON.parse(readFileSync(new URL('./groups.json', import.meta.url), 'utf8'));

const split = (v) =>
  v
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

/**
 * Resolve the set of fixture base-names to render. Returns `null` when no
 * filter is set, meaning "render the full corpus".
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[] | null}
 */
export function resolveFixtureFilter(env = process.env) {
  const only = split(env.VF_ONLY);
  const fromGroups = split(env.VF_GROUP).flatMap((g) => {
    if (!GROUPS[g]) {
      throw new Error(`VF_GROUP: unknown group "${g}" (known: ${Object.keys(GROUPS).join(', ')})`);
    }
    return GROUPS[g];
  });
  const names = [...new Set([...only, ...fromGroups])];
  return names.length ? names : null;
}
