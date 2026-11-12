# oxlint-config

- `base.json` takes a rule only when it catches a bug or a security hole that `correctness` misses. It also turns on `no-console` everywhere but a file named `Logger.ts`, so a package logs through its logger. No style rules.
- `solid.json` follows eslint-plugin-solid's recommended set.
- `slices.json` writes every `no-restricted-imports` pattern as a regex. oxlint merges `group` patterns into one matcher, where a negation in one lifts a ban in another. Its regex has no lookahead, so "a segment other than `exports`" is spelled out from the word's prefixes. An override's patterns replace the top-level ones, so each override repeats the `exports.ts` rule. A rule change adds a breaking `bad-*` file under `test/slices/src`.
- A rule change adds a breaking line to `test/fixtures/Broken.tsx` and the rule to `test/configs.test.mjs`. `mise run check` runs it.
