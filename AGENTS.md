# oxlint-config

- `typescript.json` takes a rule only when it catches a bug or a security hole that `correctness` misses. It also turns on `no-console` everywhere but a file named `Logger.ts`, so a package logs through its logger, and `kk-forge/no-index-files`, so a module's surface is its `exports.ts`. No style rules.
- `solid.json` follows eslint-plugin-solid's recommended set.
- `layers.json` turns on `kk-forge/layers`. The rule holds the layer table itself, since oxlint drops `settings` that come through `extends`. A rule change adds a breaking `bad-*` file under `test/layers/src`.
- The plugin `kk-forge` holds the rules `layers`, `no-index-files` and `one-line-entry`. Its source is `src/plugin.ts` with one file per rule, and `mise run build` compiles it into `dist/`, which the package ships. `typescript.json` and `layers.json` both load `dist/plugin.js`, and a config that extends both reports each problem once. git keeps the source only, so `mise run lint` builds first.
- `one-line-entry` is off in the presets. `test/consumer` is an app whose `.oxlintrc.json` turns it on as a consumer does. A change to it or to `no-index-files` adds a case there and to the list in `test/configs.test.ts`.
- A change to an oxlint or eslint-plugin-solid rule in the presets adds a breaking line to `test/fixtures/Broken.tsx` and the rule to `test/configs.test.ts`. `mise run check` runs it.
