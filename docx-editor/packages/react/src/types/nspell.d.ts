// Minimal type shim for nspell — the upstream package ships no types
// (https://github.com/wooorm/nspell/issues/14). We only use the slice
// of the API the spell-check service touches; everything else stays
// untyped.

declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): void;
    remove(word: string): void;
  }

  function NSpell(aff: string | Uint8Array, dic: string | Uint8Array): NSpell;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NSpell {}

  export default NSpell;
}

declare module '*.aff?url' {
  const url: string;
  export default url;
}

declare module '*.dic?url' {
  const url: string;
  export default url;
}
