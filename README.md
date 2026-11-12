# @kk-forge/oxlint-config

Shared oxlint configs for KK Forge's TypeScript packages.

- `typescript.json`: the `correctness` category plus the bug-catching rules it lacks and `no-console`, type-aware, warnings fail. A file named `Logger.ts` may call `console`. `kk-forge/no-index-files` rejects a file named `index.ts`, `index.tsx`, `index.js` or `index.jsx`, since tooling resolves that name implicitly. A module's surface is its `exports.ts`.
- `solid.json`: eslint-plugin-solid's recommended rules.
- `layers.json`: the layers `entrypoints → orchestration → features → entities → shared`. A file imports only layers to its right, and entities also each other. It reaches another module only through that module's `exports.ts`, or `exports.<entrypoint>.ts`: a module that has one for an entrypoint folder, such as `exports.background.ts`, serves that entrypoint through it. A `shared` module is one file, which is its own surface, or a folder reached through its `exports.ts`. Only `entrypoints` imports `infra`, which takes `entities` and `shared`. A test in the `tests/` folder beside `src/` may import any layer, `@/` and `~/` included, which name that `src/`. It reaches a module only through its `exports.ts` or an `exports.<entrypoint>.ts`, where a `shared` or `infra` module that is one file is its own surface. It may import any file of an entrypoint, which has no surface. A unit test inside `src/`, such as `foo.unit.test.ts` beside `foo.ts`, follows the rules of its module's other files, so it may import that module's internals.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid`. oxlint resolves `extends` from the config's folder, so give the path:

```json
{
  "extends": [
    "./node_modules/@kk-forge/oxlint-config/typescript.json",
    "./node_modules/@kk-forge/oxlint-config/solid.json"
  ]
}
```

An app adds `"./node_modules/@kk-forge/oxlint-config/layers.json"` as a third entry. A library leaves it out, since the layers describe an app's `src/`. A package's own rules go below `extends` and win.

## Framework entry files

A framework may require a file by name, such as WXT's `entrypoints/<name>/index.ts`. The package's config then holds an override that names those paths and carries its reason. In it `kk-forge/no-index-files` is off and `kk-forge/one-line-entry`, which the presets leave off, is on:

```jsonc
{
  "extends": ["./node_modules/@kk-forge/oxlint-config/typescript.json"],
  "overrides": [
    // WXT finds a folder entrypoint only by its index.ts, so these files keep the name and hold one line.
    {
      "files": ["src/entrypoints/*/index.ts"],
      "rules": { "kk-forge/no-index-files": "off", "kk-forge/one-line-entry": "error" },
    },
  ],
}
```

`kk-forge/one-line-entry` allows imports and one line, which keeps the logic in the `start…()` or `mount…()` the line calls. Each form below holds one call: a named function called with identifiers, literals or property reads such as `ctx.signal`, which may stand under `void` or `await`. The line is one of these:

- The call itself, such as `startPopup()`.
- The framework's definition around an arrow: `export default defineBackground(() => startBackground())`. The arrow's body is the call or a block that holds only the call, as in `async () => { await startBackground(); }`.
- The framework's definition around an options object: `export default defineContentScript({ matches: ["*://*/*"], main: (ctx) => mountOverlay(ctx) })`. One property is a function, written as an arrow, a method or `function`, whose body is the call or a block that holds only the call. Every other property holds a string, a number, a negative number, a boolean, `null`, a template without expressions, or an array or object of these.

In both definitions the function's parameters are plain names, with no defaults.

## Development

`mise run setup` installs the packages. `mise run check` type-checks, lints and formats, builds the plugin in `src/` into `dist/`, and runs the fixtures through the configs and the packed plugin.

## Release

Raise `version` in package.json and merge to main. CI publishes to npm once the `production` environment approves.
