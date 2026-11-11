# oxlint-config

- `base.json` takes a rule only when it catches a bug or a security hole that `correctness` misses. No style rules.
- `solid.json` follows eslint-plugin-solid's recommended set.
- A rule change adds a breaking line to `test/fixtures/Broken.tsx` and the rule to `test/configs.test.mjs`. `mise run check` runs it.
