/**
 * Random 8-char uppercase hex id, matching Microsoft's `w14:paraId`
 * extension format (also reused for comment `paraId` / `durableId`).
 *
 * Uses `Math.random()` rather than `crypto.randomUUID()` so the
 * generator works in non-secure contexts (file://, web workers).
 */
export function generateHexId(): string {
  return Math.floor(Math.random() * 0x100000000)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0');
}
