# oxlint-config

- `base.json` takes a rule only when it catches a bug or a security hole that `correctness` misses. It also turns on `no-console` everywhere but a file named `Logger.ts`, so a package logs through its logger. No style rules.
- `solid.json` follows eslint-plugin-solid's recommended set.
- `slices.json` turns on `kk-forge/slices`, the rule in `slices.mjs`. The rule holds the layer table itself, since oxlint drops `settings` that come through `extends`. A rule change adds a breaking `bad-*` file under `test/slices/src`.
- A rule change adds a breaking line to `test/fixtures/Broken.tsx` and the rule to `test/configs.test.mjs`. `mise run check` runs it.
