# oxlint-config

`@kk-forge/oxlint-config`, the shared oxlint configs that KK Forge's TypeScript packages extend. README.md says what each file turns on and how a package uses it, and README.md → Release how a version reaches npm.

- Add a rule to `base.json` when it catches a bug or a security hole and `correctness` does not give it. Leave style rules out.
- `solid.json` follows eslint-plugin-solid's recommended set, all as errors.
- A change to what a file turns on adds a line to `test/fixtures/Broken.tsx` that breaks the rule and the rule to `test/configs.test.mjs`.
