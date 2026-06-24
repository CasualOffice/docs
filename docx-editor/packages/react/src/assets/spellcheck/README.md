English Hunspell dictionary, vendored from
[`dictionary-en` v4.0.0](https://github.com/wooorm/dictionaries/tree/main/dictionaries/en).

Vendored (instead of imported from `node_modules`) because the package's
`exports` field doesn't expose the `.aff` / `.dic` assets directly, which
blocks Vite's `?url` resolution. Copying the two files into `src/assets/`
lets the bundler treat them as regular static assets and emit them with
hashed URLs.

License: **(MIT AND BSD)** — see upstream.
